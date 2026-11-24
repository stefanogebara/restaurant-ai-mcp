/**
 * Cron Job: Compile Restaurant Wiki Pages
 *
 * Implements the Karpathy LLM Wiki pattern:
 * For each active restaurant, fetch raw data and compile 5 wiki articles
 * (overview, customers, patterns, performance, operations) using Haiku.
 *
 * Hash-skip: if input data hasn't changed since last compile, skip LLM call.
 * This keeps costs at ~$1.50/month for 10 restaurants.
 *
 * Runs daily at 4:30 AM UTC via Vercel Cron Jobs
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { logCronRun } = require('../_lib/cron-tracker');
const { compileWikiForRestaurant } = require('../_services/wikiCompiler');

const logger = createSecureLogger('compile-wiki');

const MAX_RESTAURANTS = 5;
const TIME_BUDGET_MS = 50_000;

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const startTime = Date.now();
  let totalCompiled = 0;
  let totalSkipped = 0;
  let processed = 0;
  let errors = 0;

  try {
    // Find restaurants with reservation activity in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: activeRestaurants, error: queryErr } = await supabaseAdmin
      .from('reservations')
      .select('restaurant_id')
      .gte('date', sevenDaysAgo)
      .limit(MAX_RESTAURANTS * 10);

    if (queryErr) {
      logger.error('Failed to query active restaurants', { error: queryErr.message });
      return res.status(500).json({ error: queryErr.message });
    }

    // Deduplicate restaurant IDs
    const restaurantIds = [...new Set((activeRestaurants || []).map((r) => r.restaurant_id))]
      .slice(0, MAX_RESTAURANTS);

    logger.info('Starting wiki compilation', { count: restaurantIds.length });

    for (const restaurantId of restaurantIds) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        logger.warn('Time budget reached, stopping early', { processed, remaining: restaurantIds.length - processed });
        break;
      }

      try {
        const { compiled, skipped } = await compileWikiForRestaurant(restaurantId);
        totalCompiled += compiled;
        totalSkipped += skipped;
        processed++;
      } catch (err) {
        errors++;
        logger.error('Wiki compilation failed for restaurant', { restaurantId, error: err.message });
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info('Wiki compilation complete', { processed, totalCompiled, totalSkipped, errors, elapsed });

    await logCronRun('compile-wiki', { processed, totalCompiled, totalSkipped, errors });

    return res.status(200).json({
      success: true,
      processed,
      compiled: totalCompiled,
      skipped: totalSkipped,
      errors,
      elapsed_ms: elapsed,
    });
  } catch (err) {
    logger.error('compile-wiki cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};
