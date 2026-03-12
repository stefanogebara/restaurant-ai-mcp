/**
 * AI Strategy Document API
 *
 * Authenticated endpoints for restaurant owners to manage their AI strategy document.
 * Implements the Karpathy autoresearch loop pattern:
 *   1. Human writes strategy doc (program.md)
 *   2. AI executes using strategy as context (nightly briefings + voice agent)
 *   3. AI suggests improvements based on metrics
 *   4. Human updates strategy → repeat
 *
 * Actions:
 *   GET  ?action=get     - Fetch current strategy document
 *   PATCH ?action=update - Save strategy document
 *   POST ?action=suggest - Generate AI suggestions from current metrics
 */

const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { initSentry, captureException } = require('./_lib/sentry');
const Anthropic = require('@anthropic-ai/sdk');
initSentry();

const logger = createSecureLogger('AIStrategy');

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const restaurantId = auth.user?.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant configured' });
  }

  const action = req.query.action || (req.body && req.body.action);

  try {
    switch (action) {
      case 'get':
        return await handleGet(req, res, restaurantId);
      case 'update':
        return await handleUpdate(req, res, restaurantId);
      case 'suggest':
        return await handleSuggest(req, res, restaurantId);
      default:
        return res.status(400).json({ success: false, error: 'Invalid action. Use: get, update, suggest' });
    }
  } catch (error) {
    captureException(error, { url: req.url, method: req.method });
    logger.error('AI strategy error:', error);
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
};

// ── GET ?action=get ──────────────────────────────────────────────────────────
async function handleGet(req, res, restaurantId) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('ai_strategy_doc, ai_strategy_updated_at, restaurant_name')
    .eq('id', restaurantId)
    .single();

  if (error) {
    // Column may not exist yet if migration hasn't been applied
    if (error.message?.includes('column') && error.message?.includes('ai_strategy_doc')) {
      return res.status(200).json({
        success: true,
        data: { strategy_doc: '', updated_at: null, restaurant_name: '' },
        migration_pending: true,
      });
    }
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }
  if (!data) {
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }

  return res.status(200).json({
    success: true,
    data: {
      strategy_doc: data.ai_strategy_doc || '',
      updated_at: data.ai_strategy_updated_at || null,
      restaurant_name: data.restaurant_name,
    },
  });
}

// ── PATCH ?action=update ─────────────────────────────────────────────────────
async function handleUpdate(req, res, restaurantId) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use PATCH.' });
  }

  const { strategy_doc } = req.body || {};
  if (typeof strategy_doc !== 'string') {
    return res.status(400).json({ success: false, error: 'strategy_doc (string) is required' });
  }

  if (strategy_doc.length > 10000) {
    return res.status(400).json({ success: false, error: 'Strategy document too long (max 10,000 characters)' });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({
      ai_strategy_doc: strategy_doc || null,
      ai_strategy_updated_at: new Date().toISOString(),
    })
    .eq('id', restaurantId)
    .select('ai_strategy_doc, ai_strategy_updated_at')
    .single();

  if (error) {
    logger.error('Failed to update AI strategy doc:', error);
    return res.status(500).json({ success: false, error: 'Failed to save strategy document' });
  }

  logger.info(`AI strategy updated for ${restaurantId}`);

  return res.status(200).json({
    success: true,
    data: {
      strategy_doc: data.ai_strategy_doc,
      updated_at: data.ai_strategy_updated_at,
    },
  });
}

// ── POST ?action=suggest ─────────────────────────────────────────────────────
// Generates AI-powered strategy suggestions based on current metrics
async function handleSuggest(req, res, restaurantId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ success: false, error: 'AI service not configured' });
  }

  // Fetch current strategy + metrics in parallel
  const [configRes, metricsRes] = await Promise.all([
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, ai_strategy_doc, restaurant_profile')
      .eq('id', restaurantId)
      .single(),
    fetchStrategyMetrics(restaurantId),
  ]);

  const config = configRes.data || {};
  const metrics = metricsRes;

  const metricsBlock = buildMetricsBlock(metrics);
  const currentStrategy = config.ai_strategy_doc
    ? `Current strategy:\n${config.ai_strategy_doc}`
    : 'No strategy document yet — suggest an initial strategy.';

  const prompt = `You are a restaurant business advisor analyzing data for ${config.restaurant_name || 'this restaurant'}.

${currentStrategy}

${metricsBlock}

Based on these metrics, provide 3 specific, actionable strategy improvements. Each suggestion should:
1. Reference a specific metric that motivated it
2. Suggest a concrete change to the AI agent behavior or business operations
3. Include what success looks like (measurable outcome)

Format as numbered list. Be specific and data-driven. Under 250 words total.`;

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const suggestions = response.content[0]?.text || '';

  // Store suggestion in manager memory so it appears in briefings
  try {
    const { writeMemory } = require('./_lib/manager-agent');
    if (writeMemory) {
      await writeMemory(restaurantId, 'insight', 'strategy',
        `[AI STRATEGY SUGGESTION]\n${suggestions}`, 'ai_strategy', 6);
    }
  } catch (_) {
    // non-blocking
  }

  return res.status(200).json({
    success: true,
    data: { suggestions },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchStrategyMetrics(restaurantId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

  const [reservationsRes, noShowRes, serviceRes] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, status', { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .gte('date', dateStr),
    supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', 'no_show')
      .gte('date', dateStr),
    supabaseAdmin
      .from('service_records')
      .select('total_bill, party_size')
      .eq('restaurant_id', restaurantId)
      .gte('seated_at', thirtyDaysAgo.toISOString())
      .not('total_bill', 'is', null),
  ]);

  // Gracefully handle missing tables/columns — return zero metrics
  const totalReservations = reservationsRes.error ? 0 : (reservationsRes.count || 0);
  const noShows = noShowRes.error ? 0 : (noShowRes.count || 0);
  const noShowRate = totalReservations > 0 ? ((noShows / totalReservations) * 100).toFixed(1) : 'N/A';

  const serviceRecords = serviceRes.data || [];
  const avgRevenue = serviceRecords.length >= 5
    ? (serviceRecords.reduce((s, r) => s + (parseFloat(r.total_bill) || 0), 0) / serviceRecords.length).toFixed(2)
    : null;

  const avgCoverRevenue = serviceRecords.length >= 5
    ? (serviceRecords.reduce((s, r) => s + (parseFloat(r.total_bill) || 0) / (r.party_size || 1), 0) / serviceRecords.length).toFixed(2)
    : null;

  return {
    period: 'last 30 days',
    total_reservations: totalReservations,
    no_show_count: noShows,
    no_show_rate: noShowRate,
    avg_bill: avgRevenue,
    avg_revenue_per_cover: avgCoverRevenue,
    data_points: serviceRecords.length,
  };
}

function buildMetricsBlock(metrics) {
  let block = '[METRICS — ' + metrics.period.toUpperCase() + ']\n';
  block += `Total reservations: ${metrics.total_reservations}\n`;
  block += `No-show rate: ${metrics.no_show_rate}%\n`;
  if (metrics.avg_bill) {
    block += `Avg bill: €${metrics.avg_bill}\n`;
  }
  if (metrics.avg_revenue_per_cover) {
    block += `Avg revenue per cover: €${metrics.avg_revenue_per_cover}\n`;
  }
  if (metrics.data_points < 5) {
    block += `Note: Limited data (${metrics.data_points} records) — suggestions are directional.\n`;
  }
  return block;
}
