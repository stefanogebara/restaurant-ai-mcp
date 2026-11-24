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

/**
 * Log a cron job error.
 * Inserts into cron_runs with status: 'error' so health checks can count failures.
 * @param {string} jobName - The cron job identifier (e.g. 'check-late-reservations')
 * @param {Error|string} error - The error object or message
 */
async function logCronError(jobName, error) {
  if (!supabaseAdmin) {
    logger.warn('supabaseAdmin not available, skipping cron error log');
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  try {
    const { error: dbError } = await supabaseAdmin
      .from('cron_runs')
      .insert({
        job_name: jobName,
        ran_at: new Date().toISOString(),
        meta: {
          status: 'error',
          error_message: errorMessage,
        },
      });

    if (dbError) {
      logger.warn('Failed to log cron error', { jobName, error: dbError.message });
    }
  } catch (err) {
    logger.warn('Exception logging cron error', { jobName, error: err.message });
  }
}

module.exports = { logCronRun, logCronError };
