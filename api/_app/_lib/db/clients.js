/**
 * Supabase Client Initialization
 * Extracted from supabase.js — provides DB clients and shared helpers.
 */

const { createClient } = require('@supabase/supabase-js');
const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('Supabase');

// ============ SUPABASE CLIENTS ============

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  logger.error('[Supabase] CRITICAL: Missing SUPABASE_URL');
}
if (!serviceRoleKey) {
  logger.error('[Supabase] WARNING: Missing SUPABASE_SERVICE_ROLE_KEY. Admin operations will fail.');
}
if (!anonKey) {
  logger.error('[Supabase] WARNING: Missing SUPABASE_ANON_KEY. RLS-aware client unavailable.');
}

// supabase-js has no default fetch timeout. On cold Lambdas a slow/hung TLS
// handshake or Supabase response will freeze the function for its full
// maxDuration. 28s matches central-supabase.js and is still under both our
// outer Promise.race (35s) and Lambda budget (120s).
function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 28_000);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

// Admin client – bypasses RLS (for webhooks, crons, health checks, cross-tenant ops)
const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { global: { fetch: fetchWithTimeout } })
  : null;

// Public client – respects RLS (for future per-request auth usage)
const supabaseClient = anonKey
  ? createClient(supabaseUrl, anonKey)
  : null;

/**
 * Create a per-request Supabase client with a user's JWT token.
 * This client respects RLS policies, providing defense-in-depth
 * beyond the application-layer restaurant_id scoping.
 * @param {string} token - User's JWT/access token
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createAuthClient(token) {
  if (!anonKey || !supabaseUrl) {
    throw new Error('Cannot create auth client: missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

// Primary client used by all operational functions.
// Falls back to anon key if service_role is unavailable.
const supabase = supabaseAdmin || supabaseClient;

// ============ HELPER FUNCTIONS ============

const handleSupabaseResponse = (data, error, operation = 'query') => {
  if (error) {
    logger.error(`[Supabase ${operation}] Error:`, error);
    return {
      success: false,
      error: true,
      message: error.message || 'Database operation failed'
    };
  }

  logger.info(`[Supabase ${operation}] Success`);
  return { success: true, data };
};

// ============ RETRY UTILITY ============

const TRANSIENT_PATTERNS = [
  'fetch failed', 'network error', 'timeout', 'econnreset',
  'connection refused', 'service unavailable',
];

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

function isTransient(error) {
  const msg = (error?.message || '').toLowerCase();
  const status = error?.status ?? error?.statusCode;
  return TRANSIENT_PATTERNS.some(p => msg.includes(p))
    || (status != null && TRANSIENT_STATUS_CODES.has(Number(status)));
}

function withRetry(fn, { maxAttempts = 3, baseDelayMs = 500 } = {}) {
  function attempt(n) {
    return Promise.resolve()
      .then(() => fn())
      .catch(err => {
        if (!isTransient(err) || n >= maxAttempts - 1) return Promise.reject(err);
        const delay = baseDelayMs * Math.pow(2, n) + Math.random() * 100;
        logger.warn(`[withRetry] Transient error (attempt ${n + 1}/${maxAttempts}), retrying in ${Math.round(delay)}ms:`, err.message);
        return new Promise(resolve => setTimeout(resolve, delay)).then(() => attempt(n + 1));
      });
  }
  return attempt(0);
}

module.exports = {
  supabase,
  supabaseAdmin,
  supabaseClient,
  createAuthClient,
  handleSupabaseResponse,
  logger,
  withRetry,
};
