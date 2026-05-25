/**
 * Send Feedback Cron
 *
 * Runs every hour to:
 * 1. Send pending feedback requests whose delay has elapsed
 * 2. Expire feedback sent >24h ago without response
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { sendPendingFeedback, expireOldFeedback } = require('../services/feedbackService');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

const logger = createSecureLogger('CronSendFeedback');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch — hourly fire * up to 50 WhatsApp messages
  // per run is meaningful blast radius. Flip cron_config.enabled to
  // false on this row and the next-hour tick exits cleanly.
  if (!(await isCronEnabled('send-feedback'))) {
    logger.warn('send-feedback cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const [sent, expired] = await Promise.all([
      sendPendingFeedback(50),
      expireOldFeedback(),
    ]);

    logger.info('send-feedback cron complete', { sent, expired });
    await logCronRun('send-feedback', { sent, expired });

    return res.status(200).json({
      success: true,
      sent,
      expired,
    });
  } catch (error) {
    logger.error('send-feedback cron error', { error: error.message });
    return res.status(500).json({ success: false, error: 'Feedback sending failed' });
  }
};
