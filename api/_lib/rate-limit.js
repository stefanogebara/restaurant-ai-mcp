/**
 * Rate Limiting Middleware
 *
 * Provides IP-based rate limiting for API endpoints.
 * Uses Upstash Redis when configured (persistent across Vercel instances),
 * falls back to in-memory store for local development.
 */

const { createRedisClient } = require('./redis-client');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('RateLimit');

// Track consecutive Redis failures for escalated logging
let redisFailCount = 0;
const REDIS_FAIL_WARN_THRESHOLD = 3;
const REDIS_FAIL_CRIT_THRESHOLD = 10;

// In-process dedup fallback — catches same-Lambda retries when Redis is unavailable.
// Map<messageId, expiresAt (ms since epoch)>
const inProcessDedupMap = new Map();
const IN_PROCESS_DEDUP_TTL_MS = 30 * 60 * 1000; // 30 minutes

function inProcessDedupCheck(messageId) {
  const now = Date.now();
  const expiresAt = inProcessDedupMap.get(messageId);
  if (expiresAt !== undefined && expiresAt > now) {
    return true; // duplicate — already seen in this Lambda instance
  }
  inProcessDedupMap.set(messageId, now + IN_PROCESS_DEDUP_TTL_MS);
  // Prune expired entries every ~100 calls to avoid unbounded growth
  if (inProcessDedupMap.size > 500) {
    for (const [k, v] of inProcessDedupMap) {
      if (v < now) inProcessDedupMap.delete(k);
    }
  }
  return false;
}

// Rate limit configuration per endpoint type
const RATE_LIMITS = {
  // Strict limits for sensitive endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,           // 5 login attempts per window
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },

  // OTP verification attempts
  otp: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,           // 5 OTP attempts per window (brute force protection)
    message: 'Too many verification attempts. Please request a new code and try again in 15 minutes.',
  },

  // OTP send requests (prevents WhatsApp flooding / Twilio cost abuse)
  'otp-send': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 3,           // 3 OTP sends per window per user
    message: 'Too many verification code requests. Please wait 15 minutes before requesting again.',
  },

  // Demo restaurant creation
  'demo-create': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,          // 10 demo creations per 15 min per IP
    message: 'Too many demo creation attempts. Please try again in 15 minutes.',
  },

  // Tight limit for public enumeration endpoints (booking-qr, identify-restaurant)
  public_enumeration: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 20,          // 20 requests per minute
    message: 'Too many requests. Please slow down.',
  },

  // Standard API limits
  api: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 60,          // 60 requests per minute
    message: 'Too many requests. Please slow down.',
  },

  // Chat/AI endpoints (expensive operations)
  chat: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 10,          // 10 requests per minute
    message: 'Too many chat requests. Please wait a moment.',
  },

  // Customer portal / reservation lookup (public-facing)
  customer_portal: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 30,
    message: 'Too many requests. Please try again later.',
  },

  // Reservation creation
  reservation: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,          // 20 reservations per hour per IP
    message: 'Too many reservation requests. Please try again later.',
  },

  // Webhook endpoints (external services)
  webhook: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 100,         // 100 requests per minute (higher for webhooks)
    message: 'Rate limit exceeded for webhooks.',
  },
};

// ============ REDIS STORE ============

const redis = createRedisClient('RateLimit');

// ============ IN-MEMORY FALLBACK ============

const rateLimitStore = new Map();
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// ============ RATE LIMIT LOGIC ============

/**
 * Get client identifier (IP address)
 * @param {object} req - Request object
 * @returns {string} Client identifier
 */
