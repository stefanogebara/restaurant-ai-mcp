/**
 * POST /api/restaurant-learning/chat
 *
 * Process interview messages during the restaurant learning flow.
 * Body: { session_id, message }
 * Response: { ai_message, extracted_data_updates, quick_replies?, completion_percentage, is_complete }
 *
 * Requires authentication (verifyAuth pattern).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { verifyAuth } = require('../_lib/auth');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { processInterviewMessage, INTERVIEW_TOPICS } = require('../services/learningInterview');

const logger = createSecureLogger('RestaurantChat');

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  // CORS headers
  const allowedOrigin = process.env.CLIENT_URL;
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting (chat tier - expensive AI operations)
  const blocked = await checkAndApplyRateLimit(req, res, 'chat');
  if (blocked) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ error: 'No restaurant associated with this account' });
  }

  try {
    const { session_id, message } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // UUID format validation
    if (!UUID_REGEX.test(session_id)) {
      return res.status(400).json({ error: 'Invalid session_id format' });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required and must be non-empty' });
    }

    // Limit message length to prevent abuse
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
    }

    // IDOR protection: verify session belongs to this user's restaurant
    const { data: session, error: sessionError } = await supabaseAdmin
      .schema('restaurant')
      .from('learning_interviews')
      .select('restaurant_config_id')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    if (session.restaurant_config_id !== restaurantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    logger.info('Processing interview message:', { session_id });

    const result = await processInterviewMessage(session_id, message.trim());

    return res.status(200).json({
      success: true,
      ai_message: result.ai_message,
      extracted_data_updates: result.extracted_data_updates,
      quick_replies: result.quick_replies,
      completion_percentage: result.completion_percentage,
      is_complete: result.is_complete,
      current_topic: result.current_topic,
      current_topic_label: result.current_topic_label,
      topics_covered: result.topics_covered
    });
  } catch (error) {
    logger.error('Chat endpoint error', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack?.split('\n').slice(0, 5).join(' | '),
    });
    return res.status(500).json({
      error: error?.message || 'Failed to process message',
    });
  }
};
