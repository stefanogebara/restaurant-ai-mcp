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

    // 2. Call Claude to extract structured memories + CRM data
    const { memories, crm } = await extractWithClaude(transcriptText);

    if ((!memories || memories.length === 0) && !crm) {
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

    // 4. Store CRM facts in customer_ltv preferences
    if (crm) {
      await mergeCrmPreferences(restaurant_info_id, caller_phone, crm);
    }

    logger.info('Memories extracted from conversation', {
      conversationId,
      extracted: memories.length,
      stored,
      hasCrm: !!crm
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

    const { memories, crm } = await extractWithClaude(transcriptText);

    if ((!memories || memories.length === 0) && !crm) return 0;

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

    // Store CRM facts in customer_ltv preferences
    if (crm) {
      await mergeCrmPreferences(restaurantId, guestPhone, crm);
    }

    logger.info('Memories extracted from WhatsApp', {
      guestPhone: guestPhone.slice(0, 4) + '***',
      extracted: memories.length,
      stored,
      hasCrm: !!crm
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
    return { memories: [], crm: null };
  }

  try {
    const client = new Anthropic();

    const response = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `Extract guest memories AND CRM facts from this restaurant conversation transcript.

Return a JSON object with two fields:

1. "memories": An array of memories, each with:
- "content": A concise, factual statement about the guest
- "type": One of: "observation", "preference", "occasion"
  - "observation" = something the guest did or said
  - "preference" = an explicit preference or dietary need
  - "occasion" = a special date or event
- "importance": 1-10 score
  - 1-3: Trivial (e.g., "Asked about parking")
  - 4-6: Useful (e.g., "Booked for 4 guests on Friday")
  - 7-8: Important (e.g., "Allergic to nuts", "VIP celebrating birthday")
  - 9-10: Critical (e.g., "Severe food allergy", "Major complaint")

2. "crm": Structured CRM facts (null if none found). Include ONLY fields mentioned in the conversation:
- "dietary": Array of dietary restrictions/allergies (e.g., ["shellfish allergy", "vegetarian"])
- "celebrations": Array of {type, date?} (e.g., [{"type": "anniversary", "date": "2026-03-15"}])
- "seating": Seating preference string (e.g., "window table", "quiet corner", "terrace")
- "wine_preference": Wine/drink preference (e.g., "prefers red Burgundy", "non-drinker")
- "party_type": Party composition (e.g., "business dinner", "family", "couple", "group of friends")
- "special_requests": Array of special requests (e.g., ["high chair needed", "wheelchair accessible"])

Rules:
- Only extract about the GUEST, not the restaurant or AI
- Skip generic conversation (greetings, confirmations)
- Maximum 5 memories
- For CRM, only include fields explicitly mentioned — do NOT infer

Transcript:
${transcriptText}

Return ONLY a valid JSON object, no other text.`
        }
      ]
    });

    const responseText = response.content?.[0]?.text?.trim();
    if (!responseText) return { memories: [], crm: null };

    // Parse JSON - handle potential markdown wrapping
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonText);

    // Handle both old format (array) and new format (object with memories + crm)
    let memoriesRaw, crmData;
    if (Array.isArray(parsed)) {
      memoriesRaw = parsed;
      crmData = null;
    } else {
      memoriesRaw = parsed.memories || [];
      crmData = parsed.crm || null;
    }

    if (!Array.isArray(memoriesRaw)) memoriesRaw = [];

    // Validate and sanitize memories
    const validTypes = ['observation', 'preference', 'occasion'];
    const memories = memoriesRaw
      .filter(m => m.content && validTypes.includes(m.type))
      .map(m => ({
        content: String(m.content).slice(0, 500),
        type: m.type,
        importance: Math.max(1, Math.min(10, parseInt(m.importance) || 5))
      }))
      .slice(0, 5);

    // Sanitize CRM data
    const crm = sanitizeCrmData(crmData);

    return { memories, crm };
  } catch (error) {
    logger.error('Claude extraction error:', error.message);
    return { memories: [], crm: null };
  }
}

/**
 * Sanitize CRM data from extraction to ensure valid structure.
 */
