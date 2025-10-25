/**
 * ML Feature Configuration
 *
 * Defines all 23 features used for no-show prediction model.
 * Based on 2024 research showing lead time as #1 predictor.
 *
 * Research citations:
 * - XGBoost achieves 95-99% accuracy for booking cancellation prediction
 * - Lead time is most influential feature across all models
 * - Previous cancellations/no-shows highly predictive
 * - Temporal features (day of week, seasonality) important
 */

const FEATURE_DEFINITIONS = {
  // ============================================================================
  // TEMPORAL FEATURES (7 features)
  // ============================================================================

  booking_lead_time_hours: {
    name: 'booking_lead_time_hours',
    description: 'Hours between booking creation and reservation time',
    type: 'numeric',
    range: [0, Infinity],
    importance: 'CRITICAL',  // Research shows this is #1 predictor
    notes: 'Higher lead time = higher no-show risk. Same-day bookings (<24h) are low risk.'
  },

  hour_of_day: {
    name: 'hour_of_day',
    description: 'Hour of reservation (0-23)',
    type: 'numeric',
    range: [0, 23],
    importance: 'HIGH',
    notes: 'Late reservations (9+ PM) have higher no-show rates'
  },

  day_of_week: {
    name: 'day_of_week',
    description: 'Day of week (0=Sunday, 6=Saturday)',
    type: 'numeric',
    range: [0, 6],
    importance: 'HIGH',
    notes: 'Weekends typically have different no-show patterns than weekdays'
  },

  is_weekend: {
    name: 'is_weekend',
    description: 'Whether reservation is on Friday/Saturday/Sunday',
    type: 'boolean',
    range: [0, 1],
    importance: 'MEDIUM',
    notes: 'Weekend reservations often have different behavior'
  },

  is_prime_time: {
    name: 'is_prime_time',
    description: 'Whether reservation is during peak hours (6-9 PM)',
    type: 'boolean',
    range: [0, 1],
    importance: 'MEDIUM',
    notes: 'Prime time slots may have different no-show rates'
  },

  month_of_year: {
    name: 'month_of_year',
    description: 'Month (1-12)',
    type: 'numeric',
    range: [1, 12],
    importance: 'MEDIUM',
    notes: 'Seasonal patterns (summer vs winter, holidays)'
  },

  days_until_reservation: {
    name: 'days_until_reservation',
    description: 'Days in advance the reservation was made',
    type: 'numeric',
    range: [0, 365],
    importance: 'HIGH',
    notes: 'Similar to lead_time but in days for easier interpretation'
  },

  // ============================================================================
  // CUSTOMER FEATURES (6 features)
  // ============================================================================

  is_repeat_customer: {
    name: 'is_repeat_customer',
    description: 'Has customer visited before',
    type: 'boolean',
    range: [0, 1],
    importance: 'CRITICAL',
    notes: 'Repeat customers 85% less likely to no-show'
  },

  customer_visit_count: {
    name: 'customer_visit_count',
    description: 'Total completed visits by this customer',
    type: 'numeric',
    range: [0, Infinity],
    importance: 'HIGH',
    notes: 'More visits = more reliable customer'
  },

  customer_no_show_rate: {
    name: 'customer_no_show_rate',
    description: 'Historical no-show rate for this customer (0-1)',
    type: 'numeric',
    range: [0, 1],
    importance: 'CRITICAL',
    notes: 'Research shows previous cancellations are top 5 most important features'
  },

  customer_avg_party_size: {
    name: 'customer_avg_party_size',
    description: 'Average party size for this customer',
    type: 'numeric',
    range: [1, 50],
    importance: 'LOW',
    notes: 'May indicate customer type (family vs couple)'
  },

  days_since_last_visit: {
    name: 'days_since_last_visit',
    description: 'Days since customers last completed reservation',
    type: 'numeric',
    range: [0, Infinity],
    importance: 'MEDIUM',
    notes: 'Recent customers more engaged. NULL for new customers = 999'
  },

  customer_lifetime_value: {
    name: 'customer_lifetime_value',
    description: 'Total spend by customer (if tracking)',
    type: 'numeric',
    range: [0, Infinity],
    importance: 'LOW',
    notes: 'High-value customers less likely to no-show. Use 0 if not tracking.'
  },

  // ============================================================================
  // RESERVATION FEATURES (4 features)
  // ============================================================================

  party_size: {
    name: 'party_size',
    description: 'Number of guests',
    type: 'numeric',
    range: [1, 50],
    importance: 'HIGH',
    notes: 'Large parties (6+) have 2.3x higher no-show rates'
  },

  party_size_category: {
    name: 'party_size_category',
    description: 'Small (0), Medium (1), Large (2)',
    type: 'numeric',
    range: [0, 2],
    importance: 'MEDIUM',
    notes: '0=1-2 guests, 1=3-4 guests, 2=5+ guests'
  },

  is_large_party: {
    name: 'is_large_party',
    description: 'Party size >= 6',
    type: 'boolean',
    range: [0, 1],
    importance: 'HIGH',
    notes: 'Research shows large parties significantly higher risk'
  },

  has_special_requests: {
    name: 'has_special_requests',
    description: 'Customer made special requests',
    type: 'boolean',
    range: [0, 1],
    importance: 'MEDIUM',
    notes: 'Research shows special requests correlate with lower no-show (more engagement)'
  },

  // ============================================================================
  // ENGAGEMENT FEATURES (3 features)
  // ============================================================================

  confirmation_sent: {
    name: 'confirmation_sent',
    description: 'Confirmation email/SMS was sent',
    type: 'boolean',
    range: [0, 1],
    importance: 'MEDIUM',
    notes: 'Confirmations reduce no-shows'
  },

  confirmation_clicked: {
    name: 'confirmation_clicked',
    description: 'Customer opened/clicked confirmation',
    type: 'boolean',
    range: [0, 1],
    importance: 'HIGH',
    notes: 'Customers who click confirmations 60% less likely to no-show'
  },

  hours_since_confirmation_sent: {
    name: 'hours_since_confirmation_sent',
    description: 'Hours between confirmation and reservation',
    type: 'numeric',
    range: [0, Infinity],
    importance: 'LOW',
    notes: 'Longer time may indicate less engagement'
  },

  // ============================================================================
  // CALCULATED FEATURES (3 features)
  // ============================================================================

  historical_no_show_rate_for_day: {
    name: 'historical_no_show_rate_for_day',
    description: 'Overall no-show rate for this day of week',
    type: 'numeric',
    range: [0, 1],
    importance: 'MEDIUM',
    notes: 'Some days inherently higher no-show risk'
  },

  historical_no_show_rate_for_time: {
    name: 'historical_no_show_rate_for_time',
    description: 'Overall no-show rate for this time slot',
    type: 'numeric',
    range: [0, 1],
    importance: 'MEDIUM',
    notes: 'Some time slots inherently higher no-show risk'
  },

  occupancy_rate_for_slot: {
    name: 'occupancy_rate_for_slot',
    description: 'How full restaurant typically is at this time',
    type: 'numeric',
    range: [0, 1],
    importance: 'LOW',
    notes: 'May indicate how easy it is to get alternative reservation'
  }
};

