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
  if (!entry) return null;
  // Also verify the underlying session hasn't DB-expired. A warm Lambda could
  // otherwise keep serving a 3h-old zombie session with restaurant_id=NULL
  // just because the cache entry itself was refreshed within the TTL.
  const nowMs = Date.now();
  const sessionExpiresMs = entry.session?.expires_at ? Date.parse(entry.session.expires_at) : 0;
  if (nowMs >= entry.expiresAt || (sessionExpiresMs && nowMs >= sessionExpiresMs)) {
    _sessionCache.delete(phone);
    return null;
  }
  return entry.session;
}

function _setCachedSession(phone, session) {
  if (!phone || !session) return;
  // Don't cache a session whose DB row is already expired — it would serve
  // the bot a dead session on the next cache hit before a real DB lookup.
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) return;
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

    // Create new session. Retry once on transient failure (cold Supabase, fetch abort)
    // so a timeout doesn't fall through to a stale/expired committed row.
    let newSession = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data, error } = await centralSupabase
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

      if (!error) { newSession = data; break; }
      lastError = error;

      const isConflict = error.code === '23505';
      const isAborted = error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('signal');
      logger.warn(`[SESSION_FAIL] insert attempt=${attempt} phone=${normalizedPhone} code=${error.code || 'N/A'} aborted=${isAborted} conflict=${isConflict} msg=${error.message?.slice(0, 100)}`);

      // Unique-violation means another Lambda won the race — committed row IS the right session.
      if (isConflict) {
        const { data: committed } = await centralSupabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('sender_phone', normalizedPhone)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (committed) { newSession = committed; break; }
      }

      // Fetch abort (cold start) — retry once after a short delay
      if (attempt === 1 && isAborted) {
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      break;
    }

    if (!newSession) {
      logger.error(`[SESSION_FAIL] insert exhausted retries for ${normalizedPhone}: ${lastError?.message?.slice(0, 120)}`);
      return null;
    }

    logger.info(`[WhatsAppSessions] New session created for ${normalizedPhone} id=${newSession.id}`);
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

  // Retry once on transient failure (cold Supabase connection, fetch abort)
  for (let attempt = 1; attempt <= 2; attempt++) {
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
        logger.error(`[SESSION_FAIL] setRestaurant attempt=${attempt} session=${sessionId} code=${error.code || 'N/A'} msg=${error.message?.slice(0, 120) || 'unknown'}`);
        if (attempt === 1) { await new Promise(r => setTimeout(r, 800)); continue; }
        return null;
      }

      logger.info(`[WhatsAppSessions] Session ${sessionId} linked to restaurant_id=${restaurantId}`);
      if (data?.sender_phone) _setCachedSession(data.sender_phone, data);
      return data;
    } catch (error) {
      logger.error(`[SESSION_FAIL] setRestaurant attempt=${attempt} threw: ${error?.message?.slice(0, 120)}`);
      if (attempt === 1) { await new Promise(r => setTimeout(r, 800)); continue; }
      return null;
    }
  }
  return null;
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
    // Ver nota acima: exceção muda fazia sessão ativa parecer inexistente.
    logger.error('[WhatsAppSessions] Exceção inesperada:', error?.message || error);
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
    // Ver nota acima: exceção muda fazia sessão ativa parecer inexistente.
    logger.error('[WhatsAppSessions] Exceção inesperada:', error?.message || error);
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
    // Erro de QUERY já é logado acima; este catch pega exceção (rede caiu,
    // timeout do Supabase). Era mudo — e sessão de voz sumindo por falha de
    // rede é indistinguível de "não havia sessão", com o cliente no telefone.
    logger.error('[WhatsAppSessions] Exceção inesperada:', error?.message || error);
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
    // Erro de QUERY já é logado acima; este catch pega exceção (rede caiu,
    // timeout do Supabase). Era mudo — e sessão de voz sumindo por falha de
    // rede é indistinguível de "não havia sessão", com o cliente no telefone.
    logger.error('[WhatsAppSessions] Exceção inesperada:', error?.message || error);
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

  let finalHistory;
  try {
    if (options.appendMessages && Array.isArray(options.appendMessages)) {
      // Atomic re-read-merge to avoid concurrent-Lambda history loss.
      const { data: current, error: readErr } = await centralSupabase
        .from('whatsapp_sessions')
        .select('conversation_history')
        .eq('id', sessionId)
        .maybeSingle();
      if (readErr) {
        logger.warn(`[SESSION_FAIL] history re-read session=${sessionId} msg=${readErr.message?.slice(0, 100)}`);
      }
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
  } catch (prepErr) {
    logger.error(`[SESSION_FAIL] history prep session=${sessionId} threw: ${prepErr?.message?.slice(0, 120)}`);
    finalHistory = (conversationHistory || []).slice(-20);
  }

  // Retry the UPDATE once on transient failure
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { error } = await centralSupabase
        .from('whatsapp_sessions')
        .update({
          conversation_history: finalHistory,
          last_message_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        logger.error(`[SESSION_FAIL] history update attempt=${attempt} session=${sessionId} code=${error.code || 'N/A'} msg=${error.message?.slice(0, 120) || 'unknown'}`);
        if (attempt === 1) { await new Promise(r => setTimeout(r, 800)); continue; }
        return false;
      }
      break;
    } catch (netErr) {
      logger.error(`[SESSION_FAIL] history update attempt=${attempt} threw: ${netErr?.message?.slice(0, 120)}`);
      if (attempt === 1) { await new Promise(r => setTimeout(r, 800)); continue; }
      return false;
    }
  }

  logger.info(`[WhatsAppSessions] History saved session=${sessionId} count=${finalHistory.length}`);
  // Refresh the cached session so the next message in this warm Lambda sees fresh history
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
    // Erro de QUERY já é logado acima; este catch pega exceção (rede caiu,
    // timeout do Supabase). Era mudo — e sessão de voz sumindo por falha de
    // rede é indistinguível de "não havia sessão", com o cliente no telefone.
    logger.error('[WhatsAppSessions] Exceção inesperada:', error?.message || error);
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
