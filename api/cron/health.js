/**
 * Cron Health Monitoring Endpoint
 *
 * GET /api/cron/health
 *
 * Returns the health status of all cron jobs by comparing their last run
 * timestamp against expected schedule intervals. Secured with CRON_SECRET.
 *
 * Status levels:
 * - healthy: ran within expected window
 * - stale: missed 2+ expected intervals
 * - never_run: no record in cron_runs table
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('CronHealth');

// Expected cron jobs with their schedule intervals in minutes
// Derived from vercel.json crons configuration
const CRON_JOBS = [
  { name: 'check-late-reservations', intervalMinutes: 5 },
  { name: 'send-campaigns', intervalMinutes: 5 },
  { name: 'send-feedback', intervalMinutes: 30 },
  { name: 'send-reminders', intervalMinutes: 1440 },         // daily
  { name: 'update-churn-scores', intervalMinutes: 1440 },    // daily
  { name: 'report-usage', intervalMinutes: 1440 },           // daily
  { name: 'generate-reflections', intervalMinutes: 1440 },   // daily
  { name: 'demo-nurture', intervalMinutes: 1440 },           // daily
  { name: 'cleanup-expired-demos', intervalMinutes: 1440 },  // daily
  { name: 'warm-seo-cache', intervalMinutes: 1440 },         // daily
  { name: 'manager-briefings-morning', intervalMinutes: 1440 },
  { name: 'manager-briefings-eod', intervalMinutes: 1440 },
  { name: 'manager-alerts-low-covers', intervalMinutes: 1440 },
  { name: 'manager-alerts-high-noshows', intervalMinutes: 1440 },
  { name: 'manager-alerts-late-cancellations', intervalMinutes: 120 }, // every 2h
  { name: 'proactive-comms', intervalMinutes: 10080 },       // weekly
  { name: 'refresh-restaurant-profiles', intervalMinutes: 10080 }, // weekly
  { name: 'pre-reservation-upsell', intervalMinutes: 1440 },     // daily
];

function getStatus(lastRanAt, intervalMinutes) {
  if (!lastRanAt) return 'never_run';

  const now = Date.now();
  const lastRan = new Date(lastRanAt).getTime();
  const elapsed = now - lastRan;
  const toleranceMs = intervalMinutes * 60 * 1000 * 2; // 2x interval = stale

  return elapsed <= toleranceMs ? 'healthy' : 'stale';
}

function formatAge(lastRanAt) {
  if (!lastRanAt) return null;

  const mins = Math.floor((Date.now() - new Date(lastRanAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: CRON_SECRET Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Get recent runs (last 14 days) — we'll compute latest per job in JS
    const { data: runs, error } = await supabaseAdmin
      .from('cron_runs')
      .select('job_name, ran_at, meta')
      .gte('ran_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('ran_at', { ascending: false })
      .limit(500);

    if (error) {
      // Table might not exist yet — return all as never_run
      logger.warn('Failed to query cron_runs', { error: error.message });

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

    // Build a lookup map: job_name → latest ran_at (results ordered DESC so first wins)
    const lastRunMap = {};
    for (const run of (runs || [])) {
      if (!lastRunMap[run.job_name]) {
        lastRunMap[run.job_name] = run.ran_at;
      }
    }

    // Evaluate each job
    const jobs = CRON_JOBS.map(job => {
      const lastRanAt = lastRunMap[job.name] || null;
      const status = getStatus(lastRanAt, job.intervalMinutes);

      return {
        name: job.name,
        status,
        last_ran_at: lastRanAt,
        age: formatAge(lastRanAt),
        interval_minutes: job.intervalMinutes,
      };
    });

    // Overall status
    const staleCount = jobs.filter(j => j.status === 'stale').length;
    const neverRunCount = jobs.filter(j => j.status === 'never_run').length;
    const healthyCount = jobs.filter(j => j.status === 'healthy').length;

    let overall = 'healthy';
    if (staleCount > 0) overall = 'degraded';
    if (staleCount > 3) overall = 'critical';
    if (neverRunCount === jobs.length) overall = 'not_tracking';

    logger.info('Cron health check', { overall, healthy: healthyCount, stale: staleCount, never_run: neverRunCount });

    return res.status(200).json({
      overall,
      summary: {
        healthy: healthyCount,
        stale: staleCount,
        never_run: neverRunCount,
        total: jobs.length,
      },
      jobs,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Cron health check failed', { error: err.message });
    return res.status(500).json({ error: 'Health check failed' });
  }
};
