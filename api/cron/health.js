/**
 * Cron Health Monitoring Endpoint
 *
 * GET /api/cron/health
 *
 * Handler fino: a lógica vive em api/_lib/cron-health.js para que o console da
 * Olímpia possa reusá-la sem dar require num handler irmão (a NFT da Vercel
 * derruba a função importadora em silêncio).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { CRON_JOBS, getStatus, formatAge, checkCronHealth } = require('../_lib/cron-health');

const logger = createSecureLogger('CronHealth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: CRON_SECRET Bearer token.
  // HH.1 — constant-time compare (EE.1 missed this site).
  const { bearerEquals } = require('../_lib/secure-compare');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (!bearerEquals(req.headers.authorization, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const result = await checkCronHealth();

    if (!result) {
      const jobs = CRON_JOBS.map(job => ({
        name: job.name,
        status: 'never_run',
        last_ran_at: null,
        age: null,
        interval_minutes: job.intervalMinutes,
      }));

      return res.status(200).json({
        overall: 'unknown',
        message: 'cron_runs table may not exist yet. Run the migration first.',
        jobs,
        checked_at: new Date().toISOString(),
      });
    }

    logger.info('Cron health check', {
      overall: result.overall,
      healthy: result.summary.healthy,
      stale: result.summary.stale,
      never_run: result.summary.never_run,
      errors_14d: result.summary.errors_14d,
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error('Cron health check failed', { error: err.message });
    return res.status(500).json({ error: 'Health check failed' });
  }
}

// Export handler as default + checkCronHealth for internal use
module.exports = handler;
module.exports.checkCronHealth = checkCronHealth;
// Expostos para teste: o registro é a única coisa que decide se um job é
// vigiado, e a tolerância é onde mora a sutileza (jobs de janela limitada).
module.exports.CRON_JOBS = CRON_JOBS;
module.exports.getStatus = getStatus;
