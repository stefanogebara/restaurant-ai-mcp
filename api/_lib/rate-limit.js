/**
 * Rate Limiting Middleware
 *
 * Provides IP-based rate limiting for API endpoints
 * Uses in-memory store (suitable for serverless with low traffic)
 */

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

// In-memory store for rate limiting
// Note: In production with multiple instances, use Redis instead
const rateLimitStore = new Map();

// Cleanup interval (remove expired entries every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

/**
 * Clean up expired rate limit entries
 */
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

/**
 * Get client identifier (IP address or API key)
 * @param {object} req - Request object
 * @returns {string} Client identifier
 */
function getClientId(req) {
  // Try to get real IP from various headers (Vercel, Cloudflare, etc.)
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const vercelIp = req.headers['x-vercel-forwarded-for'];

  if (vercelIp) {
    return vercelIp.split(',')[0].trim();
  }
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  if (realIp) {
    return realIp;
  }

  // Fallback to connection remote address
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

/**
 * Check rate limit for a client
 * @param {string} clientId - Client identifier
 * @param {string} endpointType - Type of endpoint (auth, api, chat, reservation, webhook)
 * @returns {object} Rate limit status
 */
function checkRateLimit(clientId, endpointType = 'api') {
  cleanupExpiredEntries();

  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.api;
  const key = `${clientId}:${endpointType}`;
  const now = Date.now();

  let data = rateLimitStore.get(key);

  if (!data || now > data.resetTime) {
    // Create new window
    data = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(key, data);
  } else {
    // Increment count
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
 * Rate limiting middleware for Vercel serverless functions
 * @param {string} endpointType - Type of endpoint
 * @returns {function} Middleware function
 */
function rateLimitMiddleware(endpointType = 'api') {
  return (req, res, next) => {
    const clientId = getClientId(req);
    const result = checkRateLimit(clientId, endpointType);

    // Set rate limit headers
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
 * @returns {boolean} True if request should be blocked
 */
function checkAndApplyRateLimit(req, res, endpointType = 'api') {
  const clientId = getClientId(req);
  const result = checkRateLimit(clientId, endpointType);

  // Set rate limit headers
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
