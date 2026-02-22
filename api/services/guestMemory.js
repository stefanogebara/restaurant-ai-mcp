/**
 * Guest Memory Service
 *
 * Core service for the Guest Memory system - a unified memory stream
 * inspired by Park et al.'s "Generative Agents" (UIST 2023).
 *
 * Provides memory CRUD, three-factor retrieval (recency + importance + relevance),
 * and context building for AI conversation personalization.
 *
 * Every AI conversation (voice, WhatsApp, booking) can read and write to
 * the guest's memory stream, enabling the AI to remember every guest.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { generateEmbedding } = require('./embeddings');

const logger = createSecureLogger('GuestMemory');

/**
 * Create a new memory in the guest's memory stream
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} guestPhone - Guest phone number (primary identifier)
 * @param {Object} memoryData
 * @param {string} memoryData.content - Human-readable memory text
 * @param {string} memoryData.memoryType - observation|reflection|manager_note|preference|occasion
 * @param {number} memoryData.importance - 1-10 importance score
 * @param {string} memoryData.sourceType - voice_call|whatsapp|booking_portal|walk_in|manager_input|reflection_synthesis|dna_import
 * @param {string} [memoryData.sourceId] - Reference to source record
 * @returns {Promise<Object|null>} Created memory record
 */
async function createMemory(restaurantId, guestPhone, memoryData) {
  const { content, memoryType, importance = 5, sourceType, sourceId } = memoryData;

  if (!restaurantId || !guestPhone || !content || !memoryType || !sourceType) {
    logger.error('Missing required fields for memory creation', {
      hasRestaurantId: !!restaurantId,
      hasPhone: !!guestPhone,
      hasContent: !!content,
      memoryType,
      sourceType
    });
    return null;
  }

  try {
    // Generate embedding for semantic search
    let embedding = null;
    try {
      embedding = await generateEmbedding(content);
    } catch (embError) {
      logger.warn('Embedding generation failed, storing memory without embedding:', embError.message);
    }

    const insertData = {
      restaurant_id: restaurantId,
      guest_phone: guestPhone,
      memory_type: memoryType,
      content,
      importance: Math.max(1, Math.min(10, importance)),
      source_type: sourceType,
      source_id: sourceId || null
    };

    if (embedding) {
      // pgvector expects a string representation: "[0.1,0.2,...]"
      insertData.embedding = JSON.stringify(embedding);
    }

    const { data, error } = await supabaseAdmin
      .from('guest_memories')
      .insert(insertData)
      .select('id, memory_type, content, importance, created_at')
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('guest_memories')) {
        logger.warn('guest_memories table not found. Run: database/migrations/20260218_guest_memories.sql');
      } else {
        logger.error('Error creating memory:', error);
      }
      return null;
    }

    logger.info('Memory created', {
      id: data.id,
      memoryType,
      guestPhone: guestPhone.slice(0, 4) + '***',
      importance,
      hasEmbedding: !!embedding
    });

    return data;
  } catch (error) {
    logger.error('Exception creating memory:', error.message);
    return null;
  }
}

/**
 * Retrieve memories using three-factor scoring (Park et al.)
 * score = alpha_recency * recency + alpha_importance * importance + alpha_relevance * relevance
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} guestPhone - Guest phone number
 * @param {string} queryText - Context query for relevance scoring
 * @param {number} [limit=10] - Maximum memories to return
 * @returns {Promise<Object[]>} Scored and ranked memories
 */
