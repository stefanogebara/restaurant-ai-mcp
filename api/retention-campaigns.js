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
const { buildUnsubscribeUrl } = require('./_lib/unsubscribe-url');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createCampaign, sendCampaignBatch, getCampaignStats, getSegmentCustomers } = require('./_services/campaignService');
const logger = createSecureLogger('RetentionCampaigns');

/**
 * Create a new retention campaign
 */
async function handleCreate(req, res) {
  try {
    const { customer_id, campaign_type, message, channel, language } = req.body;

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

    if (channel && channel !== 'email') {
      return res.status(422).json({ success: false, error: 'Only email is supported for individual campaigns' });
    }

    // Resolve the guest inside the authenticated restaurant before writing a
    // campaign or sending anything. A customer ID from another tenant must
    // never become a row in this restaurant's history.
    const { data: customer, error: customerLookupErr } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('customer_email, customer_name, customer_phone')
      .eq('customer_id', customer_id)
      .eq('restaurant_id', req.user.restaurant_id)
      .maybeSingle();

    if (customerLookupErr) throw customerLookupErr;
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    if (!customer.customer_email) {
      return res.status(422).json({ success: false, error: 'Customer has no email address' });
    }
    if (!customer.customer_phone) {
      return res.status(422).json({ success: false, error: 'Customer has no phone number for marketing consent' });
    }

    const { data: optOut, error: consentError } = await supabaseAdmin
      .from('customer_consent')
      .select('customer_phone')
      .eq('restaurant_id', req.user.restaurant_id)
      .eq('customer_phone', customer.customer_phone)
      .eq('consent_type', 'marketing')
      .eq('opted_in', false)
      .maybeSingle();

    if (consentError) throw consentError;
    if (optOut) {
      return res.status(422).json({ success: false, error: 'Customer opted out of marketing' });
    }

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .insert({
        customer_id,
        campaign_type,
        message,
        channel: 'email',
        status: 'pending',
        restaurant_id: req.user.restaurant_id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    const result = await sendRetentionCampaignEmail({
      customerEmail: customer.customer_email,
      customerName: customer.customer_name,
      message,
      campaignType: campaign_type,
      language: /^(pt|es|en)(-|$)/i.test(language || '') ? language : 'pt-BR',
      unsubscribeUrl: buildUnsubscribeUrl(req.user.restaurant_id, customer.customer_phone),
    });

    const sentAt = result.sent ? new Date().toISOString() : null;
    const { error: statusError } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .update({ status: result.sent ? 'sent' : 'failed', sent_at: sentAt })
      .eq('id', data.id)
      .eq('restaurant_id', req.user.restaurant_id);

    if (statusError) {
      logger.error('Could not persist email campaign delivery state', { campaignId: data.id, error: statusError.message });
    }

    if (!result.sent) {
      return res.status(502).json({ success: false, error: 'Email could not be sent', data: { id: data.id, status: 'failed' } });
    }

    logger.info(`Created retention campaign ${data.id} for customer ${customer_id}`);

    return res.status(200).json({
      success: true,
      data: { ...data, status: 'sent', sent_at: sentAt },
      ...(statusError ? { warning: 'Email accepted but campaign status could not be saved' } : {}),
    });

  } catch (error) {
    logger.error('Error creating campaign:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create campaign'
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
      .select('id, restaurant_id, customer_id, campaign_type, channel, status, message, scheduled_at, sent_at, opened_at, converted_at, conversion_value, metadata, created_at, whatsapp_template_name, sent_count, delivered_count, read_count')
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
        campaigns: data.map(campaign => ({
          ...campaign,
          failed_count: 0,
          recipient_count: 0,
          segment_name: campaign.metadata?.segment_name || '',
          // Surface the user-entered campaign name (stored in metadata —
          // the table has no `name` column) so CampaignList can render it
          // instead of falling back to the message preview.
          name: campaign.metadata?.name || null,
        }))
      }
    });

  } catch (error) {
    logger.error('Error listing campaigns:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list campaigns'
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
      error: 'Failed to get campaign statistics'
    });
  }
}

