/**
 * Persona Generator Service
 *
 * Combines restaurant intelligence (web data) + interview knowledge
 * into a complete restaurant_profile JSONB stored on restaurant_config.
 *
 * The generated profile powers the AI receptionist's personality,
 * tone, knowledge, and conversational style.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getAnthropicClient } = require('./restaurantIntelligence');
const { seedManagerMemoryFromInterview } = require('./managerMemory');

const logger = createSecureLogger('PersonaGenerator');

/**
 * Generate a restaurant persona from intelligence + interview data
 * @param {string} sessionId - Interview session ID
 * @returns {object} Generated persona with profile and greeting preview
 */
async function generatePersona(sessionId, { version } = {}) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  if (!supabaseAdmin) {
    throw new Error('Database not available');
  }

  // Fetch interview session
  const { data: session, error: sessionError } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .select('id, restaurant_config_id, status, messages, extracted_knowledge, intelligence_context')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error('Interview session not found');
  }

  const restaurantConfigId = session.restaurant_config_id;

  // Fetch intelligence data
  // All intelligence fields needed for persona generation prompt
  const { data: intelligence } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_intelligence')
    .select('*')
    .eq('restaurant_config_id', restaurantConfigId)
    .single();

  // Fetch restaurant config for base info
  const { data: config } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name, restaurant_type, city, country, ai_config')
    .eq('id', restaurantConfigId)
    .single();

  const restaurantName = config?.restaurant_name || 'the restaurant';
  const interviewKnowledge = session.extracted_knowledge || {};
  const intelligenceData = intelligence?.intelligence_data?.summary || {};

  // Use Claude to synthesize everything into a structured persona (with timeout)
  const personaController = new AbortController();
  const personaTimeout = setTimeout(() => personaController.abort(), 30000);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    signal: personaController.signal,
    messages: [{
      role: 'user',
      content: `You are creating an AI receptionist persona for a restaurant. Based on the following data, generate a complete restaurant profile. Return ONLY valid JSON.

INTELLIGENCE DATA (from web research):
${JSON.stringify(intelligenceData, null, 2)}

INTERVIEW KNOWLEDGE (from owner conversation):
${JSON.stringify(interviewKnowledge, null, 2)}

RESTAURANT INFO:
- Name: ${restaurantName}
- Type: ${config?.restaurant_type || 'unknown'}
- Location: ${config?.city || ''}, ${config?.country || ''}

Generate this JSON structure:
{
  "persona_summary": "A 2-3 sentence description of this restaurant's personality and what makes it special",
  "cuisine_identity": {
    "primary_cuisine": "Main cuisine type",
    "style": "e.g., traditional, modern fusion, farm-to-table",
    "influences": ["Cultural or regional influences"],
    "philosophy": "Cooking philosophy in one sentence"
  },
  "atmosphere": {
    "vibe": "One-word or short phrase describing the vibe",
    "description": "2-3 sentence atmosphere description",
    "music": "Type of music if known, or null",
    "dress_code": "Dress code if known, or null"
  },
  "signature_dishes": [
    {
      "name": "Dish name",
      "description": "Brief description",
      "why_special": "What makes it noteworthy"
    }
  ],
  "communication_style": {
    "tone": "e.g., warm and casual, elegant and professional",
    "greeting_style": "How to greet callers",
    "personality_traits": ["e.g., enthusiastic, knowledgeable, friendly"],
    "phrases_to_use": ["Characteristic phrases the AI should use"],
    "phrases_to_avoid": ["Things that would feel inauthentic"]
  },
  "guest_experience": {
    "promise": "The core guest experience promise",
    "special_occasions": "How special occasions are handled",
    "dietary_accommodations": "How dietary needs are handled"
  },
  "unique_differentiators": ["What makes this restaurant stand out"],
  "things_to_know": ["Important facts the AI should always remember"],
  "greeting_preview": "A sample greeting the AI receptionist would use when answering the phone"
}`
    }]
  });

  clearTimeout(personaTimeout);

  const responseText = response.content[0]?.text || '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to generate persona: could not parse AI response');
  }

  let restaurantProfile;
  try {
    restaurantProfile = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    logger.error('Failed to parse persona JSON:', parseError);
    throw new Error('Failed to generate persona: invalid AI response format');
  }

  // Add metadata
  const profileWithMetadata = {
    ...restaurantProfile,
    generated_at: new Date().toISOString(),
    session_id: sessionId,
    intelligence_available: !!intelligence,
    version: version || 1
  };

  // Store on restaurant_config
  const { error: updateError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({
      restaurant_profile: profileWithMetadata,
      profile_generated_at: new Date().toISOString()
    })
    .eq('id', restaurantConfigId);

  if (updateError) {
    logger.error('Failed to store restaurant profile:', updateError);
    throw new Error('Failed to save restaurant profile');
  }

  // Mark interview as completed
  await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  // Fire-and-forget: seed manager_memory from interview knowledge
  seedManagerMemoryFromInterview(restaurantConfigId, interviewKnowledge, profileWithMetadata)
    .catch((err) => logger.error('seedManagerMemoryFromInterview failed', { restaurantConfigId, error: err.message }));

  logger.info('Persona generated for restaurant:', restaurantConfigId);

  return {
    persona_summary: profileWithMetadata.persona_summary,
    restaurant_profile: profileWithMetadata,
    greeting_preview: profileWithMetadata.greeting_preview
  };
}

/**
 * Regenerate persona using latest intelligence + existing interview
 * Used by the cron job when new intelligence is gathered
 * @param {string} restaurantConfigId - Restaurant config ID
 * @returns {object} Updated profile
 */
async function regeneratePersona(restaurantConfigId) {
  if (!supabaseAdmin) {
    throw new Error('Database not available');
  }

  // Find the most recent completed interview
  const { data: interview } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .select('id')
    .eq('restaurant_config_id', restaurantConfigId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (!interview) {
    logger.info('No completed interview found for:', restaurantConfigId);
    return null;
  }

  // Fetch current profile for version increment
  const { data: config } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_profile')
    .eq('id', restaurantConfigId)
    .single();

  const currentVersion = config?.restaurant_profile?.version || 0;

  // Pass the incremented version to avoid double-write
  const result = await generatePersona(interview.id, { version: currentVersion + 1 });

  logger.info('Persona regenerated for:', restaurantConfigId);
  return result;
}

module.exports = {
  generatePersona,
  regeneratePersona
};