function getClientId(req) {
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  if (vercelIp) return vercelIp.split(',')[0].trim();

  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return forwardedFor.split(',')[0].trim();

  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp;

  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

/**
 * Check rate limit using Redis (persistent across instances)
 * Uses a sliding window counter via INCR + EXPIRE.
 */
async function checkRateLimitRedis(clientId, endpointType) {
  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.api;
  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const key = `rl:${clientId}:${endpointType}`;

  try {
    // Atomic increment + set TTL if new key
    const count = await redis.incr(key);
    if (redisFailCount > 0) redisFailCount = 0; // Reset on success
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    // Get remaining TTL for headers
    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, config.maxRequests - count);

    return {
      allowed: count <= config.maxRequests,
      limit: config.maxRequests,
      remaining,
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
      message: config.message,
    };
  } catch (err) {
    redisFailCount++;
    const logLevel = redisFailCount >= REDIS_FAIL_CRIT_THRESHOLD ? 'error' : 'warn';
    logger[logLevel]('Redis rate-limit error, falling back to in-memory store', {
      error: err.message,
      clientId,
      endpointType,
      consecutiveFailures: redisFailCount,
    });
    return checkRateLimitMemory(clientId, endpointType);
  }
}

/**
 * Check rate limit using in-memory store (local/fallback)
 */
function checkRateLimitMemory(clientId, endpointType) {
  cleanupExpiredEntries();

  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.api;
  const key = `${clientId}:${endpointType}`;
  const now = Date.now();

  let data = rateLimitStore.get(key);

  if (!data || now > data.resetTime) {
    data = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(key, data);
  } else {
    data.count++;
  }

  const remaining = Math.max(0, config.maxRequests - data.count);
  const resetSeconds = Math.ceil((data.resetTime - now) / 1000);

  return {
    allowed: data.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining,
    resetSeconds,
    message: config.message,
  };
}

/**
 * Check rate limit (auto-selects Redis or in-memory)
 * @param {string} clientId - Client identifier
 * @param {string} endpointType - Type of endpoint
 * @returns {Promise<object>|object} Rate limit status
 */
function checkRateLimit(clientId, endpointType = 'api') {
  if (redis) {
    return checkRateLimitRedis(clientId, endpointType);
  }
  return checkRateLimitMemory(clientId, endpointType);
}

/**
 * Rate limiting middleware for Express-style handlers
 * @param {string} endpointType - Type of endpoint
 * @returns {function} Middleware function
 */
function rateLimitMiddleware(endpointType = 'api') {
  return async (req, res, next) => {
    const clientId = getClientId(req);
    const result = await checkRateLimit(clientId, endpointType);

    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetSeconds);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.resetSeconds);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: result.message,
        retryAfter: result.resetSeconds,
      });
    }

    if (typeof next === 'function') {
      next();
    }

    return result;
  };
}

/**
 * Check rate limit for Vercel serverless (non-middleware style)
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {string} endpointType - Type of endpoint
 * @returns {Promise<boolean>} True if request should be blocked
 */
async function checkAndApplyRateLimit(req, res, endpointType = 'api') {
  const clientId = getClientId(req);
  const result = await checkRateLimit(clientId, endpointType);

  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetSeconds);

  if (!result.allowed) {
    res.setHeader('Retry-After', result.resetSeconds);
    res.status(429).json({
      error: 'Too Many Requests',
      message: result.message,
      retryAfter: result.resetSeconds,
    });
    return true; // Request blocked
  }

  return false; // Request allowed
}

// ============ MESSAGE DEDUPLICATION ============

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB

/**
 * Check if a message has already been processed.
 *
 * Primary mechanism: Supabase INSERT on whatsapp_message_dedup (UNIQUE on
 * message_id) — atomic across Lambda instances via the DB's serializable
 * unique-constraint check. First Lambda to INSERT wins; any other Lambda
 * processing the same message_id gets a 23505 conflict and returns true
 * (duplicate) without running the AI pipeline.
 *
 * Fallback: Redis SET NX (legacy) and in-process Map. Redis is unreliable
 * on Vercel despite UPSTASH_* env vars being set — observed `dbsize=0` for
 * the dedup key pattern after hours of production traffic (2026-04-22).
 *
 * @param {string} messageId - Unique message identifier (e.g. Twilio MessageSid or Meta message ID)
 * @param {number} ttlSeconds - How long to remember the message (default 5 min)
 * @returns {Promise<boolean>} True if duplicate and should be skipped
 */
