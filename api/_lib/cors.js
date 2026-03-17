/**
 * CORS Configuration Utility
 *
 * Provides secure CORS handling for different endpoint types:
 * - Internal endpoints: Restricted to CLIENT_URL only
 * - External webhooks: Allow specific trusted origins (ElevenLabs, Stripe, Twilio)
 */

const { addRequestId } = require('./request-id');

const ALLOWED_ORIGINS = [
  'https://seatable.one',
  process.env.CLIENT_URL,
  // Only allow localhost in development
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8086',
  ] : [])
].filter(Boolean);

// Trusted webhook origins (these services call our webhooks)
const WEBHOOK_ORIGINS = [
  'https://api.elevenlabs.io',
  'https://api.stripe.com',
  'https://api.twilio.com',
];

/**
 * Set CORS headers for internal API endpoints
 * Only allows requests from trusted client origins
 */
function setInternalCors(req, res) {
  addRequestId(req, res);
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    // Allow same-origin requests (no origin header) and server-to-server
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Customer-Email, x-request-id');
}

/**
 * Set CORS headers for external webhook endpoints
 * These need to accept requests from third-party services
 */
function setWebhookCors(req, res) {
  addRequestId(req, res);
  const origin = req.headers.origin;

  // For webhooks, we need to be more permissive since services like ElevenLabs
  // may not send an origin header, or may send from various subdomains.
  // SEC-H5: Use exact origin match instead of substring includes() to prevent
  // a spoofed origin like "https://evil.com?x=https://api.elevenlabs.io" from matching.
  if (origin && (ALLOWED_ORIGINS.includes(origin) || WEBHOOK_ORIGINS.some(wo => origin === wo))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    // Server-to-server webhooks (no origin header) — use default allowed origin
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  // Unknown browser origins get no CORS header (request will be blocked)

  // Webhooks are server-to-server — credentials are not applicable
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Called-Number, X-Caller-Number, Stripe-Signature, X-Twilio-Signature, x-request-id');
}

/**
 * Handle OPTIONS preflight request
 * @returns {boolean} true if this was a preflight request that was handled
 */
function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = {
  setInternalCors,
  setWebhookCors,
  handlePreflight,
  ALLOWED_ORIGINS
};