async function retrieveMemories(restaurantId, guestPhone, queryText, limit = 10) {
  if (!restaurantId || !guestPhone) {
    return [];
  }

  try {
    // Generate query embedding for relevance scoring
    let queryEmbedding;
    try {
      queryEmbedding = await generateEmbedding(queryText || 'guest interaction');
    } catch (embError) {
      logger.warn('Query embedding failed, falling back to recent memories:', embError.message);
      return getRecentMemories(restaurantId, guestPhone, limit);
    }

    // Call the three-factor retrieval SQL function
    const { data, error } = await supabaseAdmin.rpc('retrieve_guest_memories', {
      p_restaurant_id: restaurantId,
      p_guest_phone: guestPhone,
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_limit: limit,
      p_alpha_recency: 0.3,
      p_alpha_importance: 0.3,
      p_alpha_relevance: 0.4
    });

    if (error) {
      logger.error('Three-factor retrieval error:', error);
      return getRecentMemories(restaurantId, guestPhone, limit);
    }

    // Update accessed_at for retrieved memories (for future recency scoring)
    if (data && data.length > 0) {
      const memoryIds = data.map(m => m.id);
      await supabaseAdmin
        .from('guest_memories')
        .update({ accessed_at: new Date().toISOString() })
        .in('id', memoryIds);
    }

    return data || [];
  } catch (error) {
    logger.error('Exception retrieving memories:', error.message);
    return [];
  }
}

/**
 * Get recent memories without semantic search (fallback / simple retrieval)
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} guestPhone - Guest phone number
 * @param {number} [limit=10] - Maximum memories to return
 * @returns {Promise<Object[]>} Recent memories sorted by created_at
 */
async function getRecentMemories(restaurantId, guestPhone, limit = 10) {
  if (!restaurantId || !guestPhone) {
    return [];
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('guest_memories')
      .select('id, memory_type, content, importance, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('guest_phone', guestPhone)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching recent memories:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Exception fetching recent memories:', error.message);
    return [];
  }
}

/**
 * Build a formatted guest context string for AI system prompt injection
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} guestPhone - Guest phone number
 * @param {string} [conversationTopic='incoming_call'] - Context for relevance scoring
 * @returns {Promise<string|null>} Formatted context string, or null if no memories
 */
