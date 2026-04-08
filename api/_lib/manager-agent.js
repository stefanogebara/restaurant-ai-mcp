/**
 * Manager Agent Handler
 *
 * Shared handler for both in-app chat and WhatsApp channels.
 * Routes all messages through the same memory + snapshot + conversation logic.
 */

const { getAI, AI_MODEL } = require('./ai-client');
const { retrieveRelevantMemories, writeMemory } = require('../services/managerMemory');
const { getRestaurantSnapshot } = require('../services/restaurantSnapshot');
const { buildRestaurantIdentitySection } = require('./persona-prompt-builder');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');
const { getPlanLimits } = require('../services/subscription-limits');
const { trackUsage } = require('./usage-tracking');
const { comparePeriods } = require('./periodCompare');

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

const HISTORY_LIMIT = 20;

const VALID_PERIODS = [
  'last_7_days', 'last_30_days',
  'this_week', 'last_week',
  'this_month', 'last_month',
];

const MANAGER_TOOLS = [
  {
    name: 'compare_periods',
    description:
      'Compare reservation and cover metrics between two time periods for this restaurant. ' +
      'Use this when the manager asks how this week/month compares to last week/month, or asks about trends.',
    input_schema: {
      type: 'object',
      properties: {
        period_a: {
          type: 'string',
          enum: VALID_PERIODS,
          description: 'The baseline period (e.g. last_week)',
        },
        period_b: {
          type: 'string',
          enum: VALID_PERIODS,
          description: 'The comparison period (e.g. this_week)',
        },
      },
      required: ['period_a', 'period_b'],
    },
  },
];

// Fact patterns that trigger background memory extraction
const FACT_PATTERNS = [
  /we (open|close|serve|offer|have|use)/i,
  /our (menu|policy|staff|hours|special)/i,
];

async function getRestaurantPlan(restaurantId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_name, status')
      .eq('restaurant_id', restaurantId)
      .in('status', ['active', 'trialing'])
      .maybeSingle();
    if (error) {
      logger.error('getRestaurantPlan failed', { restaurantId, error: error.message });
      return 'free';
    }
    return (data?.plan_name || 'free').toLowerCase();
  } catch (err) {
    logger.error('getRestaurantPlan unexpected error', { restaurantId, error: err.message });
    return 'free';
  }
}

async function getManagerAIUsageThisMonth(restaurantId) {
  try {
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
      return 0;
    }
    return (data || []).reduce((sum, row) => sum + (row.count || 0), 0);
  } catch (err) {
    logger.error('getManagerAIUsageThisMonth unexpected error', { restaurantId, error: err.message });
    return 0;
  }
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

