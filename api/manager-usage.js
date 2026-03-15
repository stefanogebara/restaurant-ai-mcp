'use strict';

const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { getPlanLimits } = require('./services/subscription-limits');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('manager-usage');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rateLimited = await checkAndApplyRateLimit(req, res, 'manager_usage', 60, 60);
  if (rateLimited) return;

  let restaurantId;
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user || !user.restaurant_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    restaurantId = user.restaurant_id;
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_name')
      .eq('restaurant_id', restaurantId)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    if (subError) {
      logger.error('manager-usage: subscriptions query failed', { error: subError.message });
      return res.status(500).json({ error: 'Internal error' });
    }

    const plan = (sub?.plan_name || 'free').toLowerCase();
    const limits = getPlanLimits(plan);
    const monthlyLimit = limits?.managerAICallsMonthly ?? 0;

    const now = new Date();
    const firstDay = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString().split('T')[0];

    const { data: usageRows, error: usageError } = await supabaseAdmin
      .from('usage_tracking')
      .select('count')
      .eq('restaurant_id', restaurantId)
      .eq('metric_type', 'manager_ai_call')
      .gte('period', firstDay)
      .lte('period', lastDay);

    if (usageError) {
      logger.error('manager-usage: usage_tracking query failed', { error: usageError.message });
      return res.status(500).json({ error: 'Internal error' });
    }

    const used = (usageRows || []).reduce((sum, row) => sum + (row.count || 0), 0);
    const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toISOString().split('T')[0];

    return res.json({
      used,
      limit: monthlyLimit === -1 ? null : monthlyLimit,
      plan,
      resets_at: resetsAt,
    });
  } catch (err) {
    logger.error('manager-usage error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
