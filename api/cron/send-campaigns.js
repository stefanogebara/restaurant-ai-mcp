/**
 * Send Campaigns Cron
 *
 * Runs every 15 minutes to:
 * 1. Activate scheduled campaigns whose time has come
 * 2. Send next batch for active campaigns (rate-limited to 10/campaign/run)
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { processActiveCampaigns } = require('../services/campaignService');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

const logger = createSecureLogger('CronSendCampaigns');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch. This cron fires every 15 minutes per
  // CLAUDE.md's post-incident schedule — a misbehaving send-campaigns
  // can blast WhatsApp messages 96 times a day until someone redeploys.
  // Now ops can flip the bit in cron_config and stop the fire at the
  // next tick (~15 min worst case).
  if (!(await isCronEnabled('send-campaigns'))) {
    logger.warn('send-campaigns cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const sent = await processActiveCampaigns();
    logger.info('send-campaigns cron complete', { sent });
    await logCronRun('send-campaigns', { sent });
    return res.status(200).json({ success: true, sent });
  } catch (error) {
    logger.error('send-campaigns cron error', { error: error.message });
    return res.status(500).json({ success: false, error: 'Campaign sending failed' });
  }
};
