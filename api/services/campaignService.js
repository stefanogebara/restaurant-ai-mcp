/**
 * Campaign Service
 *
 * WhatsApp marketing campaign engine:
 * - Create campaigns with audience segments
 * - Send in rate-limited batches
 * - Track delivery status
 * - Handle opt-out
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage, sendTemplateMessage } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('CampaignService');

/**
 * Get customers matching a segment for a restaurant.
 * @param {string} restaurantId
 * @param {string} segment - all | vip | at_risk | birthday_this_month | inactive_30d | new_customers
 * @returns {Promise<Array<{phone: string, name: string}>>}
 */
async function getSegmentCustomers(restaurantId, segment) {
  let query = supabaseAdmin
    .schema('restaurant')
    .from('customer_ltv')
    .select('customer_phone, customer_name, customer_tier, total_visits, last_visit_date, special_occasions')
    .eq('restaurant_id', restaurantId)
    .not('customer_phone', 'is', null);

  switch (segment) {
    case 'vip':
      query = query.eq('customer_tier', 'vip');
      break;
    case 'at_risk':
      query = query.eq('customer_tier', 'at_risk');
      break;
    case 'new_customers':
      query = query.in('customer_tier', ['new', 'occasional']);
      break;
    case 'inactive_30d': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = query.lt('last_visit_date', thirtyDaysAgo);
      break;
    }
    case 'birthday_this_month':
      // Will filter in JS since birthday data is in JSONB
      break;
    case 'all':
    default:
      break;
  }

  const { data, error } = await query.limit(500);

  if (error) {
    logger.error('Failed to fetch segment customers', { error: error.message, segment });
    return [];
  }

  let customers = (data || []).map(c => ({
    phone: c.customer_phone,
    name: c.customer_name || '',
  }));

  // Birthday filter — check special_occasions for birthday with this month
  if (segment === 'birthday_this_month') {
    const currentMonth = new Date().getMonth() + 1;
    customers = (data || [])
      .filter(c => {
        const occasions = c.special_occasions;
        if (!occasions) return false;
        const birthday = occasions.birthday || occasions.Birthday;
        if (!birthday?.date) return false;
        const month = new Date(birthday.date).getMonth() + 1;
        return month === currentMonth;
      })
      .map(c => ({ phone: c.customer_phone, name: c.customer_name || '' }));
  }

  return customers;
}

/**
 * Create a campaign and populate its recipient list.
 */
// Map segment → default WhatsApp template
const SEGMENT_TEMPLATE_MAP = {
  birthday_this_month: 'seatable_birthday',
  inactive_30d: 'seatable_reengagement',
  at_risk: 'seatable_reengagement',
  all: 'seatable_promotion',
  vip: 'seatable_promotion',
  new_customers: 'seatable_promotion',
};

