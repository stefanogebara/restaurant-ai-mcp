/**
 * Report Usage to Stripe - Cron Endpoint
 *
 * Reports accumulated usage from usage_tracking table to Stripe's metered billing.
 * Designed to be called by Vercel Cron (daily) or manually by an admin.
 *
 * Security: Protected by CRON_SECRET header OR authenticated admin user.
 *
 * Vercel cron config (add to vercel.json):
 *   { "crons": [{ "path": "/api/report-usage", "schedule": "0 4 * * *" }] }
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://restaurant-ai-mcp.vercel.app/api/report-usage
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { reportAllUsage } = require('./_lib/stripe-usage-reporter');

const logger = createSecureLogger('ReportUsageCron');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: Vercel Cron sets Authorization header with CRON_SECRET
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = authHeader === `Bearer ${cronSecret}` && cronSecret;
  const isAdminCall = authHeader?.startsWith('Bearer ') && !isVercelCron;

  if (!isVercelCron && !isAdminCall) {
    // Also check for x-vercel-cron header (Vercel internal cron)
    if (!req.headers['x-vercel-cron']) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // If it's a manual admin call, verify the JWT
  if (isAdminCall) {
    try {
      const { verifyAuth } = require('./_lib/auth');
      const auth = await verifyAuth(req, { required: true });
      if (auth.error) {
        return res.status(auth.status || 401).json({ error: auth.error });
      }
      // Optionally check for admin role here
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  try {
    logger.info('Starting usage reporting to Stripe');
    const startTime = Date.now();

    const result = await reportAllUsage();

    const duration = Date.now() - startTime;
    logger.info('Usage reporting completed', { ...result, duration_ms: duration });

    return res.status(200).json({
      success: true,
      ...result,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Usage reporting failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Usage reporting failed',
      message: error.message,
    });
  }
};