function sanitizeCrmData(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const crm = {};
  let hasData = false;

  if (Array.isArray(raw.dietary) && raw.dietary.length > 0) {
    crm.dietary = raw.dietary.map(d => String(d).slice(0, 100)).slice(0, 10);
    hasData = true;
  }
  if (Array.isArray(raw.celebrations) && raw.celebrations.length > 0) {
    crm.celebrations = raw.celebrations
      .filter(c => c && c.type)
      .map(c => ({ type: String(c.type).slice(0, 50), date: c.date || null }))
      .slice(0, 5);
    hasData = true;
  }
  if (raw.seating && typeof raw.seating === 'string') {
    crm.seating = raw.seating.slice(0, 100);
    hasData = true;
  }
  if (raw.wine_preference && typeof raw.wine_preference === 'string') {
    crm.wine_preference = raw.wine_preference.slice(0, 100);
    hasData = true;
  }
  if (raw.party_type && typeof raw.party_type === 'string') {
    crm.party_type = raw.party_type.slice(0, 100);
    hasData = true;
  }
  if (Array.isArray(raw.special_requests) && raw.special_requests.length > 0) {
    crm.special_requests = raw.special_requests.map(s => String(s).slice(0, 200)).slice(0, 5);
    hasData = true;
  }

  return hasData ? crm : null;
}

/**
 * Merge extracted CRM facts into customer_ltv preferences JSONB.
 * Uses fetch-then-merge to avoid overwriting existing data.
 */
async function mergeCrmPreferences(restaurantId, guestPhone, crm) {
  if (!crm || !restaurantId || !guestPhone) return;

  try {
    // Fetch existing customer_ltv record
    const { data: existing } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('id, dietary_preferences, special_occasions')
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', guestPhone)
      .maybeSingle();

    if (!existing) {
      // No customer_ltv record yet — will be created on next churn cron run.
      // Store CRM in guest_memories as preference memories instead.
      logger.info('No customer_ltv record for CRM merge, storing as memories', {
        phone: guestPhone.slice(0, 4) + '***'
      });
      return;
    }

    const updates = {};

    // Merge dietary preferences into the text[] column
    if (crm.dietary?.length > 0) {
      const existingDietary = existing.dietary_preferences || [];
      const merged = [...new Set([...existingDietary, ...crm.dietary])];
      updates.dietary_preferences = merged;
    }

    // Merge celebrations into special_occasions JSONB
    if (crm.celebrations?.length > 0) {
      const existingOccasions = existing.special_occasions || {};
      const newOccasions = { ...existingOccasions };
      for (const c of crm.celebrations) {
        // Use type as key to deduplicate
        newOccasions[c.type] = { date: c.date, updated_at: new Date().toISOString() };
      }
      updates.special_occasions = newOccasions;
    }

    // Store other CRM fields in special_occasions as well (seating, wine, etc.)
    const extraFields = ['seating', 'wine_preference', 'party_type', 'special_requests'];
    const hasExtra = extraFields.some(f => crm[f]);
    if (hasExtra) {
      const occasions = updates.special_occasions || existing.special_occasions || {};
      if (crm.seating) occasions._seating_preference = crm.seating;
      if (crm.wine_preference) occasions._wine_preference = crm.wine_preference;
      if (crm.party_type) occasions._party_type = crm.party_type;
      if (crm.special_requests) occasions._special_requests = crm.special_requests;
      updates.special_occasions = occasions;
    }

    if (Object.keys(updates).length === 0) return;

    updates.updated_at = new Date().toISOString();

    await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .update(updates)
      .eq('id', existing.id);

    logger.info('CRM preferences merged into customer_ltv', {
      phone: guestPhone.slice(0, 4) + '***',
      fields: Object.keys(updates).filter(k => k !== 'updated_at'),
    });
  } catch (error) {
    logger.error('Failed to merge CRM preferences', { error: error.message });
  }
}

module.exports = {
  extractMemoriesFromConversation,
  extractMemoriesFromWhatsApp,
  extractWithClaude,
  mergeCrmPreferences,
};
