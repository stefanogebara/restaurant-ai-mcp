/**
 * Central Supabase Connection
 *
 * Connects to the central registry database for multi-tenant restaurant routing.
 * By default uses the main Supabase project, but can be configured to use a
 * separate project via CENTRAL_SUPABASE_URL and CENTRAL_SUPABASE_SERVICE_ROLE_KEY.
 *
 * NOTE: Thin wrapper over the main Supabase project. Historically this was
 * intended to back a separate central registry DB, but all restaurants share
 * the same project now. Candidate for consolidation into ./supabase in a
 * future cleanup — its only real value is the 28s fetchWithTimeout wrapper
 * (supabase-js has no default timeout, so cold Lambdas would hang indefinitely).
 */

const { createClient } = require('@supabase/supabase-js');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('CentralSupabase');

// Use dedicated central DB if configured, otherwise fall back to main Supabase
const centralUrl = process.env.CENTRAL_SUPABASE_URL || process.env.SUPABASE_URL;
const centralKey = process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!centralUrl || !centralKey) {
  logger.warn('WARNING: Missing Supabase credentials for central registry');
}

// Wrap fetch with a 10s AbortController timeout so Supabase queries never hang
// indefinitely inside Vercel Lambdas (supabase-js has no default fetch timeout).
function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 28_000);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

const centralSupabase = centralUrl && centralKey
  ? createClient(centralUrl, centralKey, { global: { fetch: fetchWithTimeout } })
  : null;

/**
 * Check if central Supabase is properly configured
 * @returns {boolean} True if central connection is available
 */
function isCentralConfigured() {
  return centralSupabase !== null;
}

module.exports = {
  centralSupabase,
  isCentralConfigured
};
