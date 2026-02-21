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
const {
  calculateCustomerLTV,
  calculateAllCustomerLTV,
  upsertCustomerLTV
} = require('./services/ltvCalculator');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('LTV');

/**
 * Calculate LTV for a single customer
 */
async function handleCalculateSingle(req, res) {
  try {
    const { customer_id, restaurant_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: customer_id'
      });
    }

    const ltvData = await calculateCustomerLTV(customer_id, restaurant_id || null);

    // Store calculated LTV
    await upsertCustomerLTV(ltvData);

    return res.status(200).json({
      success: true,
      data: ltvData
    });

  } catch (error) {
    logger.error('Error calculating LTV:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate LTV'
    });
  }
}

/**
 * Calculate LTV for all customers (batch operation)
 */
async function handleCalculateAll(req, res) {
  try {
    const { restaurant_id } = req.query;
    logger.info(`Starting batch LTV calculation${restaurant_id ? ` for restaurant ${restaurant_id}` : ''}...`);
    const results = await calculateAllCustomerLTV(restaurant_id || null);

    return res.status(200).json({
      success: true,
      message: `Successfully calculated LTV for ${results.length} customers`,
      data: {
        total_customers: results.length,
        customers: results
      }
    });

  } catch (error) {
    logger.error('Error in batch LTV calculation:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate batch LTV'
    });
  }
}

/**
 * Get stored LTV data for a customer
 */
async function handleGet(req, res) {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: customer_id'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_ltv')
      .select('*')
      .eq('customer_id', customer_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        return res.status(404).json({
          success: false,
          error: 'Customer LTV data not found. Try calculating first.'
        });
      }
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    logger.error('Error fetching LTV data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch LTV data'
    });
  }
}

/**
 * List customers by tier or all customers
 */
async function handleList(req, res) {
  try {
    const { tier, restaurant_id, limit = 100, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from('customer_ltv')
      .select('*')
      .order('lifetime_value', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Filter by restaurant if specified
    if (restaurant_id) {
      query = query.eq('restaurant_id', restaurant_id);
    }

    // Filter by tier if specified
    if (tier) {
      const validTiers = ['vip', 'regular', 'occasional', 'new', 'at_risk'];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({
          success: false,
          error: `Invalid tier. Must be one of: ${validTiers.join(', ')}`
        });
      }
      query = query.eq('customer_tier', tier);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        total: data.length,
        customers: data
      }
    });

  } catch (error) {
    logger.error('Error listing customers:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list customers'
    });
  }
}

/**
 * Get LTV statistics summary
 */
async function handleStats(req, res) {
  try {
    const { restaurant_id } = req.query;

    // Get all customer LTV data
    let query = supabaseAdmin
      .from('customer_ltv')
      .select('*');

    // Filter by restaurant if specified
    if (restaurant_id) {
      query = query.eq('restaurant_id', restaurant_id);
    }

    const { data: customers, error } = await query;

    if (error) throw error;

    if (!customers || customers.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          total_customers: 0,
          total_ltv: 0,
          avg_ltv: 0,
          tiers: { vip: 0, regular: 0, occasional: 0, new: 0, at_risk: 0 },
          high_risk_customers: 0
        }
      });
    }

    // Calculate statistics
    const totalLTV = customers.reduce((sum, c) => sum + (c.lifetime_value || 0), 0);
    const avgLTV = totalLTV / customers.length;

    // Count by tier
    const tiers = {
      vip: customers.filter(c => c.customer_tier === 'vip').length,
      regular: customers.filter(c => c.customer_tier === 'regular').length,
      occasional: customers.filter(c => c.customer_tier === 'occasional').length,
      new: customers.filter(c => c.customer_tier === 'new').length,
      at_risk: customers.filter(c => c.customer_tier === 'at_risk').length
    };

    // Count high churn risk customers (score > 70)
    const highRiskCustomers = customers.filter(c => c.churn_risk_score > 70).length;

    return res.status(200).json({
      success: true,
      data: {
        total_customers: customers.length,
        total_ltv: Math.round(totalLTV * 100) / 100,
        avg_ltv: Math.round(avgLTV * 100) / 100,
        tiers: tiers,
        high_risk_customers: highRiskCustomers
      }
    });

  } catch (error) {
    logger.error('Error calculating LTV stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate LTV statistics'
    });
  }
}

/**
 * Get LTV trend analytics over time
 */
async function handleTrends(req, res) {
  try {
    const { period = '30d', restaurant_id } = req.query;

    // Calculate date range
    const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get historical revenue data
    let query = supabaseAdmin
      .from('revenue_records')
      .select('service_date, total_revenue, customer_id')
      .gte('service_date', startDateStr)
      .order('service_date', { ascending: true });

    if (restaurant_id) {
      query = query.eq('restaurant_id', restaurant_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          period: period,
          trends: [],
          summary: {
            total_revenue: 0,
            total_customers: 0,
            avg_per_customer: 0
          }
        }
      });
    }

    // Group by date
    const byDate = {};
    const allCustomers = new Set();

    data.forEach(record => {
      const date = record.service_date;
      if (!byDate[date]) {
        byDate[date] = { revenue: 0, customers: new Set() };
      }
      byDate[date].revenue += parseFloat(record.total_revenue) || 0;
      byDate[date].customers.add(record.customer_id);
      allCustomers.add(record.customer_id);
    });

    // Convert to array and calculate metrics
    const trends = Object.entries(byDate)
      .map(([date, stats]) => ({
        date,
        revenue: Math.round(stats.revenue * 100) / 100,
        unique_customers: stats.customers.size,
        avg_per_customer: stats.customers.size > 0
          ? Math.round((stats.revenue / stats.customers.size) * 100) / 100
          : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate summary
    const totalRevenue = trends.reduce((sum, t) => sum + t.revenue, 0);

    return res.status(200).json({
      success: true,
      data: {
        period: period,
        start_date: startDateStr,
        end_date: new Date().toISOString().split('T')[0],
        trends: trends,
        summary: {
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_unique_customers: allCustomers.size,
          avg_per_customer: allCustomers.size > 0
            ? Math.round((totalRevenue / allCustomers.size) * 100) / 100
            : 0,
          avg_daily_revenue: trends.length > 0
            ? Math.round((totalRevenue / trends.length) * 100) / 100
            : 0
        }
      }
    });

  } catch (error) {
    logger.error('Error calculating LTV trends:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate LTV trends'
    });
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
      available_actions: ['calculate', 'calculate-all', 'get', 'list', 'stats']
    });
  }

  try {
    switch (action) {
      case 'calculate':
        return await handleCalculateSingle(req, res);

      case 'calculate-all':
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
          available_actions: ['calculate', 'calculate-all', 'get', 'list', 'stats', 'trends']
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
