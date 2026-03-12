/**
 * Guest Feedback API
 *
 * GET  /api/guest-feedback?action=stats&range=7d — feedback stats + recent
 * GET  /api/guest-feedback?action=list&limit=20 — paginated feedback list
 * PATCH /api/guest-feedback?action=update&id=UUID — mark as read/flagged
 * GET  /api/guest-feedback?action=config — get feedback config
 * PATCH /api/guest-feedback?action=config — update feedback config
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { getFeedbackStats } = require('./services/feedbackService');

const logger = createSecureLogger('GuestFeedbackAPI');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ error: authResult.error });
  }
  req.user = authResult.user;
  const restaurantId = req.user.restaurant_id;

  const { action } = req.query;

  try {
    switch (action) {
      case 'stats':
        return await handleStats(req, res, restaurantId);
      case 'list':
        return await handleList(req, res, restaurantId);
      case 'update':
        return await handleUpdate(req, res, restaurantId);
      case 'config':
        if (req.method === 'PATCH') return await handleUpdateConfig(req, res, restaurantId);
        return await handleGetConfig(req, res, restaurantId);
      default:
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid action',
          available_actions: ['stats', 'list', 'update', 'config'],
        });
    }
  } catch (error) {
    logger.error('GuestFeedback API error', { error: error.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

async function handleStats(req, res, restaurantId) {
  const range = req.query.range || '7d';
  const days = parseInt(range) || 7;
  const stats = await getFeedbackStats(restaurantId, days);
  return res.status(200).json({ success: true, data: stats });
}

async function handleList(req, res, restaurantId) {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const { data, error } = await supabaseAdmin
    .from('guest_feedback')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return res.status(200).json({ success: true, data: data || [] });
}

async function handleUpdate(req, res, restaurantId) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Use PATCH' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const allowedFields = ['status'];
  const updates = {};
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .from('guest_feedback')
    .update(updates)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) throw error;

  return res.status(200).json({ success: true, data });
}

async function handleGetConfig(req, res, restaurantId) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('feedback_config')
    .eq('id', restaurantId)
    .maybeSingle();

  if (error) throw error;

  return res.status(200).json({
    success: true,
    data: data?.feedback_config || { enabled: false, delay_minutes: 60, message_template: null },
  });
}

async function handleUpdateConfig(req, res, restaurantId) {
  const { enabled, delay_minutes, message_template } = req.body;

  // Validate
  const config = {};
  if (typeof enabled === 'boolean') config.enabled = enabled;
  if (delay_minutes != null) {
    const parsed = parseInt(delay_minutes);
    if (isNaN(parsed) || parsed < 15 || parsed > 1440) {
      return res.status(400).json({ error: 'delay_minutes must be between 15 and 1440' });
    }
    config.delay_minutes = parsed;
  }
  if (message_template !== undefined) {
    config.message_template = message_template ? String(message_template).slice(0, 1000) : null;
  }

  // Merge with existing config
  const { data: existing } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('feedback_config')
    .eq('id', restaurantId)
    .single();

  const merged = { ...(existing?.feedback_config || { enabled: false, delay_minutes: 60, message_template: null }), ...config };

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ feedback_config: merged })
    .eq('id', restaurantId)
    .select('feedback_config')
    .single();

  if (error) throw error;

  return res.status(200).json({ success: true, data: data.feedback_config });
}
