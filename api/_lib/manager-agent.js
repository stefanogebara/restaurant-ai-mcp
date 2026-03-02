/**
 * Manager Agent Handler
 *
 * Shared handler for both in-app chat and WhatsApp channels.
 * Routes all messages through the same memory + snapshot + conversation logic.
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const { retrieveRelevantMemories, writeMemory } = require('../services/managerMemory');
const { getRestaurantSnapshot } = require('../services/restaurantSnapshot');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');
const { getPlanLimits } = require('../services/subscription-limits');
const { trackUsage } = require('./usage-tracking');

const logger = createSecureLogger('manager-agent');

class ManagerQuotaError extends Error {
  constructor(type, data = {}) {
    super(type);
    this.name = 'ManagerQuotaError';
    this.type = type;           // 'upgrade_required' | 'quota_exceeded'
    this.used = data.used;
    this.limit = data.limit;
    this.plan = data.plan;
  }
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const HISTORY_LIMIT = 20;

// Fact patterns that trigger background memory extraction
const FACT_PATTERNS = [
  /we (open|close|serve|offer|have|use)/i,
  /our (menu|policy|staff|hours|special)/i,
];

let anthropicClient = null;

function getAnthropic() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

async function getRestaurantPlan(restaurantId) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_name, status')
    .eq('restaurant_id', restaurantId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();
  if (error) {
    logger.error('getRestaurantPlan failed', { restaurantId, error: error.message });
    throw error;
  }
  return (data?.plan_name || 'free').toLowerCase();
}

async function getManagerAIUsageThisMonth(restaurantId) {
  const now = new Date();
  const firstDay = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabaseAdmin
    .from('usage_tracking')
    .select('count')
    .eq('restaurant_id', restaurantId)
    .eq('metric_type', 'manager_ai_call')
    .gte('period', firstDay);
  if (error) {
    logger.error('getManagerAIUsageThisMonth failed', { restaurantId, error: error.message });
    throw error;
  }
  return (data || []).reduce((sum, row) => sum + (row.count || 0), 0);
}

async function getConversationHistory(restaurantId) {
  const { data, error } = await supabaseAdmin
    .from('manager_conversations')
    .select('role, content')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) {
    logger.error('getConversationHistory failed', { restaurantId, error: error.message });
  }
  return (data || []).reverse();
}

async function saveTurn(restaurantId, role, content, channel) {
  const { error } = await supabaseAdmin.from('manager_conversations').insert({
    restaurant_id: restaurantId,
    role,
    content,
    channel,
  });
  if (error) {
    logger.error('saveTurn failed', { restaurantId, role, error: error.message });
  }
}

function buildSystemPrompt(memories, snapshot) {
  const memoryBlock =
    memories.length > 0
      ? memories
          .map((m) => '[' + m.type.toUpperCase() + '/' + m.category + '] ' + m.content)
          .join('\n')
      : 'No memories stored yet.';

  const upcomingLines = snapshot.upcoming_reservations
    .slice(0, 5)
    .map(
      (r) =>
        '  - ' +
        r.guest_name +
        ', party of ' +
        r.party_size +
        ' at ' +
        new Date(r.reservation_time).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        })
    )
    .join('\n');

  const staffingLines = (snapshot.staffing_forecast || [])
    .map(f => f.day + ' ' + f.date + ': ' + f.expected_covers + ' covers → ' +
      f.roles.map(r => r.name + ': ' + r.recommended).join(', '))
    .join('\n');

  let systemPrompt =
    'You are the AI manager assistant for this restaurant. ' +
    'You know the restaurant deeply and help the manager run their business.\n\n' +
    '## What You Know About This Restaurant\n' +
    memoryBlock +
    '\n\n## Current Live Status\n' +
    'Upcoming reservations: ' + snapshot.upcoming_reservations.length + '\n' +
    upcomingLines + '\n' +
    'Active parties: ' + snapshot.active_parties.length + '\n' +
    'Waitlist: ' + snapshot.waitlist_count;

  if (staffingLines) {
    systemPrompt += '\n\n[STAFFING FORECAST - NEXT 3 DAYS]\n' + staffingLines;
  }

  if (snapshot.deposit_summary && snapshot.deposit_summary.count > 0) {
    const { count, total_amount } = snapshot.deposit_summary;
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(total_amount);
    systemPrompt += `\n\n[DEPOSITS HELD TONIGHT]\n${count} reservation${count !== 1 ? 's' : ''} with deposits held — total ${formatted} at risk of no-show capture.`;
  }

  systemPrompt +=
    '\n\nRespond concisely. For operational questions, be direct. ' +
    'Keep responses under 200 words unless detail is specifically requested.';

  return systemPrompt;
}

async function extractFactsFromConversation(restaurantId, userMessage) {
  if (!FACT_PATTERNS.some((p) => p.test(userMessage))) return;
  await writeMemory(
    restaurantId,
    'fact',
    'general',
    userMessage.slice(0, 500),
    'conversation',
    4
  );
}

async function runManagerAgent(restaurantId, userMessage, channel) {
  // ── Quota gate ──────────────────────────────────────────────
  const plan = await getRestaurantPlan(restaurantId);
  const planLimits = getPlanLimits(plan);
  const monthlyLimit = planLimits?.managerAICallsMonthly ?? 0;

  if (monthlyLimit === 0) {
    throw new ManagerQuotaError('upgrade_required', { plan });
  }

  if (monthlyLimit !== -1) {
    const used = await getManagerAIUsageThisMonth(restaurantId);
    if (used >= monthlyLimit) {
      throw new ManagerQuotaError('quota_exceeded', { used, limit: monthlyLimit });
    }
  }
  // ─────────────────────────────────────────────────────────────

  const [memories, snapshot, history] = await Promise.all([
    retrieveRelevantMemories(restaurantId, userMessage),
    getRestaurantSnapshot(restaurantId),
    getConversationHistory(restaurantId),
  ]);

  const systemPrompt = buildSystemPrompt(memories, snapshot);
  const messages = [
    ...history.map((h) => ({
      role: h.role === 'manager' ? 'user' : 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages,
  });

  const firstBlock = response.content?.[0];
  if (!firstBlock || firstBlock.type !== 'text') {
    throw new Error('Unexpected Claude response structure');
  }
  const assistantText = firstBlock.text;

  await Promise.all([
    saveTurn(restaurantId, 'manager', userMessage, channel),
    saveTurn(restaurantId, 'assistant', assistantText, channel),
  ]);

  // Fire-and-forget: extract facts without blocking the response
  extractFactsFromConversation(restaurantId, userMessage).catch((err) => {
    logger.error('extractFactsFromConversation failed', { error: err.message });
  });

  // Fire-and-forget usage tracking
  trackUsage(restaurantId, 'manager_ai_call');

  return assistantText;
}

module.exports = { runManagerAgent, ManagerQuotaError };