async function createCampaign(restaurantId, { name, segment, message, scheduledAt, campaignType, whatsappTemplateName }) {
  // Get segment customers
  const customers = await getSegmentCustomers(restaurantId, segment);

  if (customers.length === 0) {
    return { success: false, error: 'No customers found for this segment' };
  }

  // Filter out opted-out customers
  const phones = customers.map(c => c.phone);
  const { data: optedOut } = await supabaseAdmin
    .from('customer_consent')
    .select('customer_phone')
    .eq('restaurant_id', restaurantId)
    .eq('consent_type', 'marketing')
    .eq('opted_in', false)
    .in('customer_phone', phones);

  const optedOutPhones = new Set((optedOut || []).map(c => c.customer_phone));
  const eligibleCustomers = customers.filter(c => !optedOutPhones.has(c.phone));

  if (eligibleCustomers.length === 0) {
    return { success: false, error: 'All customers in this segment have opted out' };
  }

  // Create campaign record
  const { data: campaign, error: campaignErr } = await supabaseAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .insert({
      restaurant_id: restaurantId,
      campaign_type: campaignType || 'win_back',
      message,
      channel: 'whatsapp',
      whatsapp_template_name: whatsappTemplateName || SEGMENT_TEMPLATE_MAP[segment] || 'seatable_promotion',
      status: scheduledAt ? 'scheduled' : 'active',
      scheduled_at: scheduledAt || null,
      segment_name: segment,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (campaignErr) {
    logger.error('Failed to create campaign', { error: campaignErr.message });
    return { success: false, error: campaignErr.message };
  }

  // Create recipient records
  const recipients = eligibleCustomers.map(c => ({
    campaign_id: campaign.id,
    restaurant_id: restaurantId,
    customer_phone: c.phone,
    customer_name: c.name,
    status: 'pending',
  }));

  const { error: recipientErr } = await supabaseAdmin
    .from('campaign_recipients')
    .insert(recipients);

  if (recipientErr) {
    logger.error('Failed to create campaign recipients', { error: recipientErr.message });
  }

  logger.info('Campaign created', {
    campaignId: campaign.id,
    segment,
    totalRecipients: eligibleCustomers.length,
    optedOut: optedOutPhones.size,
  });

  return {
    success: true,
    data: {
      ...campaign,
      recipient_count: eligibleCustomers.length,
      opted_out_count: optedOutPhones.size,
    },
  };
}

/**
 * Send next batch of campaign messages.
 * @param {string} campaignId
 * @param {number} batchSize
 * @returns {number} Messages sent
 */
async function sendCampaignBatch(campaignId, batchSize = 10) {
  // Get campaign details
  const { data: campaign, error: campErr } = await supabaseAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .select('id, message, status, restaurant_id, whatsapp_template_name, channel')
    .eq('id', campaignId)
    .single();

  if (campErr || !campaign) {
    logger.error('Campaign not found', { campaignId });
    return 0;
  }

  if (campaign.status !== 'active' && campaign.status !== 'sending') {
    return 0;
  }

  // Fetch next batch of pending recipients
  const { data: recipients, error: recErr } = await supabaseAdmin
    .from('campaign_recipients')
    .select('id, customer_phone, customer_name')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at')
    .limit(batchSize);

  if (recErr || !recipients?.length) {
    // No more recipients — mark campaign as completed
    if (!recErr) {
      await supabaseAdmin
        .schema('restaurant')
        .from('retention_campaigns')
        .update({ status: 'completed' })
        .eq('id', campaignId);
    }
    return 0;
  }

  // Update campaign status to 'sending'
  await supabaseAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId);

  // Fetch restaurant name for template personalization
  let restaurantName = 'our restaurant';
  try {
    const { data: rc } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name')
      .eq('id', campaign.restaurant_id)
      .single();
    if (rc?.restaurant_name) restaurantName = rc.restaurant_name;
  } catch { /* keep default */ }

  let sentCount = 0;

  for (const recipient of recipients) {
    const customerName = recipient.customer_name || '';
    let result;

    if (campaign.channel === 'whatsapp' && campaign.whatsapp_template_name) {
      // Build body parameters: all templates use {{1}}=name, {{2}}=restaurant
      // seatable_promotion also uses {{3}}=message
      const bodyParams = [customerName, restaurantName];
      if (campaign.whatsapp_template_name === 'seatable_promotion' && campaign.message) {
        bodyParams.push(campaign.message);
      }
      result = await sendTemplateMessage(
        recipient.customer_phone,
        campaign.whatsapp_template_name,
        'en',
        bodyParams,
      );
    } else {
      const personalizedMsg = (campaign.message || '')
        .replace(/\{name\}/g, customerName)
        .replace(/\{phone\}/g, recipient.customer_phone || '');
      result = await sendWhatsAppMessage(recipient.customer_phone, personalizedMsg);
    }

    if (result.success) {
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          whatsapp_message_id: result.messageId || null,
        })
        .eq('id', recipient.id);
      sentCount++;
    } else {
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'failed',
          error: result.error || 'Send failed',
        })
        .eq('id', recipient.id);
    }
  }

  // Update campaign sent_count
  const { data: currentCampaign } = await supabaseAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .select('sent_count')
    .eq('id', campaignId)
    .single();

  await supabaseAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .update({ sent_count: (currentCampaign?.sent_count || 0) + sentCount })
    .eq('id', campaignId);

  logger.info('Campaign batch sent', { campaignId, sent: sentCount, total: recipients.length });
  return sentCount;
}

