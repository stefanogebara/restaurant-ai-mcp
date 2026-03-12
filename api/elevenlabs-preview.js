/**
 * ElevenLabs TTS Preview API - Vercel Serverless Function
 * POST /api/elevenlabs-preview
 * Generates audio preview for a specific ElevenLabs voice
 */

const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { createSecureLogger } = require('./_lib/secure-logger');
const { validateElevenLabsVoiceId } = require('./_lib/validation');
const logger = createSecureLogger('ElevenLabsPreview');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

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

  try {
    const { voice_id, text, voice_settings, model_id } = req.body;

    // Validate voice_id format — must be alphanumeric only to prevent path traversal SSRF
    const voiceIdValidation = validateElevenLabsVoiceId(voice_id);
    if (!voiceIdValidation.valid) {
      return res.status(400).json({
        success: false,
        error: voiceIdValidation.error
      });
    }

    // Validate API key
    if (!process.env.ELEVENLABS_API_KEY) {
      logger.error('[ElevenLabs] ELEVENLABS_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    const previewText = text || "Welcome to our restaurant! I'd be happy to help you make a reservation.";

    // Merge custom voice_settings with defaults (backward compatible)
    const defaultSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true
    };
    const mergedSettings = voice_settings
      ? { ...defaultSettings, ...voice_settings }
      : defaultSettings;

    const ttsModelId = model_id || 'eleven_multilingual_v2';

    logger.info(`[ElevenLabs] Generating preview for voice ${voice_id} (model: ${ttsModelId})`);

    // Generate TTS preview using ElevenLabs
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: previewText,
        model_id: ttsModelId,
        voice_settings: mergedSettings
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[ElevenLabs] TTS API error:', response.status, errorText);
      // Return a generic client error — do not leak raw ElevenLabs error details
      const clientStatus = response.status >= 400 && response.status < 500 ? 400 : 502;
      return res.status(clientStatus).json({
        success: false,
        error: 'Failed to generate voice preview. Please try a different voice.'
      });
    }

    // Return audio as base64
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    logger.info(`[ElevenLabs] Generated ${audioBase64.length} bytes of audio (base64)`);

    return res.status(200).json({
      success: true,
      data: {
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        voice_id: voice_id,
        text: previewText
      }
    });

  } catch (error) {
    logger.error('[ElevenLabs] Error generating preview:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate preview'
    });
  }
};
