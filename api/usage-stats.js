/**
 * Usage Stats API
 *
 * Returns usage metrics for the authenticated restaurant.
 * Used by the dashboard to show current month's usage and billing info.
 *
 * GET /api/usage-stats                - Current month's usage
 * GET /api/usage-stats?start=X&end=Y  - Custom date range
 */

const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { getMonthlyUsage, getUsageSummary } = require('./_lib/usage-tracking');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const auth = await verifyAuth(req, { required: true });
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ error: 'No restaurant associated with this account' });
  }

  try {
    const { start, end } = req.query;

    const result = start && end
      ? await getUsageSummary(restaurantId, start, end)
      : await getMonthlyUsage(restaurantId);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to fetch usage data' });
    }

    return res.status(200).json({
      success: true,
      restaurant_id: restaurantId,
      period: start && end ? { start, end } : 'current_month',
      usage: result.data,
    });
  } catch (error) {
    console.error('[UsageStats] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