/**
 * Create a WhatsApp campaign with segment targeting.
 * Bulk email is deliberately unavailable until there is an email-specific
 * recipient model, consent check and delivery worker.
 */
async function handleCreateWhatsApp(req, res) {
  try {
    const { name, segment, message, scheduled_at, campaign_type, template_name, channel } = req.body;

    if (!segment) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: segment',
      });
    }

    const validSegments = ['all', 'vip', 'at_risk', 'birthday_this_month', 'inactive_30d', 'new_customers'];
    if (!validSegments.includes(segment)) {
      return res.status(400).json({
        success: false,
        error: `Invalid segment. Must be one of: ${validSegments.join(', ')}`,
      });
    }

    if (channel && channel !== 'whatsapp') {
      return res.status(422).json({ success: false, error: 'Bulk email campaigns are not supported' });
    }

    const result = await createCampaign(req.user.restaurant_id, {
      name: name || `${segment} campaign`,
      segment,
      message: message || '',
      scheduledAt: scheduled_at || null,
      campaignType: campaign_type || 'win_back',
      whatsappTemplateName: template_name || null,
      channel: 'whatsapp',
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error creating WhatsApp campaign:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Get delivery stats for a specific campaign
 */
async function handleCampaignDeliveryStats(req, res) {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) {
      return res.status(400).json({ success: false, error: 'Missing campaign_id' });
    }

    const { data: campaign, error: lookupError } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .select('id')
      .eq('id', campaign_id)
      .eq('restaurant_id', req.user.restaurant_id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const stats = await getCampaignStats(campaign_id);
    if (!stats) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    logger.error('Error getting campaign delivery stats:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Trigger immediate send for a campaign
 */
async function handleSend(req, res) {
  try {
    const { campaign_id } = req.body;
    if (!campaign_id) {
      return res.status(400).json({ success: false, error: 'Missing campaign_id' });
    }

    const restaurantId = req.user.restaurant_id;
    const { data: campaign, error: lookupError } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .select('id, channel, status')
      .eq('id', campaign_id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    if (campaign.channel !== 'whatsapp') {
      return res.status(422).json({ success: false, error: 'This campaign has no supported send path' });
    }
    if (!['pending', 'scheduled'].includes(campaign.status)) {
      return res.status(409).json({ success: false, error: 'Campaign is not ready to send' });
    }

    // Claim only this restaurant's WhatsApp campaign in a sendable state.
    const { data: activated, error: activationError } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .update({ status: 'active' })
      .eq('id', campaign_id)
      .eq('restaurant_id', restaurantId)
      .eq('channel', 'whatsapp')
      .eq('status', campaign.status)
      .select('id')
      .maybeSingle();

    if (activationError) throw activationError;
    if (!activated) {
      return res.status(409).json({ success: false, error: 'Campaign state changed; refresh and try again' });
    }

    // Send first batch immediately
    const sent = await sendCampaignBatch(campaign_id, 10);

    return res.status(200).json({ success: true, sent });
  } catch (error) {
    logger.error('Error triggering campaign send:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Get segment preview (customer counts per segment)
 */
async function handleSegments(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const segments = ['all', 'vip', 'at_risk', 'birthday_this_month', 'inactive_30d', 'new_customers'];

    const results = await Promise.all(
      segments.map(segment => getSegmentCustomers(restaurantId, segment))
    );
    const counts = Object.fromEntries(segments.map((s, i) => [s, results[i].length]));

    return res.status(200).json({ success: true, data: counts });
  } catch (error) {
    logger.error('Error getting segment counts:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Main serverless function handler
 */
module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

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

      case 'create_whatsapp':
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
        }
        return await handleCreateWhatsApp(req, res);

      case 'list':
        return await handleList(req, res);

      case 'stats':
        return await handleStats(req, res);

      case 'campaign_stats':
        return await handleCampaignDeliveryStats(req, res);

      case 'send':
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
        }
        return await handleSend(req, res);

      case 'segments':
        return await handleSegments(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['create', 'create_whatsapp', 'list', 'stats', 'campaign_stats', 'send', 'segments']
        });
    }
  } catch (error) {
    logger.error('Retention Campaigns API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
