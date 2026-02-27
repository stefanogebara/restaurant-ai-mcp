/**
 * Customer Lifetime Value (LTV) API
 *
 * Serverless function for LTV operations:
 * - Calculate LTV for individual customers
 * - Batch calculate all customers
 * - Get stored LTV data
 * - List customers by tier
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('LTV');

// Use restaurant schema for all LTV tables
function ltvDb() {
  return supabaseAdmin.schema('restaurant');
}

/**
 * Calculate/refresh LTV for all customers of a restaurant from reservations data
 */
async function handleCalculateAll(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const AVG_REVENUE_PER_COVER = 45;
    const now = new Date();

    const { data: reservations, error: resError } = await supabaseAdmin
      .from('reservations')
      .select('customer_phone, customer_name, customer_email, date, party_size, status')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'completed');

    if (resError) throw resError;

    if (!reservations || reservations.length === 0) {
      return res.status(200).json({ success: true, data: { total_customers: 0 } });
    }

    const byPhone = {};
    for (const r of reservations) {
      const phone = r.customer_phone;
      if (!phone) continue;
      if (!byPhone[phone]) {
        byPhone[phone] = { customer_phone: phone, customer_name: r.customer_name || null, customer_email: r.customer_email || null, visits: [], party_sizes: [] };
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

      const { error: upsertErr } = await ltvDb()
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
      else logger.error(`LTV upsert failed for ${phone}:`, upsertErr.message);
    }

    logger.info(`calculate-all: upserted ${upserted} LTV records for restaurant ${restaurantId}`);
    return res.status(200).json({ success: true, data: { total_customers: upserted } });

  } catch (error) {
    logger.error('Error in batch LTV calculation:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to calculate LTV' });
  }
}

/**
 * Get stored LTV data for a single customer
 */
async function handleGet(req, res) {
  try {
    const { customer_id } = req.query;
    const restaurantId = req.user.restaurant_id;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: customer_id' });
    }

    const { data, error } = await ltvDb()
      .from('customer_ltv')
      .select('*')
      .eq('customer_id', customer_id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Customer LTV data not found.' });
      }
      throw error;
    }

    return res.status(200).json({ success: true, data });

  } catch (error) {
    logger.error('Error fetching LTV data:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch LTV data' });
  }
}

/**
 * List customers by tier or all customers
 */
async function handleList(req, res) {
  try {
    const { tier, limit = 100, offset = 0 } = req.query;
    const restaurantId = req.user.restaurant_id;

    const validTiers = ['vip', 'regular', 'occasional', 'new', 'at_risk'];
    if (tier && !validTiers.includes(tier)) {
      return res.status(400).json({ success: false, error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
    }

    let query = ltvDb()
      .from('customer_ltv')
      .select('customer_id, customer_name, total_visits, total_revenue, avg_revenue_per_visit, customer_tier, lifetime_value, churn_risk_score, last_visit_date, predicted_next_visit_date, favorite_time_slot, favorite_day')
      .eq('restaurant_id', restaurantId)
      .order('lifetime_value', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (tier) query = query.eq('customer_tier', tier);

    const { data, error } = await query;
    if (error) throw error;

    const customers = (data || []).map(c => ({
      ...c,
      churn_risk_score: Number(c.churn_risk_score || 0),
      lifetime_value: Number(c.lifetime_value || 0),
      total_revenue: Number(c.total_revenue || 0),
      avg_revenue_per_visit: Number(c.avg_revenue_per_visit || 0),
    }));

    return res.status(200).json({ success: true, data: { total: customers.length, customers } });

  } catch (error) {
    logger.error('Error listing customers:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list customers' });
  }
}

/**
 * Get LTV statistics summary for a restaurant
 */
async function handleStats(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;

    const { data: customers, error } = await ltvDb()
      .from('customer_ltv')
      .select('customer_tier, lifetime_value, churn_risk_score')
      .eq('restaurant_id', restaurantId);

    if (error) throw error;

    if (!customers || customers.length === 0) {
      return res.status(200).json({
        success: true,
        data: { total_customers: 0, total_ltv: 0, avg_ltv: 0, tiers: { vip: 0, regular: 0, occasional: 0, new: 0, at_risk: 0 }, high_risk_customers: 0 }
      });
    }

    const totalLTV = customers.reduce((s, c) => s + Number(c.lifetime_value || 0), 0);
    const tiers = { vip: 0, regular: 0, occasional: 0, new: 0, at_risk: 0 };
    let highRisk = 0;
    for (const c of customers) {
      const tier = c.customer_tier || 'new';
      if (tier in tiers) tiers[tier]++;
      if (Number(c.churn_risk_score) > 70) highRisk++;
    }

    return res.status(200).json({
      success: true,
      data: {
        total_customers: customers.length,
        total_ltv: Math.round(totalLTV * 100) / 100,
        avg_ltv: Math.round((totalLTV / customers.length) * 100) / 100,
        tiers,
        high_risk_customers: highRisk
      }
    });

  } catch (error) {
    logger.error('Error calculating LTV stats:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to calculate LTV statistics' });
  }
}

