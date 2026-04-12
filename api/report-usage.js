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
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://seatable.one/api/report-usage
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { reportAllUsage } = require('./_lib/stripe-usage-reporter');
const { logCronRun } = require('./_lib/cron-tracker');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

const logger = createSecureLogger('ReportUsageCron');

module.exports = async (req, res) => {
  // CORS
  setInternalCors(req, res);

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

  if (!isVercelCron) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    logger.info('Starting usage reporting to Stripe');
    const startTime = Date.now();

    const result = await reportAllUsage();

    const duration = Date.now() - startTime;
    logger.info('Usage reporting completed', { ...result, duration_ms: duration });
    await logCronRun('report-usage', { ...result, duration_ms: duration });

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
