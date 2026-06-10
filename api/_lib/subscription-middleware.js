/**
 * Subscription Middleware
 *
 * Protects API routes with subscription checks and feature gating.
 * Verifies that users have active subscriptions and access to specific features.
 */

const { getSubscriptionByEmail, supabaseAdmin } = require('./supabase');
const { hasFeature, checkReservationLimit, getUpgradeMessage } = require('../_services/subscription-limits');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('SubscriptionMiddleware');

const UPGRADE_URL = `${process.env.CLIENT_URL || 'https://seatable.one'}/precos`;

/** Grace period (in ms) after subscription expiry before hard-blocking */
const SOFT_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get the count of reservations for the current month
 * @param {string} restaurantId - Restaurant ID for multi-tenancy
 * @param {string} customerEmail - Customer email to count reservations for
 * @returns {Promise<number>} Count of reservations this month
 */
async function getMonthlyReservationCount(restaurantId, customerEmail) {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  let query = supabaseAdmin
    .from('reservations')
    .select('*', { count: 'exact', head: true })
    .gte('date', firstDayOfMonth)
    .lte('date', lastDayOfMonth)
    .in('status', ['Confirmed', 'Seated', 'Completed']);

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { count, error } = await query;

  if (error) {
    logger.error('[SubscriptionMiddleware] Error counting reservations:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Middleware to check if user has an active subscription
 *
 * Expects user info in req.body.customer_email or req.query.customer_email
 * For production, this should be integrated with your authentication system
 */
async function checkSubscription(req, res, next) {
  try {
    // Get restaurant ID from authenticated user for multi-tenancy
    const restaurantId = req.user?.restaurant_id;
    let customerEmail = req.user?.email || req.body?.customer_email || req.query?.customer_email || req.headers?.['x-customer-email'];

    // Look up subscription by restaurant_id first (covers all team members),
    // then fall back to email-based lookup for backwards compatibility
    let result;
    if (restaurantId) {
      result = await checkSubscriptionByRestaurantId(restaurantId);
      // Wrap in expected format
      if (result.active) {
        result = { success: true, subscription: { status: result.status || 'active', plan_name: result.plan, restaurant_id: restaurantId } };
      } else {
        result = { success: false };
      }
    }

    if (!result?.success) {
      if (customerEmail) {
        result = await getSubscriptionByEmail(restaurantId, customerEmail);
      }
    }

    if (!result) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!result.success) {
      return res.status(403).json({
        error: 'No active subscription',
        message: 'Please subscribe to access this feature',
        upgrade_url: `${process.env.CLIENT_URL || 'https://seatable.one'}/precos`
      });
    }

    const subscription = result.subscription;

    // Check if subscription is active or in trial
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(403).json({
        error: 'Subscription inactive',
        message: `Your subscription is ${subscription.status}. Please update your payment method.`,
        status: subscription.status,
        upgrade_url: `${process.env.CLIENT_URL || 'https://seatable.one'}/precos`
      });
    }

    // Attach subscription to request for use in route handlers
    req.subscription = subscription;
    req.customerEmail = customerEmail;

    next();
  } catch (error) {
    logger.error('Subscription middleware error:', error);
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
        upgrade_url: `${process.env.CLIENT_URL || 'https://seatable.one'}/precos`
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

    // Scale plan has unlimited reservations
    if (plan === 'scale') {
      return next();
    }

    // For Starter and Growth plans, check monthly reservation count
    const restaurantId = req.user?.restaurant_id;
    const currentMonthReservations = await getMonthlyReservationCount(restaurantId, req.customerEmail);

    const limitCheck = checkReservationLimit(plan, currentMonthReservations);

    // Attach limit info to request
    req.reservationLimit = limitCheck;

    if (!limitCheck.allowed) {
      // T.1 Grace-window enforcement.
      //
      // Previously: always soft-billed overage — the request was let
      // through with isOverage=true, and the customer found out at the
      // next invoice. After a downgrade this meant the customer kept
      // the higher-plan usage forever, defeating the purpose of
      // choosing a smaller plan.
      //
      // Now: if there's no downgrade in flight (or grace hasn't started)
      // we still soft-bill (status quo for organic growth past the
      // limit). But if downgrade_grace_until has PASSED, we hard-block
      // — they downgraded, the grace period gave them the rest of the
      // current cycle, and now the new plan's limit is binding.
      const grace = req.subscription.downgrade_grace_until;
      const graceActive = grace && new Date(grace).getTime() > Date.now();
      if (grace && !graceActive) {
        // Grace has expired and we're still over the new plan's limit.
        return res.status(402).json({
          error: 'Plan limit reached',
          message: `Your ${plan} plan allows ${limitCheck.limit} reservations per month and you've reached the limit. Upgrade or wait for the next billing period.`,
          plan,
          limit: limitCheck.limit,
          used: currentMonthReservations,
          upgrade_url: `${process.env.CLIENT_URL || 'https://seatable.one'}/precos`,
          metric: 'limit_blocked_post_downgrade',
        });
      }
      // Soft limit: allow overage but flag it for billing.
      req.isOverage = true;
      req.overageCount = currentMonthReservations - limitCheck.limit + 1;
      req.overagePlan = plan;
    }

    next();
  } catch (error) {
    logger.error('Reservation limit check error:', error);
    return res.status(500).json({
      error: 'Limit check failed',
      message: 'Unable to verify reservation limits'
    });
  }
}

/**
 * Check if a restaurant is a demo restaurant (is_demo flag in restaurant_config).
 * Demo restaurants always bypass subscription checks.
 *
 * @param {string} restaurantId
 * @returns {Promise<boolean>}
 */
async function isDemoRestaurant(restaurantId) {
  if (!restaurantId || !supabaseAdmin) return false;
  try {
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('is_demo')
      .eq('id', restaurantId)
      .single();
    if (error) return false;
    return data?.is_demo === true;
  } catch {
    return false;
  }
}

/**
 * Look up subscription by restaurant_id (not email).
 * Queries the subscriptions table directly, then falls back to
 * restaurant_config.metric_profile.plan.
 *
 * @param {string} restaurantId
 * @returns {Promise<{active: boolean, plan: string, status: string, subscription?: object}>}
 */
async function checkSubscriptionByRestaurantId(restaurantId) {
  if (!restaurantId) {
    return { active: false, plan: null, status: 'missing_restaurant_id' };
  }

  // Demo restaurants always pass
  if (await isDemoRestaurant(restaurantId)) {
    return { active: true, plan: 'demo', status: 'demo' };
  }

  try {
    // 1. Check subscriptions table
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, restaurant_id, plan_name, status, subscription_id, customer_id, trial_end, current_period_end, canceled_at, downgrade_grace_until, created_at, updated_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!subError && subscriptions && subscriptions.length > 0) {
      const sub = subscriptions[0];
      const status = sub.status;
      const plan = sub.plan_name;

      if (status === 'active' || status === 'trialing') {
        return { active: true, plan, status, subscription: sub };
      }
      if (status === 'past_due') {
        return { active: true, plan, status, warning: 'past_due', subscription: sub };
      }
      // canceled or other terminal status
      return { active: false, plan, status, subscription: sub };
    }

    // 2. Fallback: restaurant_config.metric_profile.plan
    const { data: config, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, metric_profile')
      .eq('id', restaurantId)
      .single();

    if (!configError && config?.metric_profile?.plan) {
      return {
        active: true,
        plan: config.metric_profile.plan,
        status: 'active',
        subscription: {
          plan_name: config.metric_profile.plan,
          status: 'active',
          subscription_id: 'onboarding-plan',
        },
      };
    }

    // No subscription found
    return { active: false, plan: null, status: 'no_subscription' };
  } catch (error) {
    logger.error('checkSubscriptionByRestaurantId error:', { restaurantId, error: error.message });
    // Fail open to avoid blocking restaurants during transient DB errors
    return { active: true, plan: 'unknown', status: 'error_fallback' };
  }
}

/**
 * Inline subscription check for use in serverless endpoints.
 * Returns null if the request should proceed, or sends an error response and returns true.
 *
 * Pattern: `const blocked = await inlineCheckSubscription(restaurantId, res); if (blocked) return;`
 *
 * @param {string} restaurantId
 * @param {object} res - Express response object
 * @returns {Promise<boolean>} true if blocked (response already sent), false if allowed
 */
async function inlineCheckSubscription(restaurantId, res) {
  const result = await checkSubscriptionByRestaurantId(restaurantId);

  if (result.active) {
    // If past_due, set a warning header but allow
    if (result.warning === 'past_due') {
      res.setHeader('X-Subscription-Warning', 'past_due');
    }
    return false; // not blocked
  }

  res.status(403).json({
    error: 'Subscription required',
    message: result.status === 'canceled'
      ? 'Your subscription has been canceled. Please resubscribe to continue.'
      : 'No active subscription found. Please subscribe to access this feature.',
    status: result.status,
    upgrade_url: UPGRADE_URL,
  });
  return true; // blocked
}

/**
 * Soft subscription check with a 7-day grace period after expiry.
 * Designed for critical daily tools (host-dashboard) that should not
 * hard-block immediately when a subscription lapses.
 *
 * - Active/trialing/past_due: allow
 * - Canceled within 7 days: allow + warning header
 * - Canceled > 7 days or no subscription: hard-block
 *
 * Pattern: `const blocked = await softCheckSubscription(restaurantId, res); if (blocked) return;`
 *
 * @param {string} restaurantId
 * @param {object} res - Express response object
 * @returns {Promise<boolean>} true if blocked (response already sent), false if allowed
 */
async function softCheckSubscription(restaurantId, res) {
  const result = await checkSubscriptionByRestaurantId(restaurantId);

  if (result.active) {
    if (result.warning === 'past_due') {
      res.setHeader('X-Subscription-Warning', 'past_due');
    }
    return false; // not blocked
  }

  // Check grace period for canceled subscriptions
  if (result.status === 'canceled' && result.subscription) {
    const canceledAt = result.subscription.canceled_at
      || result.subscription.current_period_end;
    if (canceledAt) {
      const cancelDate = new Date(canceledAt);
      const now = new Date();
      const elapsed = now.getTime() - cancelDate.getTime();
      if (elapsed <= SOFT_GRACE_PERIOD_MS) {
        // Within grace period — allow with warning
        res.setHeader('X-Subscription-Warning', 'expired');
        return false;
      }
    }
  }

  // No subscription or past grace period — hard-block
  res.status(403).json({
    error: 'Subscription required',
    message: 'Your subscription has expired. Please resubscribe to continue using the dashboard.',
    status: result.status,
    upgrade_url: UPGRADE_URL,
  });
  return true;
}

/**
 * Inline feature check. Must be called after inlineCheckSubscription
 * sets req.subscription, or pass subscription directly.
 *
 * @param {string} plan - plan name (lowercase)
 * @param {string} featureName
 * @param {object} res
 * @returns {boolean} true if blocked (response already sent), false if allowed
 */
function inlineRequireFeature(plan, featureName, res) {
  if (!hasFeature(plan, featureName)) {
    res.status(403).json({
      error: 'Feature not available',
      message: getUpgradeMessage(featureName, plan),
      feature: featureName,
      current_plan: plan,
      upgrade_url: UPGRADE_URL,
    });
    return true; // blocked
  }
  return false; // allowed
}

module.exports = {
  checkSubscription,
  requireFeature,
  checkReservationLimits,
  checkSubscriptionByRestaurantId,
  isDemoRestaurant,
  inlineCheckSubscription,
  softCheckSubscription,
  inlineRequireFeature,
  hasFeature, // side-effect-free check for endpoints that want to soft-degrade
};
