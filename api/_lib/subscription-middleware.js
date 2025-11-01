/**
 * Subscription Middleware
 *
 * Protects API routes with subscription checks and feature gating.
 * Verifies that users have active subscriptions and access to specific features.
 */

const { getSubscriptionByEmail } = require('./airtable');
const { hasFeature, checkReservationLimit, getUpgradeMessage } = require('../services/subscription-limits');

/**
 * Middleware to check if user has an active subscription
 *
 * Expects user info in req.body.customer_email or req.query.customer_email
 * For production, this should be integrated with your authentication system
 */
async function checkSubscription(req, res, next) {
  try {
    // Get customer email from request (adjust based on your auth system)
    const customerEmail = req.body?.customer_email || req.query?.customer_email || req.headers?.['x-customer-email'];

    if (!customerEmail) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Customer email not provided',
        upgrade_url: `${process.env.CLIENT_URL || 'http://localhost:8086'}/#pricing`
      });
    }

    // Get subscription from database
    const result = await getSubscriptionByEmail(customerEmail);

    if (!result.success) {
      return res.status(403).json({
        error: 'No active subscription',
        message: 'Please subscribe to access this feature',
        upgrade_url: `${process.env.CLIENT_URL || 'http://localhost:8086'}/#pricing`
      });
    }

    const subscription = result.subscription;

    // Check if subscription is active or in trial
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(403).json({
        error: 'Subscription inactive',
        message: `Your subscription is ${subscription.status}. Please update your payment method.`,
        status: subscription.status,
        upgrade_url: `${process.env.CLIENT_URL || 'http://localhost:8086'}/#pricing`
      });
    }

    // Attach subscription to request for use in route handlers
    req.subscription = subscription;
    req.customerEmail = customerEmail;

    next();
  } catch (error) {
    console.error('Subscription middleware error:', error);
    return res.status(500).json({
      error: 'Subscription check failed',
      message: 'Unable to verify subscription status'
    });
  }
}

/**
 * Middleware factory to check if user has access to a specific feature
 *
 * Usage: router.get('/advanced-analytics', requireFeature('advanced_analytics'), handler)
 */
function requireFeature(featureName) {
  return (req, res, next) => {
    // Ensure checkSubscription ran first
    if (!req.subscription) {
      return res.status(500).json({
        error: 'Internal error',
        message: 'Subscription middleware must run before feature check'
      });
    }

    const plan = req.subscription.plan_name?.toLowerCase();

    if (!hasFeature(plan, featureName)) {
      return res.status(403).json({
        error: 'Feature not available',
        message: getUpgradeMessage(featureName, plan),
        feature: featureName,
        current_plan: plan,
        upgrade_url: `${process.env.CLIENT_URL || 'http://localhost:8086'}/#pricing`
      });
    }

    next();
  };
}

/**
 * Middleware to check reservation limits for Basic plan users
 *
 * Usage: router.post('/reservations', checkReservationLimits, handler)
 */
async function checkReservationLimits(req, res, next) {
  try {
    // Ensure checkSubscription ran first
    if (!req.subscription) {
      return res.status(500).json({
        error: 'Internal error',
        message: 'Subscription middleware must run before reservation limit check'
      });
    }

    const plan = req.subscription.plan_name?.toLowerCase();

    // Professional and Enterprise have unlimited reservations
    if (plan === 'professional' || plan === 'enterprise') {
      return next();
    }

    // For Basic plan, check monthly reservation count
    // TODO: Implement actual monthly reservation count query
    // For now, we'll allow all reservations
    const currentMonthReservations = 0; // Placeholder

    const limitCheck = checkReservationLimit(plan, currentMonthReservations);

    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Reservation limit reached',
        message: `You've reached your monthly limit of ${limitCheck.limit} reservations.`,
        limit: limitCheck.limit,
        current: limitCheck.current,
        upgrade_url: `${process.env.CLIENT_URL || 'http://localhost:8086'}/#pricing`
      });
    }

    // Attach limit info to request
    req.reservationLimit = limitCheck;

    next();
  } catch (error) {
    console.error('Reservation limit check error:', error);
    return res.status(500).json({
      error: 'Limit check failed',
      message: 'Unable to verify reservation limits'
    });
  }
}

module.exports = {
  checkSubscription,
  requireFeature,
  checkReservationLimits
};
