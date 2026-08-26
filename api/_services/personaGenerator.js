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
const { AI_MODEL } = require('../_lib/ai-client');
const { seedManagerMemoryFromInterview } = require('./managerMemory');

const logger = createSecureLogger('PersonaGenerator');

/**
 * Generate a restaurant persona from intelligence + interview data
 * @param {string} sessionId - Interview session ID
 * @returns {object} Generated persona with profile and greeting preview
 */
async function generatePersona(sessionId, { version, restaurantConfigId: restaurantConfigIdDireto } = {}) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  if (!supabaseAdmin) {
    throw new Error('Database not available');
  }

  // A entrevista virou OPCIONAL (ago/2026). O passo "Ensine sua IA" saiu do
  // caminho — doze perguntas dissertativas — e sem este caminho alternativo o
  // polimento por LLM ficaria morto para todo restaurante novo: esta função
  // exigia uma sessão e devolvia erro sem ela.
  //
  // Quando `sessionId` é null, quem chama precisa dizer de qual restaurante se
  // trata (`restaurantConfigIdDireto`).
  let session = null;
  let restaurantConfigId = restaurantConfigIdDireto;

  if (sessionId) {
    const { data, error: sessionError } = await supabaseAdmin
      .schema('restaurant')
      .from('learning_interviews')
      .select('id, restaurant_config_id, status, messages, extracted_knowledge, intelligence_context')
      .eq('id', sessionId)
      .single();

    if (sessionError || !data) {
      throw new Error('Interview session not found');
    }
    session = data;
    restaurantConfigId = data.restaurant_config_id;
  }

  if (!restaurantConfigId) {
    throw new Error('generatePersona: sem sessionId é obrigatório informar restaurantConfigId');
  }

  // Fetch intelligence data
  const { data: intelligence } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_intelligence')
    .select('id, restaurant_config_id, intelligence_data, source, created_at, updated_at')
    .eq('restaurant_config_id', restaurantConfigId)
    .single();

  // Fetch restaurant config for base info
  const { data: config } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name, restaurant_type, city, country, ai_config, scraped_data')
    .eq('id', restaurantConfigId)
    .single();

  const restaurantName = config?.restaurant_name || 'the restaurant';
  const interviewKnowledge = session?.extracted_knowledge || {};

  // O bloco "INTELLIGENCE DATA (from web research)" do prompt vinha de
  // restaurant_intelligence — que está VAZIO desde que o gather de 3 tiers foi
  // adiado por estourar a lambda (restaurant-learning/research.js). Ou seja: o
  // prompt prometia pesquisa e passava `{}`.
  //
  // O scraped_data do demo é a pesquisa que de fato existe — editorial do
  // Google, cozinha, faixa de preço, avaliações, pratos populares, elogios e
  // queixas — e nunca era lido aqui. Agora ele entra, com o
  // restaurant_intelligence na frente para o dia em que voltar a ser populado.
  const doScrape = config?.scraped_data && typeof config.scraped_data === 'object'
    ? {
        editorial: config.scraped_data.editorial_summary ?? null,
        cuisine_type: config.scraped_data.cuisine_type ?? null,
        price_level: config.scraped_data.price_level ?? null,
        rating: config.scraped_data.rating ?? null,
        insights: config.scraped_data.insights ?? null,
        popular_dishes: config.scraped_data.menu?.popular_dishes ?? null,
      }
    : null;
  const intelligenceData = intelligence?.intelligence_data?.summary || doScrape || {};

  // Use Claude to synthesize everything into a structured persona (with timeout)
  const personaController = new AbortController();
  const personaTimeout = setTimeout(() => personaController.abort(), 30000);

  const response = await anthropic.messages.create({
    model: AI_MODEL,  // Routed via OpenRouter — direct Anthropic IDs don't match
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
    session_id: sessionId || null,
    intelligence_available: !!intelligence,
    // De onde veio o material: 'entrevista' quando o dono respondeu as doze
    // perguntas, 'pesquisa' quando o perfil saiu do scrape. Sem isto não dá
    // para saber, olhando uma linha, se aquele perfil teve dono por trás.
    _origem: sessionId ? 'entrevista' : 'pesquisa',
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

  // Marcar entrevista como concluída — só quando houve entrevista. Sem a
  // guarda, o caminho da pesquisa dispararia um UPDATE com `id = null`.
  if (sessionId) {
    await supabaseAdmin
      .schema('restaurant')
      .from('learning_interviews')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId);
  }

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

  // Fetch current profile for version increment
  const { data: config } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_profile, scraped_data')
    .eq('id', restaurantConfigId)
    .single();

  // Sem entrevista E sem pesquisa não há de que sintetizar. Devolver null aqui
  // é honesto — o perfil determinístico que já está gravado continua valendo.
  if (!interview && !config?.scraped_data) {
    logger.info('Sem entrevista e sem pesquisa, nada a sintetizar:', restaurantConfigId);
    return null;
  }

  const currentVersion = config?.restaurant_profile?.version || 0;

  // Pass the incremented version to avoid double-write
  const result = await generatePersona(interview?.id || null, {
    version: currentVersion + 1,
    restaurantConfigId,
  });

  logger.info('Persona regenerated for:', restaurantConfigId);
  return result;
}

module.exports = {
  generatePersona,
  regeneratePersona
};
