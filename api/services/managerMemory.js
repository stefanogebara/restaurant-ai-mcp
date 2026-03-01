const { supabaseAdmin } = require('../_lib/supabase');
const { OpenAI } = require('openai');

let openaiClient = null;
function getOpenAI() {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function embedText(text) {
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
  if (error) throw new Error(error.message);
}

async function retrieveRelevantMemories(restaurantId, query, limit = 10) {
  const embedding = await embedText(query);
  const { data, error } = await supabaseAdmin.rpc('match_manager_memories', {
    p_restaurant_id: restaurantId,
    p_embedding: embedding,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = { writeMemory, retrieveRelevantMemories, embedText };