async function isMessageDuplicate(messageId, ttlSeconds = 300) {
  if (!messageId) return false;

  // Primary: Supabase unique-constraint dedup. Atomic across Lambdas.
  try {
    const { centralSupabase } = require('./central-supabase');
    if (centralSupabase) {
      const { error } = await centralSupabase
        .from('whatsapp_message_dedup')
        .insert({ message_id: messageId });

      if (!error) {
        // INSERT succeeded — first Lambda to see this messageId
        if (!inProcessDedupCheck(messageId)) { /* also record in-process */ }
        return false;
      }
      if (error.code === '23505') {
        // Unique violation — another Lambda already took this message
        return true;
      }
      if (error.code === '42P01') {
        // Table doesn't exist yet (migration not applied). Log once and fall through.
        logger.warn('[Dedup] whatsapp_message_dedup table missing — apply migration 20260422_whatsapp_message_dedup.sql');
      } else {
        logger.warn(`[Dedup] Supabase dedup error code=${error.code} msg=${error.message?.slice(0, 100)}`);
      }
    }
  } catch (err) {
    logger.warn('[Dedup] Supabase dedup threw:', err.message?.slice(0, 100));
  }

  // Fallback 1: In-process check — catches same-Lambda retries
  if (inProcessDedupCheck(messageId)) {
    return true;
  }

  // Fallback 2: Redis SET NX (legacy — unreliable on Vercel, kept as best-effort)
  if (!redis) return false;

  try {
    const result = await redis.set(`wa:dedup:${messageId}`, '1', { nx: true, ex: ttlSeconds });
    return result === null;
  } catch (err) {
    redisFailCount++;
    logger.warn('Redis dedup error, allowing message through:', {
      error: err.message,
      consecutiveFailures: redisFailCount,
    });
    return false;
  }
}

// ============ PER-PHONE PROCESSING LOCK ============

/**
 * Acquire a per-phone processing lock so concurrent Lambdas don't overwrite each other's history.
 * Returns true if lock was acquired (caller should proceed), false if already held (caller should wait).
 *
 * Primary: Supabase whatsapp_processing_lock table (atomic UNIQUE constraint on phone).
 *   - Expired locks are cleaned out before the INSERT attempt, so a crashed prior
 *     Lambda that never called releaseProcessingLock cannot block future messages.
 * Fallback: Redis SET NX. Kept for resilience, but observed unreliable on Vercel
 *   (see whatsapp_message_dedup.sql for context).
 * Last resort: fail open with a warning.
 */
async function acquireProcessingLock(phone, ttlSeconds = 25) {
  if (!phone) return true;
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Primary: Supabase atomic lock
  try {
    const { centralSupabase } = require('./central-supabase');
    if (centralSupabase) {
      // Clear any expired lock for this phone (no-op if still valid).
      // Racing with another Lambda's acquire is fine: the INSERT below is
      // the authoritative step and only one caller's insert wins.
      await centralSupabase
        .from('whatsapp_processing_lock')
        .delete()
        .eq('phone', phone)
        .lt('expires_at', nowIso);

      const { error } = await centralSupabase
        .from('whatsapp_processing_lock')
        .insert({ phone, expires_at: expiresAt });

      if (!error) return true;              // we hold the lock
      if (error.code === '23505') return false;  // someone else holds it

      if (error.code === '42P01' || error.code === 'PGRST205') {
        logger.warn('[Lock] whatsapp_processing_lock table missing — apply migration 20260422_whatsapp_processing_lock.sql');
      } else {
        logger.warn(`[Lock] Supabase lock error code=${error.code} msg=${error.message?.slice(0, 100)}`);
      }
      // Fall through to Redis
    }
  } catch (err) {
    logger.warn('[Lock] Supabase lock threw:', err.message?.slice(0, 100));
  }

  // Fallback: Redis SET NX
  if (!redis) return true;
  try {
    const result = await redis.set(`wa:proc_lock:${phone}`, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch (err) {
    logger.warn('Redis processing lock acquire error (fail open):', err.message);
    return true;
  }
}

/**
 * Release the per-phone processing lock after history is saved.
 */
async function releaseProcessingLock(phone) {
  if (!phone) return;

  try {
    const { centralSupabase } = require('./central-supabase');
    if (centralSupabase) {
      await centralSupabase
        .from('whatsapp_processing_lock')
        .delete()
        .eq('phone', phone);
    }
  } catch (err) {
    logger.warn('[Lock] Supabase lock release threw:', err.message?.slice(0, 100));
  }

  if (!redis) return;
  try {
    await redis.del(`wa:proc_lock:${phone}`);
  } catch (err) {
    logger.warn('Redis processing lock release error (non-fatal):', err.message);
  }
}

/**
 * Reject requests whose Content-Length exceeds the allowed limit.
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @returns {boolean} True if request was rejected (caller should return immediately)
 */
function rejectOversizedBody(req, res) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Payload Too Large', message: 'Request body must not exceed 1 MB.' });
    return true;
  }
  return false;
}

