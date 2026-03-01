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
  const embedding = await embedText(query);
  const { data, error } = await supabaseAdmin.rpc('match_manager_memories', {
    p_restaurant_id: restaurantId,
    p_embedding: embedding,
    p_limit: limit,
  });
  if (error) {
    logger.error('retrieveRelevantMemories failed', { restaurantId, error: error.message });
    throw new Error(error.message);
  }
  return data || [];
}

module.exports = { writeMemory, retrieveRelevantMemories, embedText };
