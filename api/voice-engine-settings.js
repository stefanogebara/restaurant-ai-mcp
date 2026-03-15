/**
 * Voice Engine Settings API - Vercel Serverless Function
 * GET  /api/voice-engine-settings - Fetch current voice engine config
 * PATCH /api/voice-engine-settings - Switch engine or update OpenAI voice
 *
 * Manages the voice_engine, openai_voice_id, and voice_engine_status columns
 * on restaurant.restaurant_config.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('VoiceEngineSettings');

const { setInternalCors, handlePreflight } = require('./_lib/cors');
const VALID_ENGINES = ['elevenlabs', 'openai_realtime'];
const VALID_OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const VALID_STATUSES = ['active', 'testing', 'disabled'];

module.exports = async (req, res) => {
  // CORS headers
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'voice_engine_settings', 30, 60);
  if (rateLimited) return;

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  req.user = authResult.user;

  // Check subscription + voice_ai feature access (Growth+ only)
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return;

  let featureAllowed = false;
  requireFeature('voice_ai')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return;

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res);
  } else {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET or PATCH.'
    });
  }
};

/**
 * GET - Fetch current voice engine configuration from restaurant_config.
 */
async function handleGet(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'No restaurant associated with this account'
      });
    }

    const { data: config, error: dbError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('voice_engine, voice_engine_status, openai_voice_id, elevenlabs_agent_id')
      .eq('id', restaurantId)
      .single();

    if (dbError || !config) {
      logger.error('[VoiceEngineSettings GET] DB error:', dbError);
      return res.status(404).json({
        success: false,
        error: 'Restaurant configuration not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        voice_engine: config.voice_engine || 'elevenlabs',
        voice_engine_status: config.voice_engine_status || 'active',
        openai_voice_id: config.openai_voice_id || 'alloy',
        elevenlabs_agent_id: config.elevenlabs_agent_id || null,
      }
    });
  } catch (error) {
    logger.error('[VoiceEngineSettings GET] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again.'
    });
  }
}

/**
 * PATCH - Update voice engine and/or OpenAI voice selection.
 */
async function handlePatch(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'No restaurant associated with this account'
      });
    }

    const { voice_engine, openai_voice_id, voice_engine_status } = req.body;

    // Validate inputs
    if (voice_engine && !VALID_ENGINES.includes(voice_engine)) {
      return res.status(400).json({
        success: false,
        error: `Invalid voice_engine. Must be one of: ${VALID_ENGINES.join(', ')}`
      });
    }

    if (openai_voice_id && !VALID_OPENAI_VOICES.includes(openai_voice_id)) {
      return res.status(400).json({
        success: false,
        error: `Invalid openai_voice_id. Must be one of: ${VALID_OPENAI_VOICES.join(', ')}`
      });
    }

    if (voice_engine_status && !VALID_STATUSES.includes(voice_engine_status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid voice_engine_status. Must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    // Build update payload
    const updates = {};
    if (voice_engine) updates.voice_engine = voice_engine;
    if (openai_voice_id) updates.openai_voice_id = openai_voice_id;
    if (voice_engine_status) updates.voice_engine_status = voice_engine_status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update. Provide voice_engine, openai_voice_id, or voice_engine_status.'
      });
    }

    logger.info(`[VoiceEngineSettings PATCH] Updating restaurant ${restaurantId}:`, JSON.stringify(updates));

    const { data, error: updateError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update(updates)
      .eq('id', restaurantId)
      .select('voice_engine, voice_engine_status, openai_voice_id')
      .single();

    if (updateError) {
      logger.error('[VoiceEngineSettings PATCH] DB update error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update voice engine settings'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Voice engine settings updated successfully',
      data: {
        voice_engine: data.voice_engine,
        voice_engine_status: data.voice_engine_status,
        openai_voice_id: data.openai_voice_id,
      }
    });
  } catch (error) {
    logger.error('[VoiceEngineSettings PATCH] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again.'
    });
  }
}
