/**
 * Automated Campaigns Cron
 *
 * Runs daily at 10 AM to process all trigger-based automated campaigns.
 * For each restaurant with enabled automations, calls processAllTriggers.
 *
 * Secured with CRON_SECRET Bearer token.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { supabaseAdmin } = require('../_lib/supabase');
const { processAllTriggers } = require('../services/automatedCampaignService');
const { logCronRun } = require('../_lib/cron-tracker');
const { bearerEquals } = require('../_lib/secure-compare');

const logger = createSecureLogger('CronAutomatedCampaigns');

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

  try {
    // Find all restaurants that have at least one enabled automation
    const { data: restaurants, error } = await supabaseAdmin
      .schema('restaurant')
      .from('campaign_automations')
      .select('restaurant_id')
      .eq('enabled', true);

    if (error) {
      // Table may not exist yet
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        await logCronRun('automated-campaigns', { restaurants: 0, totalSent: 0, skipped: 'table not found' });
        return res.json({ success: true, restaurants: 0, totalSent: 0 });
      }
      logger.error('Failed to query automations', { error: error.message });
      return res.status(500).json({ success: false, error: 'Query failed' });
    }

    // Deduplicate restaurant IDs
    const uniqueRestaurantIds = [...new Set((restaurants || []).map(r => r.restaurant_id))];

    if (uniqueRestaurantIds.length === 0) {
      logger.info('No restaurants with enabled automations');
      await logCronRun('automated-campaigns', { restaurants: 0, totalSent: 0 });
      return res.status(200).json({ success: true, restaurants: 0, totalSent: 0 });
    }

    let totalSent = 0;
    const restaurantResults = {};

    for (const restaurantId of uniqueRestaurantIds) {
      try {
        const result = await processAllTriggers(restaurantId);
        totalSent += result.total;
        restaurantResults[restaurantId] = result;
      } catch (err) {
        logger.error('Failed to process restaurant', {
          restaurantId,
          error: err.message,
        });
        restaurantResults[restaurantId] = { total: 0, error: err.message };
      }
    }

    logger.info('automated-campaigns cron complete', {
      restaurants: uniqueRestaurantIds.length,
      totalSent,
    });

    await logCronRun('automated-campaigns', {
      restaurants: uniqueRestaurantIds.length,
      totalSent,
    });

    return res.status(200).json({
      success: true,
      restaurants: uniqueRestaurantIds.length,
      totalSent,
      details: restaurantResults,
    });
  } catch (error) {
    logger.error('automated-campaigns cron error', { error: error.message });
    return res.status(500).json({ success: false, error: 'Automated campaigns failed' });
  }
};