/**
 * Get LTV trend analytics over time
 */
async function handleTrends(req, res) {
  try {
    const { period = '30d' } = req.query;
    const restaurantId = req.user.restaurant_id;

    const daysBack = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDateStr = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

    const { data, error } = await ltvDb()
      .from('revenue_records')
      .select('service_date, total_revenue, customer_id')
      .eq('restaurant_id', restaurantId)
      .gte('service_date', startDateStr)
      .order('service_date', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(200).json({
        success: true,
        data: { period, trends: [], summary: { total_revenue: 0, total_customers: 0, avg_per_customer: 0 } }
      });
    }

    const byDate = {};
    const allCustomers = new Set();
    for (const r of data) {
      if (!byDate[r.service_date]) byDate[r.service_date] = { revenue: 0, customers: new Set() };
      byDate[r.service_date].revenue += parseFloat(r.total_revenue) || 0;
      byDate[r.service_date].customers.add(r.customer_id);
      allCustomers.add(r.customer_id);
    }

    const trends = Object.entries(byDate)
      .map(([date, s]) => ({
        date,
        revenue: Math.round(s.revenue * 100) / 100,
        unique_customers: s.customers.size,
        avg_per_customer: s.customers.size > 0 ? Math.round((s.revenue / s.customers.size) * 100) / 100 : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalRevenue = trends.reduce((s, t) => s + t.revenue, 0);

    return res.status(200).json({
      success: true,
      data: {
        period,
        start_date: startDateStr,
        end_date: new Date().toISOString().split('T')[0],
        trends,
        summary: {
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_unique_customers: allCustomers.size,
          avg_per_customer: allCustomers.size > 0 ? Math.round((totalRevenue / allCustomers.size) * 100) / 100 : 0,
          avg_daily_revenue: trends.length > 0 ? Math.round((totalRevenue / trends.length) * 100) / 100 : 0,
        }
      }
    });

  } catch (error) {
    logger.error('Error calculating LTV trends:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to calculate LTV trends' });
  }
}

/**
 * Main serverless function handler
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-customer-email');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apply rate limiting (60 requests per minute)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return; // 429 response already sent

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access LTV data'
    });
  }
  req.user = authResult.user;

  // Check subscription status
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return; // Response already sent by middleware

  // Check feature access - advanced_analytics required for LTV
  let featureAllowed = false;
  requireFeature('advanced_analytics')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return; // Response already sent by middleware

  const { action } = req.query;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action',
      available_actions: ['calculate-all', 'get', 'list', 'stats', 'trends']
    });
  }

  try {
    switch (action) {
      case 'calculate-all':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for calculate-all' });
        return await handleCalculateAll(req, res);

      case 'get':
        return await handleGet(req, res);

      case 'list':
        return await handleList(req, res);

      case 'stats':
        return await handleStats(req, res);

      case 'trends':
        return await handleTrends(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['calculate-all', 'get', 'list', 'stats', 'trends']
        });
    }
  } catch (error) {
    logger.error('LTV API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
