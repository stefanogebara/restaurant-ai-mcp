/**
 * Per-cron kill switch + light tunables.
 *
 * Each cron handler calls isCronEnabled('<job_name>') at the top. If
 * the row in public.cron_config has enabled=false, the handler exits
 * 200 with `{ skipped: 'disabled_by_ops' }` instead of doing work.
 * Ops can flip the bit via Supabase Studio in ~5 seconds — no deploy,
 * no waiting for the next cron tick.
 *
 * Default-enabled: if the row doesn't exist (legacy crons, fresh
 * environment without the migration applied), we return true so the
 * cron behaves exactly as it did before this layer was introduced.
 * Same fail-open posture if Supabase itself errors — we'd rather run
 * a cron once during a transient DB issue than silently drop work.
 */

const { createSecureLogger } = require('./secure-logger');
const { supabaseAdmin } = require('./supabase');

const logger = createSecureLogger('cron-config');

/**
 * @param {string} jobName  matches cron_config.job_name (e.g. 'send-reminders')
 * @returns {Promise<{enabled: boolean, maxTenantsPerRun: number | null, notes: string | null}>}
 */
async function getCronConfig(jobName) {
  try {
    const { data, error } = await supabaseAdmin
      .from('cron_config')
      .select('enabled, max_tenants_per_run, notes')
      .eq('job_name', jobName)
      .maybeSingle();

    if (error) {
      // Fail-open: log loud but let the cron run. Better one extra run
      // during a transient DB blip than a silent miss.
      logger.warn('cron_config lookup failed, defaulting enabled=true', {
        jobName,
        error: error.message,
      });
      return { enabled: true, maxTenantsPerRun: null, notes: null };
    }
    if (!data) {
      // No row → legacy default. Returning enabled=true preserves the
      // pre-kill-switch behaviour. Ops can opt the cron in by INSERTing.
      return { enabled: true, maxTenantsPerRun: null, notes: null };
    }
    return {
      enabled: data.enabled === true,
      maxTenantsPerRun: data.max_tenants_per_run,
      notes: data.notes,
    };
  } catch (err) {
    logger.warn('cron_config lookup threw, defaulting enabled=true', {
      jobName,
      error: err?.message,
    });
    return { enabled: true, maxTenantsPerRun: null, notes: null };
  }
}

/**
 * Quick "should this cron run?" gate. Use at the top of the handler.
 *
 *   const { enabled } = await getCronConfig('send-reminders');
 *   if (!enabled) return res.status(200).json({ skipped: 'disabled_by_ops' });
 */
async function isCronEnabled(jobName) {
  const cfg = await getCronConfig(jobName);
  return cfg.enabled;
}

module.exports = {
  getCronConfig,
  isCronEnabled,
};
