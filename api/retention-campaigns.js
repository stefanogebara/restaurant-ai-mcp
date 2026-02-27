/**
 * Retention Campaigns API
 *
 * Serverless function for retention campaign operations:
 * - Create retention campaigns for at-risk customers
 * - List campaign history
 * - Get campaign statistics
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { sendRetentionCampaignEmail } = require('./_lib/email');
const logger = createSecureLogger('RetentionCampaigns');

/**
 * Create a new retention campaign
 */
async function handleCreate(req, res) {
  try {
    const { customer_id, campaign_type, message, channel } = req.body;

    if (!customer_id || !campaign_type || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customer_id, campaign_type, message'
      });
    }

    const validTypes = ['win_back', 'loyalty_reward', 'reservation_reminder'];
    if (!validTypes.includes(campaign_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid campaign_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .insert({
        customer_id,
        campaign_type,
        message,
        channel: channel || 'email',
        status: 'pending',
        restaurant_id: req.user.restaurant_id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Send the campaign email if channel is email
    if (data.channel === 'email') {
      // Look up customer email from customer_ltv (has email from reservation data)
      const { data: customer } = await supabaseAdmin
        .schema('restaurant')
        .from('customer_ltv')
        .select('customer_email, customer_name')
        .eq('customer_id', customer_id)
        .eq('restaurant_id', req.user.restaurant_id)
        .single();

      if (customer?.customer_email) {
        const result = await sendRetentionCampaignEmail({
          customerEmail: customer.customer_email,
          customerName: customer.customer_name,
          message,
          campaignType: campaign_type,
        });

        await supabaseAdmin
          .schema('restaurant')
          .from('retention_campaigns')
          .update({
            status: result.sent ? 'sent' : 'failed',
            sent_at: result.sent ? new Date().toISOString() : null,
          })
          .eq('id', data.id);
      } else {
        logger.warn(`No email found for customer ${customer_id}, marking campaign as failed`);
        await supabaseAdmin
          .schema('restaurant')
          .from('retention_campaigns')
          .update({ status: 'failed' })
          .eq('id', data.id);
      }
    } else {
      // SMS/WhatsApp channels - mark as pending for future implementation
      logger.info(`Campaign ${data.id} uses ${data.channel} channel - queued for future delivery`);
    }

    logger.info(`Created retention campaign ${data.id} for customer ${customer_id}`);

    return res.status(200).json({ success: true, data });

  } catch (error) {
    logger.error('Error creating campaign:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create campaign'
    });
  }
}

/**
 * List campaigns for a customer or all
 */
async function handleList(req, res) {
  try {
    const { customer_id, limit = 50, offset = 0 } = req.query;
    const restaurantId = req.user.restaurant_id;

    let query = supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (customer_id) {
      query = query.eq('customer_id', customer_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        total: data.length,
        campaigns: data
      }
    });

  } catch (error) {
    logger.error('Error listing campaigns:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list campaigns'
    });
  }
}

/**
 * Get campaign statistics
 */
async function handleStats(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .select('campaign_type, status, created_at')
      .eq('restaurant_id', restaurantId);

    if (error) throw error;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      total: data.length,
      by_type: {},
      by_status: {},
      last_30_days: data.filter(c =>
        new Date(c.created_at) > thirtyDaysAgo
      ).length
    };

    data.forEach(c => {
      stats.by_type[c.campaign_type] = (stats.by_type[c.campaign_type] || 0) + 1;
      stats.by_status[c.status] = (stats.by_status[c.status] || 0) + 1;
    });

    return res.status(200).json({ success: true, data: stats });

  } catch (error) {
    logger.error('Error getting campaign stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get campaign statistics'
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

  // Apply rate limiting
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access retention campaigns'
    });
  }
  req.user = authResult.user;

  // Check subscription status
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return;

  // Check feature access - advanced_analytics required
  let featureAllowed = false;
  requireFeature('advanced_analytics')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return;

  const { action } = req.query;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action',
      available_actions: ['create', 'list', 'stats']
    });
  }

  try {
    switch (action) {
      case 'create':
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
        }
        return await handleCreate(req, res);

      case 'list':
        return await handleList(req, res);

      case 'stats':
        return await handleStats(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['create', 'list', 'stats']
        });
    }
  } catch (error) {
    logger.error('Retention Campaigns API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