// Feature groups for easy access
const FEATURE_GROUPS = {
  temporal: [
    'booking_lead_time_hours',
    'hour_of_day',
    'day_of_week',
    'is_weekend',
    'is_prime_time',
    'month_of_year',
    'days_until_reservation'
  ],
  customer: [
    'is_repeat_customer',
    'customer_visit_count',
    'customer_no_show_rate',
    'customer_avg_party_size',
    'days_since_last_visit',
    'customer_lifetime_value'
  ],
  reservation: [
    'party_size',
    'party_size_category',
    'is_large_party',
    'has_special_requests'
  ],
  engagement: [
    'confirmation_sent',
    'confirmation_clicked',
    'hours_since_confirmation_sent'
  ],
  calculated: [
    'historical_no_show_rate_for_day',
    'historical_no_show_rate_for_time',
    'occupancy_rate_for_slot'
  ]
};

// All feature names in order
const ALL_FEATURES = [
  ...FEATURE_GROUPS.temporal,
  ...FEATURE_GROUPS.customer,
  ...FEATURE_GROUPS.reservation,
  ...FEATURE_GROUPS.engagement,
  ...FEATURE_GROUPS.calculated
];

// Critical features (top 5 most important based on research)
const CRITICAL_FEATURES = [
  'booking_lead_time_hours',      // #1 predictor
  'customer_no_show_rate',         // Previous behavior
  'is_repeat_customer',            // 85% lower no-show
  'party_size',                    // Large parties 2.3x risk
  'confirmation_clicked'           // 60% lower no-show
];

module.exports = {
  FEATURE_DEFINITIONS,
  FEATURE_GROUPS,
  ALL_FEATURES,
  CRITICAL_FEATURES
};