function buildSystemPrompt(memories, snapshot, config) {
  const restaurantName = config?.restaurant_name || config?.name || 'this restaurant';
  const language = config?.agent_language || config?.language || 'en';

  const memoryBlock =
    memories.length > 0
      ? memories
          .map((m) => '[' + m.type.toUpperCase() + '/' + m.category + '] ' + m.content)
          .join('\n')
      : 'No memories stored yet.';

  const upcomingLines = snapshot.upcoming_reservations
    .slice(0, 5)
    .map((r) => {
      const vipTag = r.customer_tier === 'vip'
        ? ' ★VIP'
        : r.customer_tier === 'regular'
          ? ' ★regular'
          : '';
      const visitInfo = r.visit_count ? ` (${r.visit_count} visits)` : '';
      const dietaryInfo = r.dietary_preferences?.length ? ` [DIETARY: ${r.dietary_preferences.join(', ')}]` : '';
      const occasionInfo = r.special_occasions
        ? Object.entries(r.special_occasions)
          .filter(([k]) => !k.startsWith('_'))
          .map(([type]) => type)
          .join(', ')
        : '';
      const seatingInfo = r.special_occasions?._seating_preference ? ` [SEATING: ${r.special_occasions._seating_preference}]` : '';
      const crmTags = [dietaryInfo, occasionInfo ? ` [${occasionInfo}]` : '', seatingInfo].filter(Boolean).join('');
      return (
        '  - ' +
        r.guest_name +
        vipTag +
        visitInfo +
        crmTags +
        ', party of ' +
        r.party_size +
        ' at ' +
        new Date(r.reservation_time).toLocaleTimeString(
          language === 'pt' || language === 'pt-BR' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US',
          { hour: '2-digit', minute: '2-digit' }
        )
      );
    })
    .join('\n');

  const staffingLines = (snapshot.staffing_forecast || [])
    .map(f => f.day + ' ' + f.date + ': ' + f.expected_covers + ' covers → ' +
      f.roles.map(r => r.name + ': ' + r.recommended).join(', '))
    .join('\n');

  // Build identity section
  const identitySection = buildRestaurantIdentitySection(config || {});

  const toneDirective = '';

  const langLabel =
    language === 'pt' || language === 'pt-BR' ? 'Brazilian Portuguese (PT-BR)' :
    language === 'es' ? 'Spanish' :
    language === 'fr' ? 'French' :
    language === 'it' ? 'Italian' :
    'English';

  let systemPrompt =
    language === 'pt' || language === 'pt-BR'
      ? `Voce e o gerente IA do ${restaurantName}. Voce conhece este restaurante profundamente e ajuda o gerente a administrar o negocio.\n\nCRITICAL: Responda SEMPRE em Portugues Brasileiro. NUNCA responda em ingles ou outro idioma.\n\n`
      : language === 'es'
        ? `Eres el gerente IA de ${restaurantName}. Conoces este restaurante profundamente y ayudas al gerente a administrar el negocio.\n\nCRITICAL: Responde SIEMPRE en Espanol. NUNCA respondas en ingles u otro idioma.\n\n`
        : `You are the AI manager for ${restaurantName}. You know this restaurant deeply and help the manager run their business.\n\n`;

  // Inject restaurant soul between role and operational data
  if (identitySection) {
    systemPrompt += identitySection;
  }

  if (toneDirective) {
    systemPrompt += toneDirective + '\n\n';
  }

  systemPrompt +=
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
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(total_amount);
    systemPrompt += `\n\n[DEPOSITS HELD TONIGHT]\n${count} reservation${count !== 1 ? 's' : ''} with deposits held — total ${formatted} at risk of no-show capture.`;
  }

  if (snapshot.feedback_summary && snapshot.feedback_summary.total > 0) {
    const fb = snapshot.feedback_summary;
    let feedbackBlock = `\n\n[RECENT GUEST FEEDBACK — LAST 7 DAYS]`;
    if (fb.avg_rating != null) {
      feedbackBlock += `\nAvg rating: ${fb.avg_rating}/5 (${fb.answered_count} responses, ${fb.response_rate}% response rate)`;
    }
    if (fb.recent?.length > 0) {
      const latest = fb.recent[0];
      feedbackBlock += `\nLatest: "${latest.comment || 'No comment'}" (${latest.rating}★) — ${latest.customer_name || 'Anonymous'}`;
    }
    systemPrompt += feedbackBlock;
  }

  // Strategy doc removed — column doesn't exist yet

  // Language enforcement — always use the restaurant's configured language
  systemPrompt +=
    '\n\n## Language Rules\n' +
    `CRITICAL: You MUST respond in ${langLabel} at ALL times. ` +
    `This restaurant is configured for ${langLabel}. ` +
    'Do NOT switch languages based on the user\'s input language. ' +
    `Always respond in ${langLabel}, no exceptions.\n`;

  systemPrompt +=
    '\n\n## Response Style Rules\n' +
    '- Be CONCISE. Default to 3-5 sentences. Only give full briefings when explicitly asked.\n' +
    '- For specific questions ("how many reservations?"), give the answer FIRST in one line, then optional context.\n' +
    '- Do NOT use headers, bullet points, or structured formatting unless the user asks for a "briefing" or "report".\n' +
    '- Do NOT use emojis. Ever. No exceptions.\n' +
    '- Do NOT repeat the same information across multiple messages.\n' +
    '- If the restaurant has zero data (0 reservations, 0 covers for multiple days), do NOT panic or say "CRITICAL ALERT". ' +
    'Instead say something like "Tudo tranquilo por aqui" and suggest checking back when there is more data.\n' +
    '- Match your response length to the question: short question = short answer.\n' +
    '- When comparing periods, focus on the delta and one actionable insight, not a wall of numbers.\n';

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

  const [memories, snapshot, history, configResult] = await Promise.all([
    retrieveRelevantMemories(restaurantId, userMessage),
    getRestaurantSnapshot(restaurantId),
    getConversationHistory(restaurantId),
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, name, agent_language')
      .eq('id', restaurantId)
      .maybeSingle(),
  ]);

  const config = configResult?.data || {};
  const systemPrompt = buildSystemPrompt(memories, snapshot, config);
  const messages = [
    ...history.map((h) => ({
      role: h.role === 'manager' ? 'user' : 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const response = await getAI().messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
    tools: MANAGER_TOOLS,
  });

  let assistantText;

  if (response.stop_reason === 'tool_use') {
    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (toolBlock?.name === 'compare_periods') {
      const { period_a, period_b } = toolBlock.input;
      const compResult = await comparePeriods(restaurantId, period_a, period_b);

      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(compResult),
            },
          ],
        },
      ];

      const finalResponse = await getAI().messages.create({
        model: AI_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: followUpMessages,
        tools: MANAGER_TOOLS,
      });

      const textBlock = finalResponse.content?.find((b) => b.type === 'text');
      assistantText = textBlock?.text;
    }
  }

  if (!assistantText) {
    const textBlock = response.content?.find((b) => b.type === 'text');
    if (!textBlock) {
      throw new Error('Unexpected Claude response structure');
    }
    assistantText = textBlock.text;
  }

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