async function buildGuestContext(restaurantId, guestPhone, conversationTopic = 'incoming_call') {
  if (!restaurantId || !guestPhone) {
    return null;
  }

  try {
    const memories = await retrieveMemories(
      restaurantId,
      guestPhone,
      conversationTopic,
      15
    );

    if (!memories || memories.length === 0) {
      return null;
    }

    // Group memories by type for structured output
    const grouped = {
      manager_note: [],
      preference: [],
      occasion: [],
      reflection: [],
      observation: []
    };

    for (const memory of memories) {
      const type = memory.memory_type;
      if (grouped[type]) {
        grouped[type].push(memory);
      }
    }

    // Build formatted context
    let context = '\n## Returning Guest Information\n';
    context += `Phone: ${guestPhone}\n`;
    context += `Total memories: ${memories.length}\n\n`;

    // Manager notes first (highest priority)
    if (grouped.manager_note.length > 0) {
      context += 'MANAGER INSTRUCTIONS (follow these carefully):\n';
      for (const m of grouped.manager_note) {
        context += `- ${m.content}\n`;
      }
      context += '\n';
    }

    // Preferences
    if (grouped.preference.length > 0) {
      context += 'Guest Preferences:\n';
      for (const m of grouped.preference) {
        context += `- ${m.content}\n`;
      }
      context += '\n';
    }

    // Occasions
    if (grouped.occasion.length > 0) {
      context += 'Special Occasions:\n';
      for (const m of grouped.occasion) {
        context += `- ${m.content}\n`;
      }
      context += '\n';
    }

    // Reflections (synthesized insights)
    if (grouped.reflection.length > 0) {
      context += 'Guest Profile Insights:\n';
      for (const m of grouped.reflection) {
        context += `- ${m.content}\n`;
      }
      context += '\n';
    }

    // Recent observations (limit to top 5 to avoid prompt bloat)
    if (grouped.observation.length > 0) {
      const recentObs = grouped.observation.slice(0, 5);
      context += 'Recent Interactions:\n';
      for (const m of recentObs) {
        const date = new Date(m.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        context += `- [${date}] ${m.content}\n`;
      }
      context += '\n';
    }

    context += 'Use this information to personalize the conversation. ';
    context += 'Reference their preferences naturally, but do not recite the list above. ';
    context += 'Be warm and make them feel remembered.\n';

    logger.info('Guest context built', {
      guestPhone: guestPhone.slice(0, 4) + '***',
      memoryCount: memories.length,
      contextLength: context.length
    });

    return context;
  } catch (error) {
    logger.error('Exception building guest context:', error.message);
    return null;
  }
}

/**
 * Import existing CustomerDNA profile data into the memory stream
 * One-time operation to bootstrap memories from historical data
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} guestPhone - Guest phone number
 * @returns {Promise<number>} Number of memories imported
 */
async function importFromDNA(restaurantId, guestPhone) {
  if (!restaurantId || !guestPhone) {
    return 0;
  }

  let imported = 0;

  try {
    // Check if already imported (avoid duplicates)
    const { data: existing } = await supabaseAdmin
      .from('guest_memories')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('guest_phone', guestPhone)
      .eq('source_type', 'dna_import')
      .limit(1);

    if (existing && existing.length > 0) {
      logger.info('DNA import already done for this guest, skipping');
      return 0;
    }

    // Import from customer_behavioral_profiles
    // DNA tables use customer_id (which IS the phone number) and have no restaurant_id column
    const { data: profile } = await supabaseAdmin
      .from('customer_behavioral_profiles')
      .select('*')
      .eq('customer_id', guestPhone)
      .maybeSingle();

    if (profile) {
      // Convert profile fields to memories using actual column names
      const profileMemories = [];

      if (profile.preferred_day_type) {
        profileMemories.push({
          content: `Typically visits on ${profile.preferred_day_type} days`,
          memoryType: 'observation',
          importance: 5
        });
      }
      if (profile.preferred_time_slot) {
        profileMemories.push({
          content: `Usually dines during ${profile.preferred_time_slot}`,
          memoryType: 'observation',
          importance: 5
        });
      }
      if (profile.typical_party_size) {
        profileMemories.push({
          content: `Average party size: ${profile.typical_party_size} guests`,
          memoryType: 'observation',
          importance: 4
        });
      }
      if (profile.dining_style) {
        profileMemories.push({
          content: `Dining style: ${profile.dining_style}`,
          memoryType: 'observation',
          importance: 5
        });
      }
      if (profile.dietary_restrictions) {
        profileMemories.push({
          content: `Dietary restrictions: ${profile.dietary_restrictions}`,
          memoryType: 'preference',
          importance: 8
        });
      }
      if (profile.preferred_seating) {
        profileMemories.push({
          content: `Prefers ${profile.preferred_seating} seating`,
          memoryType: 'preference',
          importance: 6
        });
      }
      if (profile.primary_occasion_type) {
        profileMemories.push({
          content: `Primary dining occasion: ${profile.primary_occasion_type}`,
          memoryType: 'observation',
          importance: 4
        });
      }
      if (profile.avg_check_per_person) {
        profileMemories.push({
          content: `Average spend per person: ${profile.avg_check_per_person}`,
          memoryType: 'observation',
          importance: 5
        });
      }

      for (const mem of profileMemories) {
        const result = await createMemory(restaurantId, guestPhone, {
          ...mem,
          sourceType: 'dna_import',
          sourceId: profile.id
        });
        if (result) imported++;
      }
    }

    // Import from customer_text_signals (keyed by customer_id = phone)
    const { data: signals } = await supabaseAdmin
      .from('customer_text_signals')
      .select('*')
      .eq('customer_id', guestPhone)
      .maybeSingle();

    if (signals) {
      // customer_text_signals stores extracted signals as JSON fields
      const signalMemories = [];

      if (signals.dietary_restrictions) {
        signalMemories.push({
          content: `Dietary info from text: ${JSON.stringify(signals.dietary_restrictions)}`,
          memoryType: 'preference',
          importance: 7
        });
      }
      if (signals.cuisine_preferences) {
        signalMemories.push({
          content: `Cuisine preferences: ${JSON.stringify(signals.cuisine_preferences)}`,
          memoryType: 'preference',
          importance: 6
        });
      }
      if (signals.seating_preferences) {
        signalMemories.push({
          content: `Seating preferences: ${signals.seating_preferences}`,
          memoryType: 'preference',
          importance: 6
        });
      }
      if (signals.vip_signals) {
        signalMemories.push({
          content: `VIP signals: ${JSON.stringify(signals.vip_signals)}`,
          memoryType: 'observation',
          importance: 7
        });
      }
      if (signals.sentiment_summary) {
        signalMemories.push({
          content: `Overall sentiment: ${signals.sentiment_summary}`,
          memoryType: 'observation',
          importance: 5
        });
      }

      for (const mem of signalMemories) {
        const result = await createMemory(restaurantId, guestPhone, {
          ...mem,
          sourceType: 'dna_import',
          sourceId: signals.id
        });
        if (result) imported++;
      }
    }

    // Import from customer_occasions (keyed by customer_id = phone)
    const { data: occasions } = await supabaseAdmin
      .from('customer_occasions')
      .select('*')
      .eq('customer_id', guestPhone);

    if (occasions && occasions.length > 0) {
      for (const occ of occasions) {
        if (occ.occasion_type && occ.occasion_date) {
          const result = await createMemory(restaurantId, guestPhone, {
            content: `${occ.occasion_type}: ${occ.occasion_date}${occ.special_requests ? ' - ' + occ.special_requests : ''}`,
            memoryType: 'occasion',
            importance: 7,
            sourceType: 'dna_import',
            sourceId: occ.id
          });
          if (result) imported++;
        }
      }
    }

    logger.info('DNA import completed', {
      guestPhone: guestPhone.slice(0, 4) + '***',
      imported
    });

    return imported;
  } catch (error) {
    logger.error('Exception during DNA import:', error.message);
    return imported;
  }
}

/**
 * Get all memories for a guest (used by manager notes panel)
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} [guestPhone] - Optional phone filter
 * @param {string} [memoryType] - Optional type filter
 * @param {number} [limit=50] - Maximum memories to return
 * @returns {Promise<Object[]>} Memories list
 */
async function listMemories(restaurantId, guestPhone, memoryType, limit = 50) {
  try {
    let query = supabaseAdmin
      .from('guest_memories')
      .select('id, guest_phone, memory_type, content, importance, source_type, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (guestPhone) {
      query = query.eq('guest_phone', guestPhone);
    }
    if (memoryType) {
      query = query.eq('memory_type', memoryType);
    }

    const { data, error } = await query;

    if (error) {
      // PGRST205/42P01: table doesn't exist yet — needs migration applied
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('guest_memories')) {
        logger.warn('guest_memories table not found. Run: database/migrations/20260218_guest_memories.sql in Supabase SQL Editor');
      } else {
        logger.error('Error listing memories:', error);
      }
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Exception listing memories:', error.message);
    return [];
  }
}

/**
 * Soft-delete a memory
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} memoryId - Memory UUID
 * @returns {Promise<boolean>} Success
 */
async function deleteMemory(restaurantId, memoryId) {
  try {
    const { error } = await supabaseAdmin
      .from('guest_memories')
      .update({ is_active: false })
      .eq('id', memoryId)
      .eq('restaurant_id', restaurantId);

    if (error) {
      logger.error('Error deleting memory:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Exception deleting memory:', error.message);
    return false;
  }
}

module.exports = {
  createMemory,
  retrieveMemories,
  getRecentMemories,
  buildGuestContext,
  importFromDNA,
  listMemories,
  deleteMemory
};
