/**
 * Cron Job: Cleanup whatsapp_message_dedup + whatsapp_processing_lock
 *
 * Both tables grow unbounded without a sweeper:
 *  - whatsapp_message_dedup: rows exist for cross-Lambda dedup of inbound
 *    messageIds. 24h of protection is more than enough (Meta retry window
 *    closes at 20s); older rows are dead weight.
 *  - whatsapp_processing_lock: rows should be deleted by the Lambda that
 *    owns them, but a crashed Lambda leaves orphans. Each row has an
 *    expires_at; anything past that is safe to delete.
 *
 * Runs daily at 04:00 UTC.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { logCronRun } = require('../_lib/cron-tracker');

const logger = createSecureLogger('CronCleanupWhatsAppDedup');
const DEDUP_TTL_HOURS = 24;

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const result = { dedup_deleted: 0, locks_deleted: 0 };
  const errors = [];

  try {
    const dedupCutoff = new Date(Date.now() - DEDUP_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { error: dedupErr, count: dedupCount } = await supabaseAdmin
      .from('whatsapp_message_dedup')
      .delete({ count: 'exact' })
      .lt('seen_at', dedupCutoff);
    if (dedupErr) {
      logger.error('dedup cleanup failed:', dedupErr.message);
      errors.push(`dedup: ${dedupErr.message}`);
    } else {
      result.dedup_deleted = dedupCount ?? 0;
    }
  } catch (err) {
    logger.error('dedup cleanup threw:', err.message);
    errors.push(`dedup: ${err.message}`);
  }

  try {
    const nowIso = new Date().toISOString();
    const { error: lockErr, count: lockCount } = await supabaseAdmin
      .from('whatsapp_processing_lock')
      .delete({ count: 'exact' })
      .lt('expires_at', nowIso);
    if (lockErr) {
      // 42P01 / PGRST205 = table missing — ignore until migration is applied
      if (lockErr.code !== '42P01' && lockErr.code !== 'PGRST205') {
        logger.error('lock cleanup failed:', lockErr.message);
        errors.push(`lock: ${lockErr.message}`);
      }
    } else {
      result.locks_deleted = lockCount ?? 0;
    }
  } catch (err) {
    logger.error('lock cleanup threw:', err.message);
    errors.push(`lock: ${err.message}`);
  }

  logger.info(`WhatsApp dedup cleanup: ${result.dedup_deleted} dedup rows, ${result.locks_deleted} stale locks`);
  await logCronRun('cleanup-whatsapp-dedup', result);

  if (errors.length > 0) {
    return res.status(500).json({ success: false, errors, ...result });
  }
  return res.status(200).json({ success: true, ...result });
};
