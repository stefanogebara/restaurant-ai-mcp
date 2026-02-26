/**
 * Frontend Constants
 *
 * Centralized configuration for timing, polling, and business rules.
 */

// ============ DASHBOARD TIMING ============

/**
 * Dashboard polling interval in milliseconds
 * How often the dashboard fetches fresh data from the server
 */
export const DASHBOARD_POLL_INTERVAL = 30000; // 30 seconds

/**
 * Dashboard data stale time in milliseconds
 * How long to consider cached data "fresh" before refetching
 */
export const DASHBOARD_STALE_TIME = 25000; // 25 seconds

// ============ POLLING INTERVALS ============

/** Analytics queries — refetch every 5 min, stale after 4 min */
export const ANALYTICS_POLL_INTERVAL = 5 * 60 * 1000;
export const ANALYTICS_STALE_TIME = 4 * 60 * 1000;

/** Subscription & usage stats — refetch every 10 min */
export const SUBSCRIPTION_POLL_INTERVAL = 10 * 60 * 1000;

/** General settings stale time (voice, whatsapp, referral, etc.) */
export const SETTINGS_STALE_TIME = 5 * 60 * 1000;

/** Waitlist — refetch every 2 min */
export const WAITLIST_POLL_INTERVAL = 2 * 60 * 1000;

/** LTV / DNA dashboard — refresh every 5 min */
export const LTV_POLL_INTERVAL = 5 * 60 * 1000;

// ============ BUSINESS LIMITS ============

/**
 * Maximum party size for reservations
 */
export const MAX_PARTY_SIZE = 20;

/**
 * Maximum days in advance for bookings
 */
export const MAX_ADVANCE_BOOKING_DAYS = 90;

/**
 * Default dining duration in minutes
 */
export const DEFAULT_DINING_DURATION = 90;

/**
 * Threshold in minutes before a reservation is considered "late"
 */
export const LATE_THRESHOLD_MINUTES = 20;
