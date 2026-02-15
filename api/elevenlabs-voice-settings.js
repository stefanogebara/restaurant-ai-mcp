/**
 * ElevenLabs Voice Settings API - Vercel Serverless Function
 * GET  /api/elevenlabs-voice-settings - Fetch current voice config from agent
 * PATCH /api/elevenlabs-voice-settings - Update voice/settings on existing agent
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('VoiceSettings');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'ElevenLabs API key not configured'
    });
  }

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
 * GET - Fetch current voice configuration from the ElevenLabs agent.
 */
async function handleGet(req, res) {
  try {
    // Get restaurant info to find agent_id
    const { data: restaurant, error: dbError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_info')
      .select('id, elevenlabs_agent_id, agent_voice_id, agent_language, voice_settings, tts_model_id, agent_updated_at, restaurant_name')
      .limit(1)
      .single();

    if (dbError || !restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    if (!restaurant.elevenlabs_agent_id) {
      return res.status(404).json({
        success: false,
        error: 'No ElevenLabs agent configured for this restaurant'
      });
    }

    // Fetch agent config from ElevenLabs
    const agentResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${restaurant.elevenlabs_agent_id}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      logger.error('[VoiceSettings] Failed to fetch agent:', agentResponse.status, errorText);
      // Return what we have from DB even if agent fetch fails
      return res.status(200).json({
        success: true,
        data: {
          voice_id: restaurant.agent_voice_id || null,
          voice_name: null,
          language: restaurant.agent_language || 'en',
          tts_model_id: restaurant.tts_model_id || 'eleven_turbo_v2_5',
          voice_settings: restaurant.voice_settings || {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            speed: 1.0
          },
          agent_id: restaurant.elevenlabs_agent_id,
          restaurant_name: restaurant.restaurant_name,
          agent_updated_at: restaurant.agent_updated_at,
          source: 'database_only'
        }
      });
    }

    const agent = await agentResponse.json();
    const ttsConfig = agent.conversation_config?.tts || {};
    const agentConfig = agent.conversation_config?.agent || {};

    return res.status(200).json({
      success: true,
      data: {
        voice_id: ttsConfig.voice_id || restaurant.agent_voice_id || null,
        voice_name: null, // shared-voices don't persist name on agent
        language: agent.conversation_config?.language || restaurant.agent_language || 'en',
        tts_model_id: ttsConfig.model_id || restaurant.tts_model_id || 'eleven_turbo_v2_5',
        voice_settings: {
          stability: ttsConfig.stability ?? restaurant.voice_settings?.stability ?? 0.5,
          similarity_boost: ttsConfig.similarity_boost ?? restaurant.voice_settings?.similarity_boost ?? 0.75,
          style: ttsConfig.style ?? restaurant.voice_settings?.style ?? 0.0,
          speed: ttsConfig.speed ?? restaurant.voice_settings?.speed ?? 1.0,
        },
        agent_id: restaurant.elevenlabs_agent_id,
        agent_name: agent.name || null,
        restaurant_name: restaurant.restaurant_name,
        agent_updated_at: restaurant.agent_updated_at,
        created_at: agent.metadata?.created_at || null,
        source: 'agent_api'
      }
    });
  } catch (error) {
    logger.error('[VoiceSettings GET] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch voice settings'
    });
  }
}

/**
 * PATCH - Update voice and/or settings on the existing ElevenLabs agent.
 */
