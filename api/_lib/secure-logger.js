/**
 * Secure Logger
 *
 * Provides logging utilities that automatically mask sensitive data
 * to prevent accidental exposure in logs
 */

// Auto-initialize Sentry for all routes that use logging
require('./sentry');

// Patterns that indicate sensitive data
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /bearer/i,
  /password/i,
  /secret/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /session[_-]?id/i,
  /jwt/i,
  /authorization/i,
];

// Keys that should always be masked
const SENSITIVE_KEYS = new Set([
  'password',
  'apiKey',
  'api_key',
  'apikey',
  'secret',
  'secretKey',
  'secret_key',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'auth',
  'authToken',
  'auth_token',
  'privateKey',
  'private_key',
  'credential',
  'credentials',
  'sessionId',
  'session_id',
  'jwt',
  'jwtToken',
  'jwt_token',
  'cookie',
  'cookies',
  'x-api-key',
  'x-auth-token',
]);

/**
 * Check if a key name suggests sensitive data
 * @param {string} key - Key name to check
 * @returns {boolean} Whether key appears sensitive
 */
function isSensitiveKey(key) {
  if (!key || typeof key !== 'string') return false;

  const lowerKey = key.toLowerCase();

  // Check exact matches
  if (SENSITIVE_KEYS.has(lowerKey)) return true;

  // Check patterns
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Mask a sensitive value
 * @param {any} value - Value to mask
 * @param {number} visibleChars - Number of characters to show at start/end
 * @returns {string} Masked value
 */
function maskValue(value, visibleChars = 2) {
  if (value === null || value === undefined) return '[null]';
  if (typeof value === 'boolean') return '[boolean]';
  if (typeof value === 'number') return '[number]';

  const str = String(value);
  if (str.length <= visibleChars * 2 + 3) {
    return '[redacted]';
  }

  return `${str.substring(0, visibleChars)}***${str.substring(str.length - visibleChars)}`;
}

/**
 * Recursively sanitize an object for logging
 * @param {any} obj - Object to sanitize
 * @param {Set} seen - Set of seen objects (for circular reference detection)
 * @returns {any} Sanitized object
 */
function sanitizeForLogging(obj, seen = new Set()) {
  if (obj === null || obj === undefined) return obj;

  // Handle primitive types
  if (typeof obj !== 'object') return obj;

  // Handle circular references
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item, seen));
  }

  // Handle objects
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = maskValue(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value, seen);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize headers for logging
 * @param {object} headers - HTTP headers object
 * @returns {object} Sanitized headers
 */
function sanitizeHeaders(headers) {
  if (!headers) return {};

  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    // Always mask these headers
    if (lowerKey === 'authorization' ||
        lowerKey === 'cookie' ||
        lowerKey === 'x-api-key' ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret')) {
      sanitized[key] = maskValue(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize request body for logging
 * @param {object} body - Request body
 * @returns {object} Sanitized body
 */
function sanitizeBody(body) {
  return sanitizeForLogging(body);
}

/**
 * Create a secure logger instance
 * @param {string} prefix - Log prefix/module name
 * @returns {object} Logger instance
 */
function createSecureLogger(prefix = '') {
  const formatPrefix = prefix ? `[${prefix}]` : '';

  return {
    /**
     * Log info message
     * @param {string} message - Log message
     * @param {object} data - Optional data to log
     */
    info(message, data = null) {
      if (data) {
        console.log(`${formatPrefix} ${message}`, sanitizeForLogging(data));
      } else {
        console.log(`${formatPrefix} ${message}`);
      }
    },

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {object} data - Optional data to log
     */
    warn(message, data = null) {
      if (data) {
        console.warn(`${formatPrefix} ${message}`, sanitizeForLogging(data));
      } else {
        console.warn(`${formatPrefix} ${message}`);
      }
    },

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Error|object} error - Error object or data
     */
    error(message, error = null) {
      if (error instanceof Error) {
        console.error(`${formatPrefix} ${message}`, {
          name: error.name,
          message: error.message,
          // Don't log full stack in production to avoid info leakage
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
      } else if (error) {
        console.error(`${formatPrefix} ${message}`, sanitizeForLogging(error));
      } else {
        console.error(`${formatPrefix} ${message}`);
      }
    },

    /**
     * Log debug message (only in development)
     * @param {string} message - Log message
     * @param {object} data - Optional data to log
     */
    debug(message, data = null) {
      if (process.env.NODE_ENV !== 'development') return;

      if (data) {
        console.log(`${formatPrefix} [DEBUG] ${message}`, sanitizeForLogging(data));
      } else {
        console.log(`${formatPrefix} [DEBUG] ${message}`);
      }
    },

    /**
     * Log request for audit purposes
     * @param {object} req - Request object
     * @param {object} options - Options
     */
    logRequest(req, options = {}) {
      const { includeBody = false } = options;

      const logData = {
        method: req.method,
        url: req.url,
        headers: sanitizeHeaders(req.headers),
        ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        timestamp: new Date().toISOString(),
      };

      if (includeBody && req.body) {
        logData.body = sanitizeBody(req.body);
      }

      console.log(`${formatPrefix} Request:`, logData);
    },
  };
}

module.exports = {
  isSensitiveKey,
  maskValue,
  sanitizeForLogging,
  sanitizeHeaders,
  sanitizeBody,
  createSecureLogger,
};
