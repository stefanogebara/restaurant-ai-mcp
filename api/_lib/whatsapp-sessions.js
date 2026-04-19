/**
 * WhatsApp Session Manager
 *
 * Tracks conversation state per phone number for multi-tenant routing.
 * Sessions expire after 30 minutes of inactivity.
 */

const { centralSupabase, isCentralConfigured } = require('./central-supabase');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('WhatsAppSessions');

// Session expiry time in milliseconds (30 minutes)
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Get existing session or create a new one
 * @param {string} senderPhone - Customer's phone number
 * @param {string} conversationId - ElevenLabs conversation ID
 * @returns {Promise<object|null>} Session object with restaurant if available
 */
async function getOrCreateSession(senderPhone, conversationId) {
  if (!isCentralConfigured()) {
    logger.error('[WhatsAppSessions] Central Supabase not configured');
    return null;
  }

  if (!senderPhone) {
    logger.warn('[WhatsAppSessions] No sender phone provided');
    return null;
  }

  // Normalize phone number (remove spaces, ensure + prefix)
  const normalizedPhone = normalizePhoneNumber(senderPhone);

  try {
    // Check for existing active session
    const { data: existing, error: fetchError } = await centralSupabase
      .from('whatsapp_sessions')
      .select(`
        *,
        restaurant:restaurant_registry(*)
      `)
      .eq('sender_phone', normalizedPhone)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing && !fetchError) {
      // Update session activity
      await centralSupabase
        .from('whatsapp_sessions')
        .update({
          last_message_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
          conversation_id: conversationId || existing.conversation_id
        })
        .eq('id', existing.id);

      logger.info(`[WhatsAppSessions] Existing session found for ${normalizedPhone}: ${existing.restaurant?.restaurant_name || 'No restaurant yet'}`);
      return existing;
    }

    // Create new session
    const { data: newSession, error: createError } = await centralSupabase
      .from('whatsapp_sessions')
      .insert({
        sender_phone: normalizedPhone,
        conversation_id: conversationId,
        restaurant_confirmed: false,
        last_message_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString()
      })
      .select()
      .single();

    if (createError) {
      // Race condition: another Lambda beat us to it — re-query for the session it created.
      if (createError.code === '23505') {
        logger.warn('[WhatsAppSessions] Concurrent session INSERT conflict, re-querying...');
        const { data: raceWinner } = await centralSupabase
          .from('whatsapp_sessions')
          .select('*, restaurant:restaurant_registry(*)')
          .eq('sender_phone', normalizedPhone)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (raceWinner) return raceWinner;
      }
      logger.error('[WhatsAppSessions] Error creating session:', createError);
      return null;
    }

    logger.info(`[WhatsAppSessions] New session created for ${normalizedPhone}`);
    return newSession;

  } catch (error) {
    logger.error('[WhatsAppSessions] Error in getOrCreateSession:', error);
    return null;
  }
}

/**
 * Set the restaurant for a session
 * @param {string} sessionId - Session UUID
 * @param {string} restaurantId - Restaurant UUID
 * @returns {Promise<object|null>} Updated session with restaurant
 */
async function setSessionRestaurant(sessionId, restaurantId) {
  if (!isCentralConfigured() || !sessionId || !restaurantId) {
    return null;
  }

  try {
    const { data, error } = await centralSupabase
      .from('whatsapp_sessions')
      .update({
        restaurant_id: restaurantId,
        restaurant_confirmed: true,
        last_message_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString()
      })
      .eq('id', sessionId)
      .select('*')
      .single();

    if (error) {
      logger.error('[WhatsAppSessions] Error setting restaurant:', error);
      return null;
    }

    logger.info(`[WhatsAppSessions] Session ${sessionId} linked to restaurant: ${data.restaurant?.restaurant_name}`);
    return data;

  } catch (error) {
    logger.error('[WhatsAppSessions] Error:', error);
    return null;
  }
}

/**
 * Get session by phone number
 * @param {string} senderPhone - Customer's phone number
 * @returns {Promise<object|null>} Active session or null
 */
