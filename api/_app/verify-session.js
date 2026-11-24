const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const { getSubscriptions } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('VerifySession');

async function loadLocalBilling(restaurantId) {
  try {
    const result = await getSubscriptions(restaurantId);
    if (result.success) return result.data.records;
    logger.warn('Unable to read the local billing projection');
  } catch (error) {
    logger.warn('Unable to read the local billing projection', { code: error?.code });
  }
  return [];
}

function matchesBillingRecord(fields, subscriptionId, customerId) {
  return Boolean(subscriptionId && customerId &&
    fields?.['Subscription ID'] === subscriptionId && fields['Customer ID'] === customerId);
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { restaurant_id: restaurantId, role } = auth.user;
  if (!restaurantId || role !== 'owner') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { session_id: sessionId } = req.query || {};
  if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 255) {
    return res.status(400).json({ error: 'Valid session ID is required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'subscription'],
    });

    const subscription = session.subscription;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionCustomerId = typeof subscription?.customer === 'string'
      ? subscription.customer : subscription?.customer?.id;
    const checkoutRestaurantId = session.metadata?.restaurant_id;
    const subscriptionRestaurantId = subscription?.metadata?.restaurant_id;
    if ((checkoutRestaurantId && checkoutRestaurantId !== restaurantId) ||
        (subscriptionRestaurantId && subscriptionRestaurantId !== restaurantId) ||
        (subscriptionCustomerId && subscriptionCustomerId !== customerId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let localBilling;
    if (!checkoutRestaurantId) {
      // Older Checkout sessions can have a trusted local billing record.
      // The payer's email cannot establish tenant ownership.
      localBilling = await loadLocalBilling(restaurantId);
      if (!localBilling.some(({ fields }) => matchesBillingRecord(fields, subscription?.id, customerId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    if (session.mode !== 'subscription') {
      return res.status(422).json({ error: 'Checkout does not contain a subscription' });
    }
    if (session.status !== 'complete') {
      return res.status(409).json({ error: 'Checkout is not complete', status: session.status });
    }
    if (!['paid', 'no_payment_required'].includes(session.payment_status)) {
      return res.status(402).json({ error: 'Payment not completed', payment_status: session.payment_status });
    }

    if (!subscription?.id || !subscription.status) {
      return res.status(422).json({ error: 'Checkout does not contain a subscription' });
    }

    // Metered add-ons can be in any position. Exactly one configured base
    // plan must match the Checkout items.
    const configuredPlans = Object.entries({
      Starter: process.env.STRIPE_STARTER_PRICE_ID,
      Growth: process.env.STRIPE_GROWTH_PRICE_ID,
      Scale: process.env.STRIPE_SCALE_PRICE_ID,
    }).filter(([, priceId]) => priceId);
    const checkoutPrices = new Set(session.line_items?.data?.map(item => item.price?.id));
    const checkoutPlans = configuredPlans.filter(([, priceId]) => checkoutPrices.has(priceId));
    if (checkoutPlans.length !== 1) {
      return res.status(422).json({ error: 'Unable to identify the checkout plan' });
    }

    const [plan] = checkoutPlans[0];
    const subscriptionPrices = new Set(subscription.items?.data?.map(item => item.price?.id));
    const subscriptionPlans = configuredPlans.filter(([, priceId]) => subscriptionPrices.has(priceId));
    // The dashboard reads the newest restaurant billing row. An older exact
    // match can establish legacy ownership but cannot confirm current access.
    const [current] = localBilling ?? await loadLocalBilling(restaurantId);
    const accessConfirmed = ['active', 'trialing'].includes(subscription.status) &&
      subscriptionPlans.length === 1 && subscriptionPlans[0][0] === plan &&
      matchesBillingRecord(current?.fields, subscription.id, customerId) &&
      current.fields.Status === subscription.status &&
      current.fields['Plan Name']?.toLowerCase() === plan.toLowerCase();

    return res.status(200).json({
      status: session.status,
      payment_status: session.payment_status,
      subscription_status: subscription.status,
      is_trial: subscription.status === 'trialing',
      plan,
      access_confirmed: accessConfirmed,
    });
  } catch (error) {
    if (error?.code === 'resource_missing') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error('Error verifying checkout session', { code: error?.code });
    return res.status(500).json({ error: 'Failed to verify session' });
  }
};