async function handlePatch(req, res) {
  try {
    const {
      voice_id,
      language,
      voice_settings,
      tts_model_id
    } = req.body;

    // Get restaurant info
    const { data: restaurant, error: dbError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_info')
      .select('id, elevenlabs_agent_id, agent_language, restaurant_name')
      .limit(1)
      .single();

    if (dbError || !restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    if (!restaurant.elevenlabs_agent_id) {
      return res.status(400).json({
        success: false,
        error: 'No ElevenLabs agent configured. Complete onboarding first.'
      });
    }

    // Build PATCH payload for agent update
    const patchPayload = {
      conversation_config: {}
    };

    // Update TTS settings
    const ttsUpdates = {};
    if (voice_id) {
      ttsUpdates.voice_id = voice_id;
    }
    if (tts_model_id) {
      ttsUpdates.model_id = tts_model_id;
    }
    if (voice_settings) {
      if (voice_settings.stability !== undefined) ttsUpdates.stability = voice_settings.stability;
      if (voice_settings.similarity_boost !== undefined) ttsUpdates.similarity_boost = voice_settings.similarity_boost;
      if (voice_settings.style !== undefined) ttsUpdates.style = voice_settings.style;
      if (voice_settings.speed !== undefined) ttsUpdates.speed = voice_settings.speed;
    }
    if (Object.keys(ttsUpdates).length > 0) {
      patchPayload.conversation_config.tts = ttsUpdates;
    }

    // Update language
    if (language) {
      patchPayload.conversation_config.language = language;
    }

    // If language changed, regenerate first_message
    if (language && language !== restaurant.agent_language) {
      const firstMessages = {
        en: `Hello! Welcome to ${restaurant.restaurant_name}. How can I help you today?`,
        es: `¡Hola! Bienvenido a ${restaurant.restaurant_name}. ¿En qué puedo ayudarle hoy?`,
        fr: `Bonjour ! Bienvenue chez ${restaurant.restaurant_name}. Comment puis-je vous aider ?`,
        de: `Hallo! Willkommen bei ${restaurant.restaurant_name}. Wie kann ich Ihnen helfen?`,
        it: `Ciao! Benvenuto da ${restaurant.restaurant_name}. Come posso aiutarti oggi?`,
        pt: `Olá! Bem-vindo ao ${restaurant.restaurant_name}. Como posso ajudá-lo hoje?`,
        nl: `Hallo! Welkom bij ${restaurant.restaurant_name}. Hoe kan ik u helpen?`,
        pl: `Cześć! Witamy w ${restaurant.restaurant_name}. Jak mogę Ci pomóc?`,
        sv: `Hej! Välkommen till ${restaurant.restaurant_name}. Hur kan jag hjälpa dig?`,
        tr: `Merhaba! ${restaurant.restaurant_name}'a hoş geldiniz. Size nasıl yardımcı olabilirim?`,
        ja: `こんにちは！${restaurant.restaurant_name}へようこそ。ご用件をお伺いします。`,
        ko: `안녕하세요! ${restaurant.restaurant_name}에 오신 것을 환영합니다. 무엇을 도와드릴까요?`,
        zh: `您好！欢迎来到${restaurant.restaurant_name}。我能为您做些什么？`,
        ru: `Здравствуйте! Добро пожаловать в ${restaurant.restaurant_name}. Чем могу помочь?`,
        hi: `नमस्ते! ${restaurant.restaurant_name} में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?`,
      };
      const baseLang = language.split('-')[0];
      const newFirstMessage = firstMessages[baseLang] || firstMessages['en'];
      patchPayload.conversation_config.agent = {
        first_message: newFirstMessage
      };
    }

    logger.info(`[VoiceSettings PATCH] Updating agent ${restaurant.elevenlabs_agent_id}:`, JSON.stringify(patchPayload));

    // Call ElevenLabs PATCH API
    const patchResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${restaurant.elevenlabs_agent_id}`,
      {
        method: 'PATCH',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patchPayload)
      }
    );

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      logger.error('[VoiceSettings PATCH] ElevenLabs error:', patchResponse.status, errorText);
      return res.status(patchResponse.status).json({
        success: false,
        error: `Failed to update agent: ${errorText}`
      });
    }

    // Update restaurant_info in database
    const dbUpdates = {
      agent_updated_at: new Date().toISOString()
    };
    if (voice_id) dbUpdates.agent_voice_id = voice_id;
    if (language) dbUpdates.agent_language = language;
    if (voice_settings) dbUpdates.voice_settings = voice_settings;
    if (tts_model_id) dbUpdates.tts_model_id = tts_model_id;

    const { error: updateError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_info')
      .update(dbUpdates)
      .eq('id', restaurant.id);

    if (updateError) {
      logger.error('[VoiceSettings PATCH] DB update error:', updateError);
      // Agent was updated successfully, DB sync failed - not critical
    }

    return res.status(200).json({
      success: true,
      message: 'Voice settings updated successfully',
      data: {
        voice_id: voice_id || null,
        language: language || null,
        voice_settings: voice_settings || null,
        tts_model_id: tts_model_id || null,
        agent_updated_at: dbUpdates.agent_updated_at
      }
    });
  } catch (error) {
    logger.error('[VoiceSettings PATCH] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update voice settings'
    });
  }
}
