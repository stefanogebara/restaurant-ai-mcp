/**
 * POST /api/restaurant-learning/generate-persona
 *
 * Generate the restaurant AI persona from interview + intelligence data.
 * Body: { session_id }
 * Response: { persona_summary, restaurant_profile, greeting_preview }
 *
 * Requires authentication (verifyAuth pattern).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { verifyAuth } = require('../_lib/auth');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { generatePersona } = require('../services/personaGenerator');

const logger = createSecureLogger('GeneratePersona');

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

  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // UUID format validation
    if (!UUID_REGEX.test(session_id)) {
      return res.status(400).json({ error: 'Invalid session_id format' });
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

    logger.info('Generating persona for session:', session_id);

    const result = await generatePersona(session_id);

    // Update learning status
    if (supabaseAdmin) {
      await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ learning_status: 'persona_generated' })
        .eq('id', restaurantId);
    }

    logger.info('Persona generated successfully:', {
      session_id,
      has_summary: !!result.persona_summary
    });

    return res.status(200).json({
      success: true,
      persona_summary: result.persona_summary,
      restaurant_profile: result.restaurant_profile,
      greeting_preview: result.greeting_preview
    });
  } catch (error) {
    logger.error('Generate persona error:', error);
    return res.status(500).json({
      error: 'Failed to generate persona'
    });
  }
};
