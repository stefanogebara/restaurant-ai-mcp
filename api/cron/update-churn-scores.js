/**
 * Cron Job: Update Churn Scores
 *
 * Recalculates LTV and churn risk scores for ALL customers across ALL restaurants.
 * Processes new completed reservations and updates existing records.
 *
 * Runs daily at 6 AM UTC via Vercel Cron Jobs
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
initSentry();

const logger = createSecureLogger('CronChurnScores');

// V.3 default fallback when a restaurant has no service_records yet.
// Before, this constant was used for ALL restaurants — wildly wrong for
// steakhouses (~€100/cover) vs cafés (~€15/cover). The new flow
// computes a per-restaurant average from service_records.total_bill and
// only falls back here when the row count is too low for a useful mean.
const AVG_REVENUE_PER_COVER_DEFAULT = 45;
const MIN_ROWS_FOR_PER_RESTAURANT_AVG = 5; // need at least 5 closed services

/**
 * Compute this restaurant's average revenue per cover from the most
 * recent ~90 days of service_records. Returns the default if not enough
 * data points to trust the mean (e.g. a new restaurant with 2 services).
 */
async function getAvgRevenuePerCover(restaurantId) {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await supabaseAdmin
      .from('service_records')
      .select('total_bill, party_size')
      .eq('restaurant_id', restaurantId)
      .gte('started_at', ninetyDaysAgo)
      .not('total_bill', 'is', null);
    if (error || !Array.isArray(data) || data.length < MIN_ROWS_FOR_PER_RESTAURANT_AVG) {
      return AVG_REVENUE_PER_COVER_DEFAULT;
    }
    const totalBill = data.reduce((s, r) => s + (r.total_bill || 0), 0);
    const totalCovers = data.reduce((s, r) => s + (r.party_size || 1), 0);
    if (totalCovers === 0) return AVG_REVENUE_PER_COVER_DEFAULT;
    const avg = totalBill / totalCovers;
    // Sanity-clamp to a reasonable band so a single garbage row (€10,000
    // typo for a wedding event) doesn't blow up every LTV downstream.
    return Math.max(5, Math.min(500, avg));
  } catch {
    return AVG_REVENUE_PER_COVER_DEFAULT;
  }
}

/**
 * Calculate and upsert LTV + churn scores for all customers of a single restaurant.
 * Mirrors the logic in api/ltv.js handleCalculateAll.
 */
