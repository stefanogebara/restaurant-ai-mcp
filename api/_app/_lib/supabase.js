/**
 * Supabase Database Service Layer — Barrel Re-export
 *
 * All functions have been split into focused modules under ./db/.
 * This file re-exports everything for backwards compatibility so that
 * existing `require('./_lib/supabase')` calls continue to work unchanged.
 *
 * MULTI-TENANCY: All operational queries are scoped by restaurant_id.
 * Every function that touches reservations, tables, waitlist,
 * service_records, or subscriptions requires a restaurantId parameter.
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

const clients = require('./db/clients');
const reservations = require('./db/reservations');
const tables = require('./db/tables');
const waitlist = require('./db/waitlist');
const serviceRecords = require('./db/service-records');
const subscriptions = require('./db/subscriptions');
const restaurant = require('./db/restaurant');
const team = require('./db/team');

module.exports = {
  // Supabase clients
  query: clients.supabase,       // Primary client (admin) – backwards compatible
  supabaseAdmin: clients.supabaseAdmin,
  supabaseClient: clients.supabaseClient,
  createAuthClient: clients.createAuthClient,

  // Reservations
  ...reservations,

  // Tables
  ...tables,

  // Waitlist
  ...waitlist,

  // Service Records
  ...serviceRecords,

  // Restaurant Info
  ...restaurant,

  // Subscriptions
  ...subscriptions,

  // Team Members
  ...team,

  // Utilities (from clients)
  withRetry: clients.withRetry,
};
