/**
 * Embeddings Service
 *
 * Thin wrapper around OpenAI's text-embedding-3-small API.
 * Generates 1536-dimension vectors for semantic similarity search
 * used by the Guest Memory three-factor retrieval system.
 */

const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('Embeddings');

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/**
 * Generate an embedding vector for a single text string
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 1536-dimension float array
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required for embedding generation');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Truncate very long text to avoid token limits (8191 tokens max)
  const truncated = text.length > 8000 ? text.slice(0, 8000) : text;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: truncated,
          dimensions: EMBEDDING_DIMENSIONS
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI Embeddings API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;

      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Invalid embedding response: expected ${EMBEDDING_DIMENSIONS} dimensions`);
      }

      return embedding;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        logger.warn(`Embedding attempt ${attempt + 1} failed, retrying:`, error.message);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      } else {
        logger.error('Embedding generation failed after retries:', error.message);
        throw error;
      }
    }
  }
}

/**
 * Generate embeddings for multiple texts in a single batch call
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of 1536-dimension float arrays
 */
async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Non-empty array of texts is required');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Truncate each text
  const truncated = texts.map(t =>
    typeof t === 'string' && t.length > 8000 ? t.slice(0, 8000) : t
  );

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: truncated,
          dimensions: EMBEDDING_DIMENSIONS
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI Embeddings API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const embeddings = data.data
        ?.sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      if (!embeddings || embeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${embeddings?.length}`);
      }

      return embeddings;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        logger.warn(`Batch embedding attempt ${attempt + 1} failed, retrying:`, error.message);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      } else {
        logger.error('Batch embedding generation failed after retries:', error.message);
        throw error;
      }
    }
  }
}

module.exports = {
  generateEmbedding,
  generateEmbeddings,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
};
