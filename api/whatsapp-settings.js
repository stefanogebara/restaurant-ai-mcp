/**
 * WhatsApp Settings API
 *
 * Authenticated endpoints for restaurant owners to manage WhatsApp integration.
 * URL pattern: /api/whatsapp-settings?action=...
 *
 * Actions:
 *   GET   ?action=status  - Connection status + wa.me link
 *   GET   ?action=stats   - WhatsApp session & message stats
 *   PATCH ?action=update  - Toggle enabled, set owner phone
 *   POST  ?action=test    - Send a test WhatsApp message
 */

const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { isWhatsAppConfigured, sendWhatsAppMessage } = require('./_lib/whatsapp-sender');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { initSentry, captureException } = require('./_lib/sentry');
initSentry();

const logger = createSecureLogger('WhatsAppSettings');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limit
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  // Auth required for all actions
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const restaurantId = auth.user?.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant configured' });
  }

  const action = req.query.action || (req.body && req.body.action);

  try {
    switch (action) {
      case 'status':
        return await handleStatus(req, res, restaurantId);
      case 'stats':
        return await handleStats(req, res, restaurantId);
      case 'update':
        return await handleUpdate(req, res, restaurantId);
      case 'test':
        return await handleTest(req, res, restaurantId);
      case 'template_status':
        return await handleTemplateStatus(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: status, stats, update, test, template_status'
        });
    }
  } catch (error) {
    captureException(error, { url: req.url, method: req.method });
    logger.error('WhatsApp settings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again.'
    });
  }
};

// ============================================================
// GET ?action=status
// ============================================================
async function handleStatus(req, res, restaurantId) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('whatsapp_enabled, whatsapp_phone_number, restaurant_name')
    .eq('id', restaurantId)
    .single();

  if (error || !data) {
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }

  const displayPhone = process.env.WHATSAPP_DISPLAY_PHONE_NUMBER || '';
  const waMeLink = displayPhone
    ? `https://wa.me/${displayPhone.replace(/\D/g, '')}`
    : null;

  return res.status(200).json({
    success: true,
    data: {
      enabled: data.whatsapp_enabled || false,
      phone_number: data.whatsapp_phone_number || null,
      restaurant_name: data.restaurant_name,
      api_configured: isWhatsAppConfigured(),
      wa_me_link: waMeLink,
      display_phone: displayPhone,
    }
  });
}

// ============================================================
// GET ?action=stats
// ============================================================
async function handleStats(req, res, restaurantId) {
  // Count active WhatsApp sessions for this restaurant
  const { count: activeSessions } = await supabaseAdmin
    .schema('restaurant')
    .from('whatsapp_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gt('expires_at', new Date().toISOString());

  // Count total sessions (all time)
  const { count: totalSessions } = await supabaseAdmin
    .schema('restaurant')
    .from('whatsapp_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);

  // Count WhatsApp usage this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: usageData } = await supabaseAdmin
    .from('usage_tracking')
    .select('quantity')
    .eq('restaurant_id', restaurantId)
    .eq('metric_type', 'whatsapp')
    .gte('usage_date', monthStart.toISOString().split('T')[0]);

  const messagesThisMonth = (usageData || []).reduce((sum, row) => sum + (row.quantity || 0), 0);

  return res.status(200).json({
    success: true,
    data: {
      active_sessions: activeSessions || 0,
      total_sessions: totalSessions || 0,
      messages_this_month: messagesThisMonth,
    }
  });
}

// ============================================================
// PATCH ?action=update
// ============================================================
async function handleUpdate(req, res, restaurantId) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use PATCH.' });
  }

  const { enabled, phone_number } = req.body || {};

  const updates = {};
  if (typeof enabled === 'boolean') {
    updates.whatsapp_enabled = enabled;
  }
  if (typeof phone_number === 'string') {
    // Basic phone validation
    const cleaned = phone_number.replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 15) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }
    updates.whatsapp_phone_number = phone_number;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update(updates)
    .eq('id', restaurantId)
    .select('whatsapp_enabled, whatsapp_phone_number')
    .single();

  if (error) {
    logger.error('Failed to update WhatsApp settings:', error);
    return res.status(500).json({ success: false, error: 'Failed to update settings' });
  }

  logger.info(`WhatsApp settings updated for ${restaurantId}:`, updates);

  return res.status(200).json({
    success: true,
    data: {
      enabled: data.whatsapp_enabled,
      phone_number: data.whatsapp_phone_number,
    }
  });
}

// ============================================================
// POST ?action=test
// ============================================================
async function handleTest(req, res, restaurantId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  const { phone_number } = req.body || {};
  if (!phone_number) {
    return res.status(400).json({ success: false, error: 'phone_number is required' });
  }

  if (!isWhatsAppConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'WhatsApp API not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.'
    });
  }

  // Get restaurant name for the test message
  const { data: config } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name')
    .eq('id', restaurantId)
    .single();

  const restaurantName = config?.restaurant_name || 'Your Restaurant';

  const result = await sendWhatsAppMessage(
    phone_number,
    `This is a test message from ${restaurantName} via Seatable. WhatsApp integration is working correctly!`
  );

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  return res.status(200).json({
    success: true,
    message: 'Test message sent successfully',
    messageId: result.messageId,
  });
}

// ============================================================
// GET ?action=template_status
// ============================================================
const OUR_TEMPLATES = [
  'seatable_feedback_request',
  'seatable_reengagement',
  'seatable_birthday',
  'seatable_promotion'
];

async function handleTemplateStatus(req, res) {
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (!wabaId) {
    return res.status(200).json({
      success: true,
      templates: [],
      missing_env: true,
      message: 'Add WHATSAPP_WABA_ID to your Vercel environment variables'
    });
  }

  const token = process.env.WHATSAPP_TOKEN || process.env.META_WHATSAPP_TOKEN;
  if (!token) {
    return res.status(200).json({
      success: true,
      templates: [],
      missing_env: true,
      message: 'Add WHATSAPP_TOKEN (or META_WHATSAPP_TOKEN) to your Vercel environment variables'
    });
  }

  const resp = await fetch(
    `https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=name,status,category&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    logger.error('[WhatsAppSettings] Template status fetch failed:', resp.status, errText);
    return res.status(200).json({ success: false, templates: [], error: `Meta API error: ${resp.status}` });
  }

  const data = await resp.json();
  const templates = (data.data || []).filter(t => OUR_TEMPLATES.includes(t.name));

  return res.status(200).json({ success: true, templates });
}
