/**
 * Unified Security Middleware
 *
 * Combines all security features into a single, easy-to-use module
 * for consistent security across all API endpoints
 */

const { corsMiddleware, applyCorsHeaders } = require('./cors');
const { checkAndApplyRateLimit, RATE_LIMITS } = require('./rate-limit');
const { applySecurityHeaders } = require('./security-headers');
const { verifyAuth } = require('./auth');
const { auditMiddleware, logSecurityEvent, AUDIT_EVENTS } = require('./audit-log');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('Security');

/**
 * Apply all security middleware to a request
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {object} options - Security options
 * @returns {object|null} Error response if security check failed, null if passed
 */
async function applySecurityMiddleware(req, res, options = {}) {
  const {
    rateLimit = 'api',
    requireAuth = false,
    authRoles = [],
    skipCors = false,
    skipRateLimit = false,
    skipSecurityHeaders = false,
  } = options;

  // Add request ID for audit correlation
  auditMiddleware(req, res);

  // Apply security headers
  if (!skipSecurityHeaders) {
    applySecurityHeaders(res);
  }

  // Handle CORS
  if (!skipCors) {
    const isPreflightHandled = corsMiddleware(req, res);
    if (isPreflightHandled) {
      return { handled: true }; // OPTIONS request handled
    }
  }

  // Apply rate limiting
  if (!skipRateLimit) {
    const rateLimitBlocked = await checkAndApplyRateLimit(req, res, rateLimit);
    if (rateLimitBlocked) {
      logSecurityEvent(AUDIT_EVENTS.SECURITY_RATE_LIMIT, req, {
        endpoint: req.url,
        rateLimit,
      });
      return { handled: true }; // Rate limit response already sent
    }
  }

  // Verify authentication if required
  if (requireAuth) {
    const authResult = await verifyAuth(req, { required: true, roles: authRoles });

    if (authResult.error) {
      logSecurityEvent(AUDIT_EVENTS.SECURITY_UNAUTHORIZED_ACCESS, req, {
        endpoint: req.url,
        error: authResult.error,
      });

      res.status(authResult.status || 401).json({
        error: authResult.error,
        message: authResult.error === 'Forbidden' ? 'Insufficient permissions' : 'Authentication required',
      });
      return { handled: true };
    }

    // Attach user to request
    req.user = authResult.user;
  }

  return null; // All security checks passed
}

/**
 * Create a secure API handler wrapper
 * @param {function} handler - The API handler function
 * @param {object} options - Security options
 * @returns {function} Wrapped handler with security middleware
 */
function secureHandler(handler, options = {}) {
  return async (req, res) => {
    try {
      const securityResult = await applySecurityMiddleware(req, res, options);

      if (securityResult?.handled) {
        return; // Security middleware already sent response
      }

      // Call the actual handler
      return await handler(req, res);
    } catch (error) {
      logger.error('Unhandled error in secure handler', error);

      // Don't expose internal error details in production
      const isProduction = process.env.NODE_ENV === 'production';
      res.status(500).json({
        error: 'Internal Server Error',
        message: isProduction ? 'An unexpected error occurred' : error.message,
        requestId: req.requestId,
      });
    }
  };
}

/**
 * Pre-configured security wrappers for common endpoint types
 */
const securityPresets = {
  /**
   * Public endpoint - CORS, rate limiting, security headers
   */
  public: (handler) => secureHandler(handler, {
    rateLimit: 'api',
    requireAuth: false,
  }),

  /**
   * Authenticated endpoint - requires valid JWT
   */
  authenticated: (handler) => secureHandler(handler, {
    rateLimit: 'api',
    requireAuth: true,
  }),

  /**
   * Admin endpoint - requires auth with admin role
   */
  admin: (handler) => secureHandler(handler, {
    rateLimit: 'api',
    requireAuth: true,
    authRoles: ['admin'],
  }),

  /**
   * Chat/AI endpoint - stricter rate limiting
   */
  chat: (handler) => secureHandler(handler, {
    rateLimit: 'chat',
    requireAuth: false,
  }),

  /**
   * Reservation endpoint - moderate rate limiting
   */
  reservation: (handler) => secureHandler(handler, {
    rateLimit: 'reservation',
    requireAuth: false,
  }),

  /**
   * Webhook endpoint - higher rate limit, skip auth
   */
  webhook: (handler) => secureHandler(handler, {
    rateLimit: 'webhook',
    requireAuth: false,
  }),

  /**
   * Auth endpoint - strict rate limiting for login attempts
   */
  auth: (handler) => secureHandler(handler, {
    rateLimit: 'auth',
    requireAuth: false,
  }),
};

module.exports = {
  applySecurityMiddleware,
  secureHandler,
  securityPresets,
  // Re-export individual modules for granular control
  cors: require('./cors'),
  rateLimit: require('./rate-limit'),
  securityHeaders: require('./security-headers'),
  auth: require('./auth'),
  auditLog: require('./audit-log'),
  secureLogger: require('./secure-logger'),
  validation: require('./validation'),
  secureId: require('./secure-id'),
};
