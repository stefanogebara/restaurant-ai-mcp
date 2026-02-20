/**
 * Supabase Database Service Layer — Barrel Re-export
 *
 * This file preserves backwards compatibility for all existing importers.
 * The actual implementation has been split into domain modules:
 *
 *   db-clients.js         – Supabase client setup & helpers
 *   db-reservations.js    – Reservation CRUD & helpers
 *   db-tables.js          – Table CRUD, floor plan, combinations
 *   db-service-records.js – Active dining session management
 *   db-subscriptions.js   – Restaurant info & Stripe subscriptions
 *   db-waitlist.js        – Waitlist management
 *
 * MULTI-TENANCY: All operational queries are scoped by restaurant_id.
 */

const clients = require('./db-clients');
const reservations = require('./db-reservations');
const tables = require('./db-tables');
const serviceRecords = require('./db-service-records');
const subscriptions = require('./db-subscriptions');
const waitlist = require('./db-waitlist');
const { generateSecureReservationId, generateSecureServiceId } = require('./secure-id');

module.exports = {
  // Supabase clients
  query: clients.supabase,              // Primary client (admin) – backwards compatible
  supabaseAdmin: clients.supabaseAdmin, // Explicit admin client (bypasses RLS)
  supabaseClient: clients.supabaseClient, // Anon-key client (respects RLS)
  createAuthClient: clients.createAuthClient, // Factory: per-request client with user JWT

  // Reservations
  ...reservations,

  // Tables
  ...tables,

  // Service Records
  ...serviceRecords,

  // Restaurant Info & Subscriptions
  ...subscriptions,

  // Waitlist
  ...waitlist,

  // Utilities
  generateReservationId: generateSecureReservationId,
  generateServiceId: generateSecureServiceId,
};