async function getSessionByPhone(senderPhone) {
  if (!isCentralConfigured() || !senderPhone) {
    return null;
  }

  const normalizedPhone = normalizePhoneNumber(senderPhone);

  try {
    const { data, error } = await centralSupabase
      .from('whatsapp_sessions')
      .select(`
        *,
        restaurant:restaurant_registry(*)
      `)
      .eq('sender_phone', normalizedPhone)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Get session by conversation ID
 * @param {string} conversationId - ElevenLabs conversation ID
 * @returns {Promise<object|null>} Active session or null
 */
async function getSessionByConversationId(conversationId) {
  if (!isCentralConfigured() || !conversationId) {
    return null;
  }

  try {
    const { data, error } = await centralSupabase
      .from('whatsapp_sessions')
      .select(`
        *,
        restaurant:restaurant_registry(*)
      `)
      .eq('conversation_id', conversationId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Clear a session (end conversation)
 * @param {string} sessionId - Session UUID
 * @returns {Promise<boolean>} Success status
 */
async function clearSession(sessionId) {
  if (!isCentralConfigured() || !sessionId) {
    return false;
  }

  try {
    const { error } = await centralSupabase
      .from('whatsapp_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      logger.error('[WhatsAppSessions] Error clearing session:', error);
      return false;
    }

    logger.info(`[WhatsAppSessions] Session ${sessionId} cleared`);
    return true;
  } catch (error) {
    logger.error('[WhatsAppSessions] Error:', error);
    return false;
  }
}

/**
 * Clear all sessions for a phone number
 * @param {string} senderPhone - Customer's phone number
 * @returns {Promise<number>} Number of sessions cleared
 */
async function clearSessionsByPhone(senderPhone) {
  if (!isCentralConfigured() || !senderPhone) {
    return 0;
  }

  const normalizedPhone = normalizePhoneNumber(senderPhone);

  try {
    const { data, error } = await centralSupabase
      .from('whatsapp_sessions')
      .delete()
      .eq('sender_phone', normalizedPhone)
      .select();

    if (error) {
      logger.error('[WhatsAppSessions] Error clearing sessions:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Clean up expired sessions
 * @returns {Promise<number>} Number of sessions cleaned up
 */
async function cleanupExpiredSessions() {
  if (!isCentralConfigured()) {
    return 0;
  }

  try {
    const { data, error } = await centralSupabase
      .from('whatsapp_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select();

    if (error) {
      logger.error('[WhatsAppSessions] Error cleaning up sessions:', error);
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.info(`[WhatsAppSessions] Cleaned up ${count} expired sessions`);
    }

    return count;
  } catch (error) {
    return 0;
  }
}

/**
 * Normalize phone number format
 * @param {string} phone - Raw phone number
 * @returns {string} Normalized phone number
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';

  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Ensure + prefix for international format
  if (!normalized.startsWith('+') && normalized.length >= 10) {
    normalized = '+' + normalized;
  }

  return normalized;
}

/**
 * Update conversation history for a session
 * @param {string} sessionId - Session UUID
 * @param {Array} conversationHistory - Array of conversation messages
 * @returns {Promise<boolean>} Success status
 */
async function updateSessionConversationHistory(sessionId, conversationHistory) {
  if (!isCentralConfigured() || !sessionId) {
    return false;
  }

  try {
    // Limit conversation history to last 20 messages to avoid payload size issues
    const limitedHistory = conversationHistory.slice(-20);

    const { error } = await centralSupabase
      .from('whatsapp_sessions')
      .update({
        conversation_history: limitedHistory,
        last_message_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      logger.error('[WhatsAppSessions] Error updating conversation history:', error);
      return false;
    }

    logger.info(`[WhatsAppSessions] Conversation history updated for session ${sessionId} (${limitedHistory.length} messages)`);
    return true;
  } catch (error) {
    logger.error('[WhatsAppSessions] Error:', error);
    return false;
  }
}

/**
 * Get active session count
 * @returns {Promise<number>} Number of active sessions
 */
async function getActiveSessionCount() {
  if (!isCentralConfigured()) {
    return 0;
  }

  try {
    const { count, error } = await centralSupabase
      .from('whatsapp_sessions')
      .select('*', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());

    if (error) {
      return 0;
    }

    return count || 0;
  } catch (error) {
    return 0;
  }
}

module.exports = {
  getOrCreateSession,
  setSessionRestaurant,
  getSessionByPhone,
  getSessionByConversationId,
  clearSession,
  clearSessionsByPhone,
  cleanupExpiredSessions,
  normalizePhoneNumber,
  getActiveSessionCount,
  updateSessionConversationHistory
};