async function refreshLTVForRestaurant(restaurantId) {
  const now = new Date();
  // V.3 per-restaurant avg revenue (was hardcoded €45 for every tenant).
  const avgRevenuePerCover = await getAvgRevenuePerCover(restaurantId);

  const { data: reservations, error } = await supabaseAdmin
    .from('reservations')
    .select('customer_phone, customer_name, customer_email, date, party_size')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed')
    .order('date', { ascending: false })
    .limit(2000);

  if (error) {
    logger.error(`Failed to fetch reservations for ${restaurantId}:`, error.message);
    return 0;
  }
  if (!reservations || reservations.length === 0) return 0;

  const byPhone = {};
  for (const r of reservations) {
    const phone = r.customer_phone;
    if (!phone) continue;
    if (!byPhone[phone]) {
      byPhone[phone] = {
        customer_name: r.customer_name || null,
        customer_email: r.customer_email || null,
        visits: [],
        party_sizes: [],
      };
    }
    byPhone[phone].visits.push(new Date(r.date));
    byPhone[phone].party_sizes.push(r.party_size || 2);
  }

  let upserted = 0;
  for (const [phone, cust] of Object.entries(byPhone)) {
    const visits = cust.visits.sort((a, b) => a - b);
    const total_visits = visits.length;
    const avg_party = cust.party_sizes.reduce((s, p) => s + p, 0) / cust.party_sizes.length;
    const avg_revenue = avg_party * avgRevenuePerCover;
    const total_revenue = total_visits * avg_revenue;

    let avg_days = null;
    if (total_visits > 1) {
      const diffs = visits.slice(1).map((v, i) => (v - visits[i]) / 86400000);
      avg_days = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    }

    const visits_per_year = avg_days ? Math.min(52, 365 / avg_days) : (total_visits > 1 ? 6 : 2);
    const lifetime_value = visits_per_year * 2 * avg_revenue;

    const daysSinceLast = (now - visits[visits.length - 1]) / 86400000;
    let churn = 50;
    if (avg_days && total_visits > 1) {
      churn = Math.min(100, Math.round((daysSinceLast / (avg_days * 1.5)) * 50));
      if (total_visits >= 10) churn = Math.round(churn * 0.7);
    }
    if (!Number.isFinite(churn)) churn = 50;
    churn = Math.max(0, Math.min(100, churn));

    let tier = 'new';
    if (churn > 70) tier = 'at_risk';
    else if (total_visits >= 10) tier = 'vip';
    else if (total_visits >= 4) tier = 'regular';
    else if (total_visits >= 2) tier = 'occasional';

    const { error: upsertErr } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .upsert({
        customer_id: phone,
        customer_phone: phone,
        customer_name: cust.customer_name,
        customer_email: cust.customer_email,
        restaurant_id: restaurantId,
        total_visits,
        first_visit_date: visits[0].toISOString().split('T')[0],
        last_visit_date: visits[visits.length - 1].toISOString().split('T')[0],
        avg_days_between_visits: avg_days ? Math.round(avg_days) : null,
        avg_party_size: Math.round(avg_party * 10) / 10,
        avg_revenue_per_visit: Math.round(avg_revenue),
        total_revenue: Math.round(total_revenue),
        highest_single_visit_revenue: Math.round(Math.max(...cust.party_sizes) * avgRevenuePerCover),
        lifetime_value: Math.round(lifetime_value),
        churn_risk_score: churn,
        customer_tier: tier,
        updated_at: now.toISOString(),
      }, { onConflict: 'customer_id,restaurant_id' });

    if (!upsertErr) upserted++;
    else logger.error(`LTV upsert failed for ${phone} (${restaurantId}):`, upsertErr.message);
  }

  return upserted;
}

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin client not available');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  // Phase U.3 kill switch.
  if (!(await isCronEnabled('update-churn-scores'))) {
    logger.warn('update-churn-scores cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    logger.info('Starting daily LTV + churn score update...');

    const { data: restaurants, error: restError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id');

    if (restError) throw restError;

    if (!restaurants || restaurants.length === 0) {
      logger.info('No restaurants found');
      return res.status(200).json({ success: true, message: 'No restaurants to process', updated: 0 });
    }

    // H13: time budget so this cron can't push past Vercel's 60s ceiling as
    // restaurant count grows. Stops processing more restaurants when <15s
    // remain — the next daily run picks up from the same set (idempotent
    // upsert means it's safe to redo).
    const TIME_BUDGET_MS = 45_000;
    const startTime = Date.now();

    let totalUpserted = 0;
    let processed = 0;
    const errors = [];

    for (const restaurant of restaurants) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        logger.warn('update-churn-scores time budget exceeded', {
          processed,
          total: restaurants.length,
          dropped: restaurants.length - processed,
        });
        break;
      }
      try {
        const count = await refreshLTVForRestaurant(restaurant.id);
        totalUpserted += count;
        processed++;
      } catch (err) {
        logger.error(`Failed to refresh LTV for restaurant ${restaurant.id}:`, err.message);
        errors.push({ restaurant_id: restaurant.id, error: err.message });
        processed++;
      }
    }

    if (errors.length > 0) {
      captureMessage(
        `CronChurnScores: ${errors.length} restaurant(s) failed`,
        'warning',
        { errors, timestamp: new Date().toISOString() }
      );
    }

    logger.info(`Updated LTV + churn for ${totalUpserted} customers across ${restaurants.length} restaurants`);
    await logCronRun('update-churn-scores', { customers: totalUpserted, restaurants: restaurants.length });

    return res.status(200).json({
      success: true,
      message: `Updated ${totalUpserted} customer records across ${restaurants.length} restaurants`,
      data: {
        restaurants_processed: restaurants.length,
        customers_updated: totalUpserted,
        errors: errors.length,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Churn update error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update churn scores'
    });
  }
};
