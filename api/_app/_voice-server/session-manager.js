const { createSecureLogger } = require('../_lib/secure-logger');
const logger = createSecureLogger('SessionManager');

// In-memory store - sessions are ephemeral (one per active call)
const sessions = new Map();

class VoiceSession {
  constructor({ streamSid, callSid, restaurantId, callerNumber }) {
    if (!streamSid) throw new Error('streamSid is required');
    if (!callSid) throw new Error('callSid is required');

    this.streamSid = streamSid;
    this.callSid = callSid;
    this.restaurantId = restaurantId || null;
    this.callerNumber = callerNumber || null;
    this.restaurantConfig = null;
    this.aiBackend = null;
    this.conversationId = null;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.markCounter = 0;
    this.isInterrupted = false;
    this.pendingAudioChunks = [];
    this.metadata = {};
  }

  getNextMark() {
    this.markCounter += 1;
    return `mark_${this.markCounter}`;
  }

  touch() {
    this.lastActivityTime = Date.now();
  }

  getDurationSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

/**
 * Create a new voice session for an active call
 * @param {Object} params
 * @param {string} params.streamSid - Twilio stream SID (required)
 * @param {string} params.callSid - Twilio call SID (required)
 * @param {string} params.restaurantId - Restaurant ID
 * @param {string} params.callerNumber - Caller phone number
 * @returns {VoiceSession}
 */
function createSession({ streamSid, callSid, restaurantId, callerNumber }) {
  if (!streamSid) {
    throw new Error('streamSid is required to create a session');
  }
  if (!callSid) {
    throw new Error('callSid is required to create a session');
  }

  if (sessions.has(streamSid)) {
    logger.warn(`Session already exists for streamSid: ${streamSid}, replacing`);
    destroySession(streamSid);
  }

  const session = new VoiceSession({ streamSid, callSid, restaurantId, callerNumber });
  sessions.set(streamSid, session);

  logger.info(`Session created`, {
    streamSid,
    callSid,
    restaurantId,
    activeSessions: sessions.size
  });

  return session;
}

/**
 * Get an existing session by streamSid
 * @param {string} streamSid
 * @returns {VoiceSession|null}
 */
function getSession(streamSid) {
  return sessions.get(streamSid) || null;
}

/**
 * Destroy a session and clean up resources
 * @param {string} streamSid
 * @returns {VoiceSession|null} The destroyed session for final logging
 */
function destroySession(streamSid) {
  const session = sessions.get(streamSid);
  if (!session) {
    logger.warn(`No session found to destroy for streamSid: ${streamSid}`);
    return null;
  }

  // Disconnect AI backend if connected
  if (session.aiBackend) {
    try {
      if (typeof session.aiBackend.disconnect === 'function') {
        session.aiBackend.disconnect();
      }
    } catch (err) {
      logger.error(`Error disconnecting AI backend for ${streamSid}`, err);
    }
  }

  const duration = session.getDurationSeconds();
  logger.info(`Session destroyed`, {
    streamSid,
    callSid: session.callSid,
    restaurantId: session.restaurantId,
    durationSeconds: duration,
    marksGenerated: session.markCounter,
    activeSessions: sessions.size - 1
  });

  sessions.delete(streamSid);
  return session;
}

/**
 * Get summaries of all active sessions (no sensitive data)
 * Useful for monitoring and health checks
 * @returns {Array<Object>}
 */
function getActiveSessions() {
  const summaries = [];
  for (const [streamSid, session] of sessions) {
    summaries.push({
      streamSid,
      callSid: session.callSid,
      restaurantId: session.restaurantId,
      durationSeconds: session.getDurationSeconds(),
      hasAiBackend: session.aiBackend !== null,
      isInterrupted: session.isInterrupted,
      markCounter: session.markCounter
    });
  }
  return summaries;
}

/**
 * Remove sessions older than maxAge as a safety net
 * Handles sessions that were not properly cleaned up
 * @param {number} maxAgeMs - Maximum session age in ms (default 30 minutes)
 * @returns {number} Number of sessions cleaned up
 */
function cleanupStaleSessions(maxAgeMs = 30 * 60 * 1000) {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [streamSid, session] of sessions) {
    const age = now - session.startTime;
    if (age > maxAgeMs) {
      logger.warn(`Cleaning up stale session`, {
        streamSid,
        callSid: session.callSid,
        ageSeconds: Math.floor(age / 1000),
        maxAgeSeconds: Math.floor(maxAgeMs / 1000)
      });
      destroySession(streamSid);
      cleanedCount += 1;
    }
  }

  if (cleanedCount > 0) {
    logger.info(`Stale session cleanup complete`, {
      cleaned: cleanedCount,
      remaining: sessions.size
    });
  }

  return cleanedCount;
}

// Run cleanup every 5 minutes
const cleanupInterval = setInterval(() => cleanupStaleSessions(), 5 * 60 * 1000);
// Don't keep process alive just for cleanup
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

module.exports = {
  VoiceSession,
  createSession,
  getSession,
  destroySession,
  getActiveSessions,
  cleanupStaleSessions
};
