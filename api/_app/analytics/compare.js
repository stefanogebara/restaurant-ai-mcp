const { verifyJWT } = require('../_lib/auth');
const { comparePeriods } = require('../_lib/periodCompare');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');

const logger = createSecureLogger('analytics-compare');

const VALID_PERIODS = [
  'last_7_days',
  'last_30_days',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rateLimited = await checkAndApplyRateLimit(req, res, 'analytics_compare', 60, 60);
  if (rateLimited) return;

  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;

    const { period_a = 'last_week', period_b = 'this_week' } = req.query;

    if (!VALID_PERIODS.includes(period_a) || !VALID_PERIODS.includes(period_b)) {
      return res.status(400).json({
        error: `Invalid period. Use one of: ${VALID_PERIODS.join(', ')}`,
      });
    }

    const result = await comparePeriods(restaurantId, period_a, period_b);

    return res.json({ success: true, ...result });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    logger.error('analytics-compare error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
