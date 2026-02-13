/**
 * Subscription Plan Limits and Features
 *
 * Defines what features and limits each subscription tier has access to.
 * Used for feature gating in middleware and frontend.
 */

const { BASIC_PLAN_MONTHLY_RESERVATIONS } = require('../_lib/constants');

const PLAN_LIMITS = {
  basic: {
    name: 'Basic',
    maxReservationsPerMonth: BASIC_PLAN_MONTHLY_RESERVATIONS,
    features: [
      'ai_reservations',
      'host_dashboard',
      'basic_analytics',
      'email_support',
    ],
    analyticsLevel: 'basic',
    smsNotifications: false,
    waitlistManagement: false,
    multiLocation: false,
    customIntegrations: false,
    whiteLabel: false,
    phoneSupport: false,
  },
  professional: {
    name: 'Professional',
    maxReservationsPerMonth: -1, // unlimited
    features: [
      'ai_reservations',
      'host_dashboard',
      'basic_analytics',
      'advanced_analytics',
      'waitlist_management',
      'priority_support',
      'sms_notifications',
      'email_support',
    ],
    analyticsLevel: 'advanced',
    smsNotifications: true,
    waitlistManagement: true,
    multiLocation: false,
    customIntegrations: false,
    whiteLabel: false,
    phoneSupport: false,
  },
  enterprise: {
    name: 'Enterprise',
    maxReservationsPerMonth: -1, // unlimited
    features: [
      'ai_reservations',
      'host_dashboard',
      'basic_analytics',
      'advanced_analytics',
      'waitlist_management',
      'priority_support',
      'sms_notifications',
      'email_support',
      'multi_location',
      'custom_integrations',
      'white_label',
      'phone_support',
      'dedicated_account_manager',
      'sla_guarantee',
    ],
    analyticsLevel: 'enterprise',
    smsNotifications: true,
    waitlistManagement: true,
    multiLocation: true,
    customIntegrations: true,
    whiteLabel: true,
    phoneSupport: true,
  },
};

// Map Stripe price IDs to plan names
const PRICE_ID_TO_PLAN = {
  'price_1SMyEOKf4yCMjmH5kXx1RUyo': 'basic',       // Basic plan
  'price_1SMyFUKf4yCMjmH5jh4mReyI': 'professional', // Professional plan
  'price_1SMyHPKf4yCMjmH5t2Jig9cU': 'enterprise',   // Enterprise plan
};

/**
 * Metered usage pricing configuration.
 *
 * Each metric type maps to an env var holding the Stripe metered price ID.
 * These prices should be created in Stripe as "metered" recurring prices
 * with "sum of usage during period" aggregation.
 *
 * To enable metered billing:
 * 1. Create metered prices in Stripe Dashboard (Products → Add price → Recurring → Metered)
 * 2. Set the corresponding env vars on Vercel
 * 3. The checkout session will automatically include them as line items
 * 4. Daily cron at /api/report-usage reports accumulated usage to Stripe
 *
 * Env vars:
 *   STRIPE_METERED_PRICE_RESERVATION  - Charged per reservation (any source)
 *   STRIPE_METERED_PRICE_AI_CALL      - Charged per AI phone call completed
 *   STRIPE_METERED_PRICE_SMS          - Charged per SMS sent
 *   STRIPE_METERED_PRICE_WHATSAPP     - Charged per WhatsApp reservation (overrides general)
 */
const METERED_PRICING = {
  reservation_created: { envVar: 'STRIPE_METERED_PRICE_RESERVATION', label: 'Reservation' },
  portal_booking: { envVar: 'STRIPE_METERED_PRICE_RESERVATION', label: 'Portal Booking' },
  whatsapp_reservation: { envVar: 'STRIPE_METERED_PRICE_WHATSAPP', label: 'WhatsApp Reservation', fallback: 'STRIPE_METERED_PRICE_RESERVATION' },
  ai_call_completed: { envVar: 'STRIPE_METERED_PRICE_AI_CALL', label: 'AI Call' },
  sms_sent: { envVar: 'STRIPE_METERED_PRICE_SMS', label: 'SMS Sent' },
};

/**
 * Get plan details by plan name
 */
function getPlanLimits(planName) {
  const plan = planName?.toLowerCase();
  return PLAN_LIMITS[plan] || null;
}

/**
 * Get plan name from Stripe price ID
 */
function getPlanFromPriceId(priceId) {
  return PRICE_ID_TO_PLAN[priceId] || null;
}

/**
 * Check if a plan has access to a specific feature
 */
function hasFeature(planName, featureName) {
  const limits = getPlanLimits(planName);
  if (!limits) return false;
  return limits.features.includes(featureName);
}

/**
 * Check if plan has reservation limit and if limit is exceeded
 */
function checkReservationLimit(planName, currentMonthReservations) {
  const limits = getPlanLimits(planName);
  if (!limits) return { allowed: false, limit: 0, current: 0 };

  // Unlimited reservations
  if (limits.maxReservationsPerMonth === -1) {
    return { allowed: true, limit: -1, current: currentMonthReservations };
  }

  // Check if limit exceeded
  const allowed = currentMonthReservations < limits.maxReservationsPerMonth;
  return {
    allowed,
    limit: limits.maxReservationsPerMonth,
    current: currentMonthReservations,
  };
}

/**
 * Get upgrade message for a feature
 */
function getUpgradeMessage(featureName, currentPlan) {
  const featureMessages = {
    advanced_analytics: 'Advanced analytics with detailed insights and trends',
    waitlist_management: 'Smart waitlist management with automated notifications',
    sms_notifications: 'SMS notifications for reservations and table readiness',
    multi_location: 'Manage multiple restaurant locations from one dashboard',
    custom_integrations: 'Custom API integrations with your existing systems',
    white_label: 'White-label the platform with your restaurant branding',
    phone_support: '24/7 phone support for immediate assistance',
  };

  const message = featureMessages[featureName] || 'This premium feature';
  return `${message} is available on Professional and Enterprise plans.`;
}

module.exports = {
  PLAN_LIMITS,
  PRICE_ID_TO_PLAN,
  METERED_PRICING,
  getPlanLimits,
  getPlanFromPriceId,
  hasFeature,
  checkReservationLimit,
  getUpgradeMessage,
};
