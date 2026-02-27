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
initSentry();

const logger = createSecureLogger('CronChurnScores');

const AVG_REVENUE_PER_COVER = 45;

/**
 * Calculate and upsert LTV + churn scores for all customers of a single restaurant.
 * Mirrors the logic in api/ltv.js handleCalculateAll.
 */
async function refreshLTVForRestaurant(restaurantId) {
  const now = new Date();

  const { data: reservations, error } = await supabaseAdmin
    .from('reservations')
    .select('customer_phone, customer_name, customer_email, date, party_size')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed');

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
    const avg_revenue = avg_party * AVG_REVENUE_PER_COVER;
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
        highest_single_visit_revenue: Math.round(Math.max(...cust.party_sizes) * AVG_REVENUE_PER_COVER),
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
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin client not available');
    return res.status(500).json({ success: false, error: 'Database not configured' });
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

    let totalUpserted = 0;
    const errors = [];

    for (const restaurant of restaurants) {
      try {
        const count = await refreshLTVForRestaurant(restaurant.id);
        totalUpserted += count;
      } catch (err) {
        logger.error(`Failed to refresh LTV for restaurant ${restaurant.id}:`, err.message);
        errors.push({ restaurant_id: restaurant.id, error: err.message });
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
