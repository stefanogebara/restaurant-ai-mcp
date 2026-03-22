const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { getSubscriptions } = require('./_lib/db-subscriptions');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('GetSubscription');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'get_subscription', 60, 60);
  if (rateLimited) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(200).json({ status: 'none', planName: 'No Plan', planPrice: 'N/A' });
  }

  try {
    // Look up subscription from DB by restaurant_id (no customerId needed from client)
    const result = await getSubscriptions(restaurantId);

    if (!result.success || !result.data.records || result.data.records.length === 0) {
      return res.status(200).json({ status: 'none', planName: 'No Plan', planPrice: 'N/A' });
    }

    const sub = result.data.records[0].fields;
    const customerId = sub['Customer ID'];
    const subscriptionId = sub['Subscription ID'];

    // If we have a real Stripe subscription, fetch live status from Stripe
    if (subscriptionId && subscriptionId !== 'onboarding-plan' && customerId) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const price = stripeSub.items.data[0].price;

        const planMapping = {
          [process.env.STRIPE_STARTER_PRICE_ID]: 'Starter',
          [process.env.STRIPE_GROWTH_PRICE_ID]: 'Growth',
          [process.env.STRIPE_SCALE_PRICE_ID]: 'Scale',
        };

        const response = {
          status: stripeSub.status,
          planName: planMapping[price.id] || sub['Plan Name'] || 'Unknown Plan',
          planPrice: `€${(price.unit_amount / 100).toFixed(2)}/${price.recurring.interval}`,
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000).toLocaleDateString(),
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        };

        if (stripeSub.status === 'trialing' && stripeSub.trial_end) {
          response.trialEnd = new Date(stripeSub.trial_end * 1000).toLocaleDateString();
        }

        return res.status(200).json(response);
      } catch (stripeErr) {
        logger.error('Stripe lookup failed, falling back to DB data:', stripeErr.message);
      }
    }

    // Fallback: return DB data directly
    const planPriceMap = { Starter: 'R$149', Growth: 'R$499', Scale: 'R$999' };
    const planName = sub['Plan Name'] || 'Starter';

    return res.status(200).json({
      status: sub['Status'] || 'active',
      planName,
      planPrice: `${planPriceMap[planName] || '€29'}/month`,
      currentPeriodEnd: sub['Current Period End'] || null,
      cancelAtPeriodEnd: false,
    });
  } catch (error) {
    logger.error('Error fetching subscription:', error);
    return res.status(500).json({
      error: 'Failed to fetch subscription',
      message: 'Something went wrong. Please try again.',
    });
  }
};
