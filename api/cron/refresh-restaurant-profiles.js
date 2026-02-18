/**
 * Cron Job: Refresh Restaurant Profiles
 *
 * Weekly cron (Mondays 3 AM UTC) that finds restaurants with new intelligence
 * since their last persona generation and regenerates their restaurant_profile
 * with the latest data.
 *
 * Secured with CRON_SECRET Bearer token auth.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { regeneratePersona } = require('../services/personaGenerator');

const logger = createSecureLogger('CronRefreshProfiles');

// Maximum time per restaurant regeneration (30s)
const PER_RESTAURANT_TIMEOUT = 30000;
// Maximum total cron runtime (4 minutes, leaving buffer for Vercel 5min limit)
const MAX_TOTAL_RUNTIME = 4 * 60 * 1000;

module.exports = async (req, res) => {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin client not available');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info('Starting weekly restaurant profile refresh...');
    const startTime = Date.now();

    // JOIN query: fetch intelligence + config in one query (fixes N+1)
    const { data: staleRestaurants, error: fetchError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_intelligence')
      .select(`
        restaurant_config_id,
        last_gathered_at,
        restaurant_config:restaurant_config_id (
          id,
          restaurant_name,
          profile_generated_at
        )
      `)
      .not('last_gathered_at', 'is', null);

    if (fetchError) {
      logger.error('Error fetching intelligence records:', fetchError);
      return res.status(500).json({ success: false, error: 'Failed to fetch intelligence data' });
    }

    if (!staleRestaurants || staleRestaurants.length === 0) {
      logger.info('No restaurant intelligence records found');
      return res.status(200).json({
        success: true,
        message: 'No restaurants to refresh',
        refreshed: 0
      });
    }

    // Filter to only those needing refresh (profile older than intelligence)
    const needsRefresh = staleRestaurants.filter(record => {
      const config = record.restaurant_config;
      if (!config) return false;

      const profileDate = config.profile_generated_at ? new Date(config.profile_generated_at) : null;
      const intelligenceDate = new Date(record.last_gathered_at);

      return !profileDate || profileDate < intelligenceDate;
    });

    logger.info(`Found ${needsRefresh.length} restaurants needing refresh out of ${staleRestaurants.length} total`);

    const refreshed = [];
    const errors = [];
    const skipped = [];

    for (const record of needsRefresh) {
      // Check total runtime budget
      if (Date.now() - startTime > MAX_TOTAL_RUNTIME) {
        const remaining = needsRefresh.length - refreshed.length - errors.length;
        logger.warn(`Runtime budget exceeded, skipping ${remaining} remaining restaurants`);
        skipped.push(...needsRefresh.slice(refreshed.length + errors.length).map(r => r.restaurant_config_id));
        break;
      }

      const { restaurant_config_id } = record;
      const restaurantName = record.restaurant_config?.restaurant_name || 'unknown';

      try {
        logger.info('Regenerating profile for:', {
          restaurant: restaurantName,
          id: restaurant_config_id
        });

        // Per-restaurant timeout
        const result = await Promise.race([
          regeneratePersona(restaurant_config_id),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Regeneration timed out')), PER_RESTAURANT_TIMEOUT)
          )
        ]);

        if (result) {
          refreshed.push({
            restaurant_config_id,
            restaurant_name: restaurantName
          });
        }
      } catch (regenError) {
        logger.error('Failed to regenerate profile:', {
          restaurant_config_id,
          error: regenError.message
        });
        errors.push({ restaurant_config_id });
      }
    }

    const summary = {
      success: true,
      checked_at: new Date().toISOString(),
      total_checked: staleRestaurants.length,
      needs_refresh: needsRefresh.length,
      refreshed: refreshed.length,
      errors: errors.length,
      skipped: skipped.length
    };

    logger.info('Profile refresh complete', summary);
    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Fatal error refreshing profiles:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
