/**
 * Rate Limiting Middleware
 *
 * Provides IP-based rate limiting for API endpoints.
 * Uses Upstash Redis when configured (persistent across Vercel instances),
 * falls back to in-memory store for local development.
 */

const { Redis } = require('@upstash/redis');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('RateLimit');

// Rate limit configuration per endpoint type
const RATE_LIMITS = {
  // Strict limits for sensitive endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,           // 5 login attempts per window
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
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

let redis = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    logger.info('Using Upstash Redis store');
  } catch (err) {
    logger.error('Failed to initialize Redis, falling back to in-memory:', err.message);
    redis = null;
  }
} else {
  logger.info('No UPSTASH_REDIS_REST_URL configured, using in-memory store');
}

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
    // Redis error - fail open (allow request)
    logger.error('Redis error, allowing request:', err.message);
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetSeconds: windowSeconds,
      message: config.message,
    };
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

module.exports = {
  RATE_LIMITS,
  getClientId,
  checkRateLimit,
  rateLimitMiddleware,
  checkAndApplyRateLimit,
};
