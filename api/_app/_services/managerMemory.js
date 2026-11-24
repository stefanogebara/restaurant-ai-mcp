const { supabaseAdmin } = require('../_lib/supabase');
const { OpenAI } = require('openai');
const { createSecureLogger } = require('../_lib/secure-logger');
const logger = createSecureLogger('manager-memory');

let openaiClient = null;
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function embedText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required for embedding generation');
  }
  const res = await getOpenAI().embeddings.create({
    model: 'text-embedding-ada-002',
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

async function writeMemory(restaurantId, type, category, content, source, importance = 5) {
  const embedding = await embedText(content);
  const { error } = await supabaseAdmin.from('manager_memory').insert({
    restaurant_id: restaurantId,
    type,
    category,
    content,
    source,
    importance,
    embedding,
  });
  if (error) {
    logger.error('writeMemory failed', { restaurantId, error: error.message });
    throw new Error(error.message);
  }
}

async function retrieveRelevantMemories(restaurantId, query, limit = 10) {
  try {
    const embedding = await embedText(query);
    const { data, error } = await supabaseAdmin.rpc('match_manager_memories', {
      p_restaurant_id: restaurantId,
      p_embedding: embedding,
      p_limit: limit,
    });
    if (error) {
      logger.error('retrieveRelevantMemories failed', { restaurantId, error: error.message });
      return [];
    }
    return data || [];
  } catch (err) {
    logger.warn('retrieveRelevantMemories skipped (embedding unavailable)', { restaurantId, error: err.message });
    return [];
  }
}

/**
 * Seed manager_memory from interview extracted_knowledge + restaurant_profile.
 * Called after persona generation completes.
 *
 * Maps interview topics → memory categories with appropriate importance.
 * Skips if memories already exist from this source to avoid duplicates.
 */
const TOPIC_TO_CATEGORY = {
  cuisine_identity: 'cuisine',
  atmosphere_vibe: 'atmosphere',
  signature_dishes: 'menu',
  guest_experience: 'service',
  unique_differentiators: 'identity',
  communication_style: 'communication',
  special_occasions: 'service',
  things_to_know: 'general',
  operations_philosophy: 'operations',
  team_culture: 'team',
  business_goals: 'goals',
  ai_expectations: 'preferences',
};

async function seedManagerMemoryFromInterview(restaurantId, extractedKnowledge, restaurantProfile) {
  if (!restaurantId) return { seeded: 0 };

  // Check if already seeded (avoid duplicates)
  const { count } = await supabaseAdmin
    .from('manager_memory')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('source', 'interview');

  if (count > 0) {
    logger.info('Manager memory already seeded from interview', { restaurantId, existing: count });
    return { seeded: 0, skipped: true };
  }

  const writes = [];

  // Seed from extracted_knowledge (topic → facts array)
  if (extractedKnowledge && typeof extractedKnowledge === 'object') {
    for (const [topicId, facts] of Object.entries(extractedKnowledge)) {
      if (!Array.isArray(facts)) continue;
      const category = TOPIC_TO_CATEGORY[topicId] || 'general';
      for (const fact of facts) {
        if (typeof fact === 'string' && fact.trim()) {
          writes.push(
            writeMemory(restaurantId, 'fact', category, fact.trim(), 'interview', 7)
              .catch((err) => logger.warn('seedMemory write failed', { fact: fact.slice(0, 50), error: err.message }))
          );
        }
      }
    }
  }

  // Seed high-level identity from restaurant_profile
  if (restaurantProfile) {
    if (restaurantProfile.persona_summary) {
      writes.push(
        writeMemory(restaurantId, 'fact', 'identity', restaurantProfile.persona_summary, 'interview', 9)
          .catch((err) => logger.warn('seedMemory persona_summary failed', { error: err.message }))
      );
    }
    if (restaurantProfile.cuisine_identity?.philosophy) {
      writes.push(
        writeMemory(restaurantId, 'fact', 'cuisine', `Cooking philosophy: ${restaurantProfile.cuisine_identity.philosophy}`, 'interview', 8)
          .catch((err) => logger.warn('seedMemory philosophy failed', { error: err.message }))
      );
    }
  }

  await Promise.all(writes);
  logger.info('Manager memory seeded from interview', { restaurantId, seeded: writes.length });
  return { seeded: writes.length };
}

module.exports = { writeMemory, retrieveRelevantMemories, embedText, seedManagerMemoryFromInterview };