// ============================================================================
// Failure counter — a lightweight per-IP counter for tracking suspicious
// behaviour patterns OTHER than raw request volume. Use case: an attacker
// enumerating restaurant slugs by varying the slug param every request
// would slip past a normal rate limit (different inputs, same low rate)
// but stands out clearly when you count 404 responses per IP.
//
// Pattern:
//   1. Before the work, call peekFailureCount() — if it's over your floor,
//      reject immediately with a 429.
//   2. Do the work.
//   3. If the result is a "failure" (404, invalid lookup, etc), call
//      bumpFailureCount() to increment.
//   4. Success paths do NOT bump — that's the whole point of the counter.
//
// Gracefully degrades when Redis is unavailable (returns 0 / no-ops),
// matching the existing in-memory fallback philosophy: never block legit
// users because of an ops issue.
// ============================================================================

/**
 * Read the current failure count for an IP+namespace without changing it.
 * Returns 0 if Redis is unavailable or the key doesn't exist.
 *
 * @param {object} req - Request object (used to derive client IP)
 * @param {string} namespace - Logical bucket name (e.g. 'slug-lookup-fail')
 * @returns {Promise<number>}
 */
async function peekFailureCount(req, namespace) {
  if (!redis) return 0; // No counter persistence available — fail open.
  try {
    const clientId = getClientId(req);
    const key = `rl:fail:${namespace}:${clientId}`;
    const value = await redis.get(key);
    if (value == null) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    logger.warn('peekFailureCount failed, returning 0', { error: err.message, namespace });
    return 0;
  }
}

/**
 * Increment the failure counter for an IP+namespace. Sets TTL on first hit
 * so the counter naturally expires after the window closes.
 *
 * @param {object} req - Request object
 * @param {string} namespace - Logical bucket name
 * @param {number} windowSeconds - TTL on first increment (default 1h)
 * @returns {Promise<number>} The new count, or 0 on Redis failure
 */
async function bumpFailureCount(req, namespace, windowSeconds = 3600) {
  if (!redis) return 0; // No counter persistence — silently no-op.
  try {
    const clientId = getClientId(req);
    const key = `rl:fail:${namespace}:${clientId}`;
    const newCount = await redis.incr(key);
    if (newCount === 1) {
      await redis.expire(key, windowSeconds);
    }
    return newCount;
  } catch (err) {
    logger.warn('bumpFailureCount failed, returning 0', { error: err.message, namespace });
    return 0;
  }
}

module.exports = {
  RATE_LIMITS,
  getClientId,
  checkRateLimit,
  rateLimitMiddleware,
  checkAndApplyRateLimit,
  isMessageDuplicate,
  acquireProcessingLock,
  releaseProcessingLock,
  rejectOversizedBody,
  peekFailureCount,
  bumpFailureCount,
};
