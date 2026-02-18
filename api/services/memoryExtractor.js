/**
 * Memory Extractor Service
 *
 * Extracts structured memories from AI conversation transcripts.
 * Uses Claude Haiku for cost-efficient extraction of:
 * - Guest preferences (dietary, seating, ambiance)
 * - Occasion mentions (birthdays, anniversaries)
 * - Personality cues (chatty, formal, rushed)
 * - Complaints and compliments
 * - Explicit requests
 *
 * Called after every AI conversation ends (voice, WhatsApp).
 */

const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { createMemory } = require('./guestMemory');

const logger = createSecureLogger('MemoryExtractor');

const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Extract memories from a completed conversation
 * @param {string} conversationId - agent_conversations.conversation_id
 * @returns {Promise<number>} Number of memories extracted
 */
async function extractMemoriesFromConversation(conversationId) {
  if (!conversationId) {
    logger.warn('extractMemoriesFromConversation called without conversationId');
    return 0;
  }

  try {
    // 1. Fetch the conversation record
    const { data: conversation, error } = await supabaseAdmin
      .from('agent_conversations')
      .select('conversation_id, caller_phone, restaurant_info_id, transcript, summary, outcome')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (error || !conversation) {
      logger.warn('Conversation not found for memory extraction:', conversationId);
      return 0;
    }

    const { caller_phone, restaurant_info_id, transcript, summary } = conversation;

    if (!caller_phone || !restaurant_info_id) {
      logger.info('Skipping memory extraction: missing phone or restaurant', {
        hasPhone: !!caller_phone,
        hasRestaurant: !!restaurant_info_id
      });
      return 0;
    }

    // Build transcript text from the transcript array
    let transcriptText = '';
    if (Array.isArray(transcript) && transcript.length > 0) {
      transcriptText = transcript
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
    } else if (summary) {
      transcriptText = summary;
    }

    if (!transcriptText || transcriptText.length < 20) {
      logger.info('Skipping memory extraction: transcript too short');
      return 0;
    }

    // 2. Call Claude to extract structured memories
    const memories = await extractWithClaude(transcriptText);

    if (!memories || memories.length === 0) {
      logger.info('No memories extracted from conversation:', conversationId);
      return 0;
    }

    // 3. Store each extracted memory
    let stored = 0;
    for (const mem of memories) {
      const result = await createMemory(restaurant_info_id, caller_phone, {
        content: mem.content,
        memoryType: mem.type,
        importance: mem.importance,
        sourceType: 'voice_call',
        sourceId: conversationId
      });
      if (result) stored++;
    }

    logger.info('Memories extracted from conversation', {
      conversationId,
      extracted: memories.length,
      stored
    });

    return stored;
  } catch (error) {
    logger.error('Exception in memory extraction:', error.message);
    return 0;
  }
}

/**
 * Extract memories from a WhatsApp conversation session
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} guestPhone - Guest phone number
 * @param {Object[]} conversationHistory - Array of {role, content} messages
 * @param {string} [sourceId] - Optional source reference
 * @returns {Promise<number>} Number of memories extracted
 */
async function extractMemoriesFromWhatsApp(restaurantId, guestPhone, conversationHistory, sourceId) {
  if (!restaurantId || !guestPhone || !conversationHistory || conversationHistory.length < 2) {
    return 0;
  }

  try {
    const transcriptText = conversationHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    if (transcriptText.length < 20) return 0;

    const memories = await extractWithClaude(transcriptText);

    if (!memories || memories.length === 0) return 0;

    let stored = 0;
    for (const mem of memories) {
      const result = await createMemory(restaurantId, guestPhone, {
        content: mem.content,
        memoryType: mem.type,
        importance: mem.importance,
        sourceType: 'whatsapp',
        sourceId: sourceId || null
      });
      if (result) stored++;
    }

    logger.info('Memories extracted from WhatsApp', {
      guestPhone: guestPhone.slice(0, 4) + '***',
      extracted: memories.length,
      stored
    });

    return stored;
  } catch (error) {
    logger.error('Exception extracting WhatsApp memories:', error.message);
    return 0;
  }
}

/**
 * Use Claude Haiku to extract structured memories from transcript text
 * @param {string} transcriptText - Formatted transcript
 * @returns {Promise<Object[]>} Array of {content, type, importance}
 */
async function extractWithClaude(transcriptText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not set, skipping memory extraction');
    return [];
  }

  try {
    const client = new Anthropic();

    const response = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Extract guest memories from this restaurant conversation transcript. Return a JSON array of memories.

Each memory should have:
- "content": A concise, factual statement about the guest (not about the conversation)
- "type": One of: "observation", "preference", "occasion"
  - "observation" = something the guest did or said (e.g., "Ordered the seafood pasta")
  - "preference" = an explicit preference or dietary need (e.g., "Vegetarian", "Prefers window seat")
  - "occasion" = a special date or event (e.g., "Wedding anniversary on March 15")
- "importance": 1-10 score
  - 1-3: Trivial (e.g., "Asked about parking")
  - 4-6: Useful (e.g., "Booked for 4 guests on Friday")
  - 7-8: Important (e.g., "Allergic to nuts", "VIP celebrating birthday")
  - 9-10: Critical (e.g., "Severe food allergy", "Major complaint about service")

Rules:
- Only extract memories about the GUEST, not the restaurant or AI
- Skip generic conversation (greetings, confirmations, etc.)
- Be concise - one sentence per memory
- If no meaningful memories, return an empty array []
- Maximum 5 memories per conversation

Transcript:
${transcriptText}

Return ONLY a valid JSON array, no other text.`
        }
      ]
    });

    const responseText = response.content?.[0]?.text?.trim();
    if (!responseText) return [];

    // Parse JSON - handle potential markdown wrapping
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonText);

    if (!Array.isArray(parsed)) return [];

    // Validate and sanitize each memory
    const validTypes = ['observation', 'preference', 'occasion'];
    return parsed
      .filter(m => m.content && validTypes.includes(m.type))
      .map(m => ({
        content: String(m.content).slice(0, 500),
        type: m.type,
        importance: Math.max(1, Math.min(10, parseInt(m.importance) || 5))
      }))
      .slice(0, 5);
  } catch (error) {
    logger.error('Claude extraction error:', error.message);
    return [];
  }
}

module.exports = {
  extractMemoriesFromConversation,
  extractMemoriesFromWhatsApp,
  extractWithClaude
};
