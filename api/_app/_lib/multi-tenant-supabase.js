/**
 * Multi-Tenant Supabase — Thin Shim (deprecated).
 *
 * All restaurants share the central Supabase project, so there is no actual
 * per-restaurant client. Production code now uses supabaseAdmin directly.
 *
 * This file exists only so the jest mocks in api/__tests__/*.test.js still
 * resolve the module path. New code should NOT import this — use supabaseAdmin
 * from ./supabase directly.
 */

const { supabaseAdmin } = require('./supabase');

function getRestaurantClient(_restaurant) {
  return supabaseAdmin;
}

module.exports = {
  getRestaurantClient,
  getMultiTenantClient: getRestaurantClient,
};