/**
 * Process all active/scheduled campaigns.
 * Called by the cron job every 5 minutes.
 */
async function processActiveCampaigns() {
  // Activate scheduled campaigns whose time has come
  const now = new Date().toISOString();
  await supabaseAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .update({ status: 'active' })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);

  // Fetch active/sending campaigns
  const { data: campaigns, error } = await supabaseAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .select('id')
    .eq('channel', 'whatsapp')
    .in('status', ['active', 'sending'])
    .limit(10);

  if (error || !campaigns?.length) return 0;

  let totalSent = 0;
  for (const campaign of campaigns) {
    const sent = await sendCampaignBatch(campaign.id, 10);
    totalSent += sent;
  }

  return totalSent;
}

/**
 * Handle opt-out from marketing messages.
 */
async function handleOptOut(restaurantId, customerPhone) {
  const { error } = await supabaseAdmin
    .from('customer_consent')
    .upsert({
      restaurant_id: restaurantId,
      customer_phone: customerPhone,
      consent_type: 'marketing',
      opted_in: false,
      opted_out_at: new Date().toISOString(),
    }, { onConflict: 'restaurant_id,customer_phone,consent_type' });

  if (error) {
    logger.error('Failed to record opt-out', { error: error.message });
    return false;
  }

  // Also mark any pending campaign recipients as opted_out
  await supabaseAdmin
    .from('campaign_recipients')
    .update({ status: 'opted_out' })
    .eq('restaurant_id', restaurantId)
    .eq('customer_phone', customerPhone)
    .eq('status', 'pending');

  logger.info('Customer opted out of marketing', {
    phone: customerPhone.slice(0, 4) + '***',
    restaurantId,
  });

  return true;
}

/**
 * Update delivery status from WhatsApp webhook.
 * @param {string} whatsappMessageId
 * @param {string} status - sent | delivered | read | failed
 */
async function updateDeliveryStatus(whatsappMessageId, status) {
  if (!whatsappMessageId) return;

  const updates = {};
  if (status === 'delivered') {
    updates.status = 'delivered';
    updates.delivered_at = new Date().toISOString();
  } else if (status === 'read') {
    updates.status = 'read';
    updates.read_at = new Date().toISOString();
  } else if (status === 'failed') {
    updates.status = 'failed';
  }

  if (Object.keys(updates).length === 0) return;

  const { data, error } = await supabaseAdmin
    .from('campaign_recipients')
    .update(updates)
    .eq('whatsapp_message_id', whatsappMessageId)
    .select('campaign_id')
    .maybeSingle();

  if (error || !data) return;

  // Update campaign aggregate counts via RPC or read-then-write
  try {
    const { data: camp } = await supabaseAdmin
      .schema('restaurant')
      .from('retention_campaigns')
      .select('delivered_count, read_count')
      .eq('id', data.campaign_id)
      .single();

    if (camp) {
      const countUpdates = {};
      if (status === 'delivered') countUpdates.delivered_count = (camp.delivered_count || 0) + 1;
      if (status === 'read') countUpdates.read_count = (camp.read_count || 0) + 1;

      if (Object.keys(countUpdates).length > 0) {
        await supabaseAdmin
          .schema('restaurant')
          .from('retention_campaigns')
          .update(countUpdates)
          .eq('id', data.campaign_id);
      }
    }
  } catch (e) {
    // Best-effort count update
  }
}

/**
 * Get campaign delivery stats.
 */
async function getCampaignStats(campaignId) {
  const { data: recipients, error } = await supabaseAdmin
    .from('campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId);

  if (error) return null;

  const stats = { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, opted_out: 0 };
  for (const r of recipients || []) {
    stats.total++;
    stats[r.status] = (stats[r.status] || 0) + 1;
  }

  return stats;
}

module.exports = {
  getSegmentCustomers,
  createCampaign,
  sendCampaignBatch,
  processActiveCampaigns,
  handleOptOut,
  updateDeliveryStatus,
  getCampaignStats,
};
