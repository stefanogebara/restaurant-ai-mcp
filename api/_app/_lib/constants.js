/**
 * Business Constants
 *
 * Centralized configuration for business rules and default values.
 * These can be overridden by restaurant-specific settings.
 */

// ============ TIMING DEFAULTS ============

/**
 * Default dining duration in minutes
 * Used for estimating departure times when seating parties
 */
const DEFAULT_DINING_DURATION_MINUTES = 90;

/**
 * Dashboard polling interval in milliseconds
 */
const DASHBOARD_POLL_INTERVAL_MS = 30000;

/**
 * Dashboard data stale time in milliseconds
 */
const DASHBOARD_STALE_TIME_MS = 25000;

/**
 * Threshold in minutes for marking a reservation as "late"
 */
const LATE_THRESHOLD_MINUTES = 20;

// ============ BUSINESS LIMITS ============

/**
 * Maximum party size allowed for reservations
 */
const MAX_PARTY_SIZE = 20;

/**
 * Maximum days in advance a reservation can be made
 */
const MAX_ADVANCE_BOOKING_DAYS = 90;

/**
 * Free plan monthly reservation limit
 */
const FREE_PLAN_MONTHLY_RESERVATIONS = 30;

/**
 * Starter plan monthly reservation limit
 */
const STARTER_PLAN_MONTHLY_RESERVATIONS = 100;

/**
 * Growth plan monthly reservation limit
 */
const GROWTH_PLAN_MONTHLY_RESERVATIONS = 300;

// ============ HELPER FUNCTIONS ============

/**
 * Get dining duration, optionally from restaurant settings
 * @param {object} restaurantInfo - Restaurant info object with potential custom settings
 * @returns {number} Dining duration in minutes
 */
function getDiningDuration(restaurantInfo = null) {
  // Check for restaurant-specific setting
  if (restaurantInfo?.default_dining_duration) {
    return restaurantInfo.default_dining_duration;
  }

  // Check in metric_profile for custom settings
  if (restaurantInfo?.metric_profile?.default_dining_duration) {
    return restaurantInfo.metric_profile.default_dining_duration;
  }

  return DEFAULT_DINING_DURATION_MINUTES;
}

module.exports = {
  // Timing
  DEFAULT_DINING_DURATION_MINUTES,
  DASHBOARD_POLL_INTERVAL_MS,
  DASHBOARD_STALE_TIME_MS,
  LATE_THRESHOLD_MINUTES,

  // Business limits
  MAX_PARTY_SIZE,
  MAX_ADVANCE_BOOKING_DAYS,
  FREE_PLAN_MONTHLY_RESERVATIONS,
  STARTER_PLAN_MONTHLY_RESERVATIONS,
  GROWTH_PLAN_MONTHLY_RESERVATIONS,

  // Helper functions
  getDiningDuration,
};
