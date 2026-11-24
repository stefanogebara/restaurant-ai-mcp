/**
 * Get Subscription Status API
 *
 * Returns the current user's subscription details for frontend use
 */

const { getSubscriptionByEmail } = require('./_lib/supabase');
const { checkSubscriptionByRestaurantId } = require('./_lib/subscription-middleware');
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

    // Get customer email from JWT (never from URL — avoids PII in logs).
    // We don't *filter by* email anymore (see below), but we still require
    // it as a basic auth-completeness check.
    const customerEmail = req.user.email;

    if (!customerEmail) {
      return res.status(400).json({
        error: 'Missing email',
        message: 'User email not found in auth token'
      });
    }

    // Primary lookup: by restaurant_id — matches what the plan-gate
    // middleware (inlineCheckSubscription / softCheckSubscription) uses, so
    // sidebar gating and API gating stay consistent. Email-based lookup
    // (the original implementation) broke down in two real cases:
    //   1) Stripe customer email != JWT email — Gmail strips '+alias' tags
    //      when normalising customer email at Checkout, so a user logged in
    //      as foo+test@gmail.com couldn't see their own foo@gmail.com sub.
    //   2) Team members — a second user on the same restaurant_id has a
    //      different email from the subscription owner, but should still
    //      see the team's active plan.
    // Audit note: a previous version added an email-based fallback "for
    // legacy paths where the JWT doesn't carry restaurant_id". It was dead
    // code — getSubscriptionByEmail always filters by .eq('restaurant_id',
    // restaurantId) internally, so a missing restaurant_id returns zero
    // rows from that path too. If the JWT genuinely has no restaurant_id
    // (truly unconfigured / pre-onboarding user), the correct response is
    // has_subscription: false — they don't have a subscription because
    // they don't have a restaurant yet.
    let result;
    if (restaurantId) {
      const rs = await checkSubscriptionByRestaurantId(restaurantId);
      if (rs.active && rs.subscription) {
        result = { success: true, subscription: rs.subscription };
      } else if (customerEmail) {
        // Restaurant exists but the primary lookup returned nothing active.
        // Try the email path with restaurant_id scoped — covers the rare
        // case of an inactive/canceled row that the gate middleware
        // ignores but the user-facing status display wants to surface.
        const er = await getSubscriptionByEmail(restaurantId, customerEmail);
        if (er.success) {
          result = { success: true, subscription: er.subscription };
        }
      }
    }

    if (!result?.success) {
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
