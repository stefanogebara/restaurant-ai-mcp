/**
 * Security Headers Middleware
 *
 * Applies comprehensive security headers to API responses
 */

/**
 * Security headers configuration
 */
const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // X-XSS-Protection removed: modern browsers ignore it and it can
  // introduce XSS vulnerabilities in older IE versions (OWASP recommends '0').
  // CSP is the proper mitigation.

  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // HTTP Strict Transport Security (HTTPS only)
  // max-age: 1 year, includeSubDomains for all subdomains
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',

  // Permissions Policy (formerly Feature-Policy)
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), interest-cohort=()',

  // Prevent caching of sensitive API responses
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

/**
 * Content Security Policy for API responses
 * More restrictive than frontend since APIs shouldn't serve HTML
 */
const CSP_POLICY = [
  "default-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Apply security headers to response
 * @param {object} res - Response object
 * @param {object} options - Options
 * @param {boolean} options.includeCSP - Include CSP header (default: true for API)
 * @param {boolean} options.allowCache - Allow caching (default: false)
 */
function applySecurityHeaders(res, options = {}) {
  const { includeCSP = true, allowCache = false } = options;

  // Apply all security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    // Skip cache headers if caching is allowed
    if (allowCache && ['Cache-Control', 'Pragma', 'Expires'].includes(key)) {
      return;
    }
    res.setHeader(key, value);
  });

  // Add CSP for API responses
  if (includeCSP) {
    res.setHeader('Content-Security-Policy', CSP_POLICY);
  }
}

/**
 * Security headers middleware for Vercel serverless functions
 * @param {object} options - Middleware options
 * @returns {function} Middleware function
 */
function securityHeadersMiddleware(options = {}) {
  return (req, res, next) => {
    applySecurityHeaders(res, options);

    if (typeof next === 'function') {
      next();
    }
  };
}

/**
 * Remove sensitive headers that might leak server info
 * @param {object} res - Response object
 */
function removeSensitiveHeaders(res) {
  // These headers might reveal server implementation details
  const headersToRemove = [
    'X-Powered-By',
    'Server',
  ];

  headersToRemove.forEach(header => {
    res.removeHeader(header);
  });
}

module.exports = {
  SECURITY_HEADERS,
  CSP_POLICY,
  applySecurityHeaders,
  securityHeadersMiddleware,
  removeSensitiveHeaders,
};
