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

// In-memory session cache keyed by phone — avoids repeated 1-2s Supabase roundtrips
// when the same warm Lambda handles consecutive messages from the same number.
// 60s TTL is short enough that restaurant_id updates from setSessionRestaurant
// propagate quickly, but long enough to cover a typical conversation burst.
const SESSION_CACHE_TTL_MS = 60 * 1000;
const _sessionCache = new Map(); // phone -> { session, expiresAt }

function _getCachedSession(phone) {
  const entry = _sessionCache.get(phone);
  if (entry && Date.now() < entry.expiresAt) return entry.session;
  if (entry) _sessionCache.delete(phone);
  return null;
}

function _setCachedSession(phone, session) {
  if (!phone || !session) return;
  _sessionCache.set(phone, { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  // Lightweight pruning so the Map never grows unbounded in a long-lived Lambda
  if (_sessionCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of _sessionCache) {
      if (v.expiresAt < now) _sessionCache.delete(k);
    }
  }
}

function _invalidateCachedSession(phone) {
  if (phone) _sessionCache.delete(phone);
}

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

  // Fast path: in-memory cache for warm Lambdas
  const cached = _getCachedSession(normalizedPhone);
  if (cached) {
    logger.info(`[WhatsAppSessions] Cache hit for ${normalizedPhone} (session ${cached.id})`);
    // Refresh expiry in DB fire-and-forget — don't block the response
    centralSupabase
      .from('whatsapp_sessions')
      .update({
        last_message_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
      })
      .eq('id', cached.id)
      .then(() => {}, err => logger.warn('[WhatsAppSessions] Background expiry refresh failed:', err.message));
    return cached;
  }

  try {
    // Check for existing active session
    const { data: existing, error: fetchError } = await centralSupabase
      .from('whatsapp_sessions')
      .select('*')
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
      _setCachedSession(normalizedPhone, existing);
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
      const isConflict = createError.code === '23505';
      const isAborted = createError.name === 'AbortError' || createError.message?.includes('aborted') || createError.message?.includes('signal');
      // Race condition or fetch timeout — INSERT may have committed. Re-query without expires_at filter.
      if (isConflict || isAborted) {
        if (isAborted) logger.warn('[WhatsAppSessions] INSERT fetch timed out, re-querying for committed row...');
        else logger.warn('[WhatsAppSessions] Concurrent session INSERT conflict, re-querying...');
        const { data: committed } = await centralSupabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('sender_phone', normalizedPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (committed) return committed;
      }
      logger.error('[WhatsAppSessions] Error creating session:', createError);
      return null;
    }

    logger.info(`[WhatsAppSessions] New session created for ${normalizedPhone}`);
    _setCachedSession(normalizedPhone, newSession);
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
    // Refresh cache with the updated session so the next message picks up restaurant_id
    if (data?.sender_phone) _setCachedSession(data.sender_phone, data);
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
      .select('*')
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
      .select('*')
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
async function updateSessionConversationHistory(sessionId, conversationHistory, options = {}) {
  if (!isCentralConfigured() || !sessionId) {
    return false;
  }

  try {
    let finalHistory;
    if (options.appendMessages && Array.isArray(options.appendMessages)) {
      // Atomic re-read-merge to avoid concurrent-Lambda history loss.
      // Read current DB state, append the NEW messages, write the union.
      const { data: current } = await centralSupabase
        .from('whatsapp_sessions')
        .select('conversation_history')
        .eq('id', sessionId)
        .maybeSingle();
      const dbHistory = Array.isArray(current?.conversation_history) ? current.conversation_history : [];

      const seen = new Set();
      const dedupKey = (m) => `${m?.role || ''}:${String(m?.content || '').slice(0, 100)}`;
      const combined = [...dbHistory, ...options.appendMessages].filter(m => {
        if (!m?.role || m.content == null) return false;
        const k = dedupKey(m);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      finalHistory = combined.slice(-20);
    } else {
      finalHistory = conversationHistory.slice(-20);
    }

    const { error } = await centralSupabase
      .from('whatsapp_sessions')
      .update({
        conversation_history: finalHistory,
        last_message_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      logger.error('[WhatsAppSessions] Error updating conversation history:', error);
      return false;
    }

    logger.info(`[WhatsAppSessions] Conversation history updated for session ${sessionId} (${finalHistory.length} messages)`);
    // Invalidate the cached session so the next message re-reads the fresh history
    // (we don't have sender_phone here without an extra lookup, so just clear stale entries)
    for (const [phone, entry] of _sessionCache) {
      if (entry.session?.id === sessionId) {
        _sessionCache.set(phone, {
          session: { ...entry.session, conversation_history: finalHistory },
          expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
        });
        break;
      }
    }
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