/**
 * Streaming variant of runManagerAgent.
 * Calls onToken(text) for each text delta, returns full assistantText.
 */
async function runManagerAgentStream(restaurantId, userMessage, channel, onToken) {
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

  const [memories, snapshot, history, configResult] = await Promise.all([
    retrieveRelevantMemories(restaurantId, userMessage),
    getRestaurantSnapshot(restaurantId),
    getConversationHistory(restaurantId),
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, name, agent_language')
      .eq('id', restaurantId)
      .maybeSingle(),
  ]);

  const config = configResult?.data || {};
  const systemPrompt = buildSystemPrompt(memories, snapshot, config);
  const messages = [
    ...history.map((h) => ({
      role: h.role === 'manager' ? 'user' : 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  let assistantText = '';

  async function streamCall(msgs) {
    const stream = getAI().messages.stream({
      model: AI_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: msgs,
      tools: MANAGER_TOOLS,
    });

    stream.on('text', (text) => {
      assistantText += text;
      onToken(text);
    });

    return stream.finalMessage();
  }

  const response = await streamCall(messages);

  if (response.stop_reason === 'tool_use') {
    assistantText = '';
    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (toolBlock?.name === 'compare_periods') {
      const { period_a, period_b } = toolBlock.input;
      const compResult = await comparePeriods(restaurantId, period_a, period_b);

      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(compResult),
            },
          ],
        },
      ];

      await streamCall(followUpMessages);
    }
  }

  if (!assistantText) {
    throw new Error('Unexpected Claude response structure');
  }

  await Promise.all([
    saveTurn(restaurantId, 'manager', userMessage, channel),
    saveTurn(restaurantId, 'assistant', assistantText, channel),
  ]);

  extractFactsFromConversation(restaurantId, userMessage).catch((err) => {
    logger.error('extractFactsFromConversation failed', { error: err.message });
  });

  trackUsage(restaurantId, 'manager_ai_call');

  return assistantText;
}

module.exports = { runManagerAgent, runManagerAgentStream, ManagerQuotaError };
