/**
 * Send Campaigns Cron
 *
 * Runs every 5 minutes to:
 * 1. Activate scheduled campaigns whose time has come
 * 2. Send next batch for active campaigns (rate-limited to 10/campaign/run)
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { processActiveCampaigns } = require('../services/campaignService');

const logger = createSecureLogger('CronSendCampaigns');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sent = await processActiveCampaigns();
    logger.info('send-campaigns cron complete', { sent });
    return res.status(200).json({ success: true, sent });
  } catch (error) {
    logger.error('send-campaigns cron error', { error: error.message });
    return res.status(500).json({ success: false, error: 'Campaign sending failed' });
  }
};
