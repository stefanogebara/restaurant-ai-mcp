/**
 * Supabase Client Setup & Helpers
 *
 * Provides the Supabase clients and shared utility functions
 * used by all domain modules (reservations, tables, etc.).
 *
 * CLIENT SPLIT:
 *   supabaseAdmin  – SERVICE_ROLE_KEY, bypasses RLS. Used for webhooks,
 *                    cron jobs, health checks, and cross-tenant admin ops.
 *   supabaseClient – ANON_KEY, respects RLS. Available for future use
 *                    when passing user JWTs for per-request RLS enforcement.
 *   createAuthClient(token) – Factory that returns an anon-key client
 *                    with the user's JWT set, enabling RLS enforcement.
 *
 * Current operational functions use supabaseAdmin because they already
 * enforce restaurant_id at the application layer. As the platform matures,
 * these can migrate to per-request auth clients for defense-in-depth.
 */

const { createClient } = require('@supabase/supabase-js');
const { createSecureLogger } = require('./secure-logger');
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

// Admin client – bypasses RLS (for webhooks, crons, health checks, cross-tenant ops)
const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
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

module.exports = {
  supabase,
  supabaseAdmin,
  supabaseClient,
  createAuthClient,
  handleSupabaseResponse,
  logger,
};
