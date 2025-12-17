/**
 * CORS Configuration
 *
 * Provides secure Cross-Origin Resource Sharing configuration
 * with specific allowed origins instead of wildcard (*)
 */

// Allowed origins - add your domains here
const ALLOWED_ORIGINS = [
  // Production domains
  'https://restaurant-ai-mcp.vercel.app',
  'https://seatable.vercel.app',

  // Development domains
  'http://localhost:8086',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:8086',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

// Methods allowed for CORS requests
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// Headers allowed in requests
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'X-Request-ID',
];

// Headers exposed to the client
const EXPOSED_HEADERS = [
  'X-Request-ID',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
];

/**
 * Check if origin is allowed
 * @param {string} origin - Request origin
 * @returns {boolean} Whether origin is allowed
 */
function isOriginAllowed(origin) {
  if (!origin) return false;

  // Check exact match
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  // Check Vercel preview deployments
  if (origin.match(/^https:\/\/restaurant-ai-mcp-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/)) {
    return true;
  }

  // Check Seatable preview deployments
  if (origin.match(/^https:\/\/seatable-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/)) {
    return true;
  }

  return false;
}

/**
 * Get CORS headers for a request
 * @param {string} origin - Request origin
 * @returns {object} CORS headers object
 */
function getCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
    'Access-Control-Expose-Headers': EXPOSED_HEADERS.join(', '),
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true',
  };

  // Only set allowed origin if it's valid
  if (isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

/**
 * CORS middleware for Vercel serverless functions
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @returns {boolean} True if this was a preflight request (OPTIONS)
 */
function corsMiddleware(req, res) {
  const origin = req.headers.origin;
  const corsHeaders = getCorsHeaders(origin);

  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

/**
 * Apply CORS headers directly to response (for manual use)
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const corsHeaders = getCorsHeaders(origin);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

module.exports = {
  ALLOWED_ORIGINS,
  ALLOWED_METHODS,
  ALLOWED_HEADERS,
  isOriginAllowed,
  getCorsHeaders,
  corsMiddleware,
  applyCorsHeaders,
};
