/**
 * Cron Run Tracker
 *
 * Lightweight helper to log cron job executions to cron_runs table.
 * Used by cron jobs to record successful runs and by /api/cron/health to check freshness.
 */

const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('CronTracker');

/**
 * Log a cron job execution.
 * @param {string} jobName - The cron job identifier (e.g. 'check-late-reservations')
 * @param {object} [meta] - Optional metadata (counts, durations, etc.)
 */
async function logCronRun(jobName, meta = {}) {
  if (!supabaseAdmin) {
    logger.warn('supabaseAdmin not available, skipping cron run log');
    return;
  }

  try {
    const { error } = await supabaseAdmin
      .from('cron_runs')
      .insert({
        job_name: jobName,
        ran_at: new Date().toISOString(),
        meta,
      });

    if (error) {
      // Non-fatal — don't break cron jobs if tracking fails
      logger.warn('Failed to log cron run', { jobName, error: error.message });
    }
  } catch (err) {
    logger.warn('Exception logging cron run', { jobName, error: err.message });
  }
}

module.exports = { logCronRun };
