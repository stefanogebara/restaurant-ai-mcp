/**
 * Send Feedback Cron
 *
 * Runs every 30 minutes to:
 * 1. Send pending feedback requests whose delay has elapsed
 * 2. Expire feedback sent >24h ago without response
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { sendPendingFeedback, expireOldFeedback } = require('../services/feedbackService');
const { logCronRun } = require('../_lib/cron-tracker');

const logger = createSecureLogger('CronSendFeedback');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
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
