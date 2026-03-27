/**
 * Cron Job: Cleanup Stale Waitlist Entries
 *
 * Cancels waitlist entries with status='waiting' older than 12 hours.
 * Runs daily at 4 AM UTC — "0 4 * * *"
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { logCronRun } = require('../_lib/cron-tracker');

const logger = createSecureLogger('CronCleanupWaitlist');

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

  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data, error, count } = await supabaseAdmin
      .from('waitlist')
      .update({ status: 'cancelled', notes: 'Auto-cancelled: end of day', updated_at: new Date().toISOString() })
      .eq('status', 'waiting')
      .lt('added_at', cutoff)
      .select('id', { count: 'exact' });

    if (error) {
      logger.error('Waitlist cleanup failed:', error);
      return res.status(500).json({ success: false, error: 'Cleanup query failed' });
    }

    const cleaned = count ?? data?.length ?? 0;
    logger.info(`Waitlist cleanup: ${cleaned} stale entries cancelled`);
    await logCronRun('cleanup-waitlist', { cancelled: cleaned });

    return res.status(200).json({ success: true, cancelled: cleaned });
  } catch (error) {
    logger.error('Fatal error in cleanup-waitlist:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
