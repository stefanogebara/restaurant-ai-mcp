/**
 * Get Subscription Status API
 *
 * Returns the current user's subscription details for frontend use
 */

const { getSubscriptionByEmail } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('SubscriptionStatus');

module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'subscription_status', 60, 60);
  if (rateLimited) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  req.user = auth.user;

  try {
    const restaurantId = req.user.restaurant_id;

    // Get customer email from JWT (never from URL — avoids PII in logs)
    const customerEmail = req.user.email;

    if (!customerEmail) {
      return res.status(400).json({
        error: 'Missing email',
        message: 'User email not found in auth token'
      });
    }

    // Get subscription from database
    const result = await getSubscriptionByEmail(restaurantId, customerEmail);

    if (!result.success) {
      return res.status(200).json({
        has_subscription: false
      });
    }

    const subscription = result.subscription;

    // Return subscription details
    return res.status(200).json({
      has_subscription: true,
      subscription: {
        plan: subscription.plan_name,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        trial_end: subscription.trial_end,
        is_active: subscription.status === 'active' || subscription.status === 'trialing',
        is_trial: subscription.status === 'trialing'
      }
    });
  } catch (error) {
    logger.error('Error fetching subscription status:', error);
    return res.status(500).json({
      error: 'Failed to fetch subscription status',
      message: error.message
    });
  }
};
