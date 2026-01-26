/**
 * Customer Lifetime Value (LTV) API
 *
 * Serverless function for LTV operations:
 * - Calculate LTV for individual customers
 * - Batch calculate all customers
 * - Get stored LTV data
 * - List customers by tier
 */

const { createClient } = require('@supabase/supabase-js');
const {
  calculateCustomerLTV,
  calculateAllCustomerLTV,
  upsertCustomerLTV
} = require('./services/ltvCalculator');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * Calculate LTV for a single customer
 */
async function handleCalculateSingle(req, res) {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: customer_id'
      });
    }

    const ltvData = await calculateCustomerLTV(customer_id);

    // Store calculated LTV
    await upsertCustomerLTV(ltvData);

    return res.status(200).json({
      success: true,
      data: ltvData
    });

  } catch (error) {
    console.error('Error calculating LTV:', error);
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
    console.log('Starting batch LTV calculation...');
    const results = await calculateAllCustomerLTV();

    return res.status(200).json({
      success: true,
      message: `Successfully calculated LTV for ${results.length} customers`,
      data: {
        total_customers: results.length,
        customers: results
      }
    });

  } catch (error) {
    console.error('Error in batch LTV calculation:', error);
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

    const { data, error } = await supabase
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
    console.error('Error fetching LTV data:', error);
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
    const { tier, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from('customer_ltv')
      .select('*')
      .order('lifetime_value', { ascending: false })
      .range(offset, offset + limit - 1);

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
    console.error('Error listing customers:', error);
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
    // Get all customer LTV data
    const { data: customers, error } = await supabase
      .from('customer_ltv')
      .select('*');

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
    console.error('Error calculating LTV stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate LTV statistics'
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
  const rateLimited = checkAndApplyRateLimit(req, res, 'api');
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

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['calculate', 'calculate-all', 'get', 'list', 'stats']
        });
    }
  } catch (error) {
    console.error('LTV API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
