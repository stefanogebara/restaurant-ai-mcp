/**
 * Central Supabase Connection
 *
 * Connects to the central registry database for multi-tenant restaurant routing.
 * By default uses the main Supabase project, but can be configured to use a
 * separate project via CENTRAL_SUPABASE_URL and CENTRAL_SUPABASE_SERVICE_ROLE_KEY.
 *
 * NOTE: Candidate for removal. See multi-tenant-supabase.js for details.
 * Currently always resolves to the main SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.
 * Imported by: multi-tenant-supabase.js, restaurant-registry.js,
 * whatsapp/reservation-lookup.js, whatsapp/quick-actions.js, whatsapp-sessions.js.
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

const centralSupabase = centralUrl && centralKey
  ? createClient(centralUrl, centralKey)
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
