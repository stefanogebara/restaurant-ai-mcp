/**
 * Voice Agent Service
 *
 * Syncs the ElevenLabs voice agent system prompt with the latest
 * restaurant persona (restaurant_profile + agent_name + agent_greeting).
 *
 * Called after:
 * - Agent creation (elevenlabs-agent-create.js)
 * - Persona generation (restaurant-learning/generate-persona.js)
 * - Manual refresh (POST /api/elevenlabs-voice-settings?action=refresh_prompt)
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { buildPersonaPrompt } = require('../_lib/persona-prompt-builder');
const { buildDefaultVoiceGreeting } = require('../_lib/voice-greetings');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('VoiceAgentService');

/**
 * Re-generate the voice agent system prompt from the latest restaurant_config
 * and PATCH it to the ElevenLabs agent.
 *
 * @param {string} restaurantId - UUID from restaurant.restaurant_config
 * @param {{syncGreeting?: boolean}} options - Include the opening message when the greeting was edited
 * @returns {Promise<{success: boolean, prompt_synced?: boolean, greeting_synced?: boolean, skipped?: boolean, error?: string}>}
 */
async function refreshVoiceAgentPrompt(restaurantId, { syncGreeting = false } = {}) {
  if (!restaurantId) {
    return { skipped: true, reason: 'no_restaurant_id' };
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return { skipped: true, reason: 'no_api_key' };
  }

  // Fetch restaurant config — all fields needed for buildPersonaPrompt
  const { data: config, error: dbError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, restaurant_type, phone, email, city, country, business_hours, average_dining_duration_minutes, timezone, agent_language, reservation_settings, elevenlabs_agent_id, agent_name, agent_greeting, ai_config, metric_profile')
    .eq('id', restaurantId)
    .single();

  if (dbError || !config) {
    logger.error('[VoiceAgentService] Failed to fetch restaurant_config:', dbError?.message);
    return { success: false, error: 'restaurant_not_found' };
  }

  if (!config.elevenlabs_agent_id) {
    return { skipped: true, reason: 'no_agent_id' };
  }

  const systemPrompt = buildPersonaPrompt(config, { channel: 'voice' });
  // Clearing a custom greeting restores the same default used by language changes.
  const firstMessage = config.agent_greeting || buildDefaultVoiceGreeting(config.restaurant_name, config.agent_language || 'en');
  const agentUpdate = { prompt: { prompt: systemPrompt } };
  if (syncGreeting) agentUpdate.first_message = firstMessage;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${config.elevenlabs_agent_id}`,
    {
      method: 'PATCH',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_config: {
          agent: agentUpdate
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('[VoiceAgentService] ElevenLabs PATCH failed:', response.status, errorText);
    return { success: false, prompt_synced: false, greeting_synced: syncGreeting ? false : undefined, error: errorText };
  }

  // A successful PATCH only confirms acceptance. Read the agent back so each
  // status reflects the value that will actually start the next conversation.
  let promptSynced = false;
  let greetingSynced = !syncGreeting;
  try {
    const readback = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${config.elevenlabs_agent_id}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(12_000),
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      }
    );
    if (readback.ok) {
      const agent = await readback.json();
      promptSynced = agent.conversation_config?.agent?.prompt?.prompt === systemPrompt;
      if (syncGreeting) greetingSynced = agent.conversation_config?.agent?.first_message === firstMessage;
    } else {
      logger.error('[VoiceAgentService] ElevenLabs readback failed:', readback.status);
      greetingSynced = false;
    }
  } catch (readbackError) {
    logger.error('[VoiceAgentService] ElevenLabs readback failed:', readbackError.message);
    greetingSynced = false;
  }

  if (!promptSynced || !greetingSynced) {
    return {
      success: false,
      prompt_synced: promptSynced,
      greeting_synced: syncGreeting ? greetingSynced : undefined,
      error: 'agent_readback_mismatch',
    };
  }

  // Track when prompt was last synced
  await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ agent_updated_at: new Date().toISOString() })
    .eq('id', restaurantId);

  logger.info('[VoiceAgentService] Prompt refreshed for restaurant:', restaurantId);
  return { success: true, prompt_synced: true, greeting_synced: syncGreeting ? true : undefined };
}

module.exports = { refreshVoiceAgentPrompt };
