const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const { getSubscriptions, supabaseAdmin } = require('./_lib/supabase');
const { getMeteredPriceMap } = require('./_lib/stripe-usage-reporter');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('CheckoutSession');

const terminalStatuses = new Set(['canceled', 'incomplete_expired']);
const planDisplay = {
  Starter: 'Plano Essencial',
  Growth: 'Plano Profissional',
  Scale: 'Plano Enterprise',
};

function resolvePlan(priceId, planName) {
  const plans = Object.entries({
    Starter: process.env.STRIPE_STARTER_PRICE_ID,
    Growth: process.env.STRIPE_GROWTH_PRICE_ID,
    Scale: process.env.STRIPE_SCALE_PRICE_ID,
  });
  const selectedPrice = priceId == null || priceId === ''
    ? plans.find(([name]) => name === planName)?.[1]
    : priceId;
  const matches = plans.filter(([, price]) => price && price === selectedPrice);
  const hasPlanName = planName != null && planName !== '';
  if (matches.length !== 1 || (hasPlanName && planName !== matches[0][0])) return null;
  return { name: matches[0][0], priceId: selectedPrice };
}

async function loadCustomers(restaurantId) {
  const result = await getSubscriptions(restaurantId);
  if (!result.success) throw new Error('Unable to look up billing records');

  const customers = new Map();
  for (const { fields } of result.data.records) {
    const customerId = fields['Customer ID'];
    const subscriptionId = fields['Subscription ID'];
    const hasStripeCustomer = typeof customerId === 'string' && customerId.startsWith('cus_');
    const hasStripeSubscription = typeof subscriptionId === 'string' && subscriptionId.startsWith('sub_');
    const needsBilling = hasStripeSubscription && !terminalStatuses.has(fields.Status);
    if (!hasStripeCustomer) {
      if (needsBilling) throw new Error('Stripe subscription has no customer');
      continue;
    }
    customers.set(customerId, needsBilling || customers.get(customerId));
  }

  const verified = [];
  for (const [customerId, needsBilling] of customers) {
    let customer;
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch (error) {
      if (error.code !== 'resource_missing' || needsBilling) throw error;
    }
    if (!customer || customer.deleted) {
      if (needsBilling) throw new Error('Stripe customer is unavailable');
      continue;
    }
    if (customer.id !== customerId || (customer.metadata?.restaurant_id && customer.metadata.restaurant_id !== restaurantId)) {
      return { forbidden: true };
    }
    verified.push(customer);
  }

  if (verified.length === 0) {
    // During the first checkout the webhook has not recorded a customer yet.
    // A stable Stripe idempotency key below covers retries before Search catches up.
    const query = `metadata['restaurant_id']:'${restaurantId}'`;
    for await (const customer of stripe.customers.search({ query })) {
      if (!customer.deleted && customer.metadata?.restaurant_id === restaurantId) verified.push(customer);
    }
  }
  return { customers: verified };
}

async function latestCheckout(customerId, restaurantId) {
  for await (const session of stripe.checkout.sessions.list({ customer: customerId })) {
    if (session.mode === 'subscription' && session.metadata?.restaurant_id === restaurantId) return session;
  }
  return null;
}

async function existingSubscription(restaurantId, customers) {
  for (const { id: customer } of customers) {
    for await (const subscription of stripe.subscriptions.list({ customer, status: 'all' })) {
      const subscriptionRestaurantId = subscription.metadata?.restaurant_id;
      if (subscriptionRestaurantId && subscriptionRestaurantId !== restaurantId) return { forbidden: true };
      if (!terminalStatuses.has(subscription.status)) return { exists: true };
    }
  }
  return {};
}

async function checkoutLineItems(priceId) {
  const lineItems = [{ price: priceId, quantity: 1 }];
  const meteredIds = [...new Set(Object.values(getMeteredPriceMap()).map(item => item.priceId))]
    .filter(id => id && id !== priceId);
  if (meteredIds.length === 0) return lineItems;

  const [base, ...metered] = await Promise.allSettled(
    [priceId, ...meteredIds].map(id => stripe.prices.retrieve(id)),
  );
  if (base.status !== 'fulfilled' || !base.value.currency) {
    logger.warn('Could not retrieve base price currency, skipping metered items');
    return lineItems;
  }
  for (const [index, price] of metered.entries()) {
    if (price.status === 'fulfilled' && price.value.currency === base.value.currency) {
      lineItems.push({ price: meteredIds[index] });
    }
  }
  return lineItems;
}

function checkoutInProgress(res) {
  return res.status(409).json({
    code: 'CHECKOUT_IN_PROGRESS',
    error: 'A checkout is already in progress. Complete the open checkout or try again after it expires.',
  });
}

function respondWithSession(res, session) {
  if (!session.url) return checkoutInProgress(res);
  return res.status(200).json({ sessionId: session.id, url: session.url });
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { restaurant_id: restaurantId, role } = auth.user;
  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant setup required before subscribing. Please complete onboarding first.' });
  }
  if (role !== 'owner') return res.status(403).json({ error: 'Forbidden' });

  const { priceId, planName, betaCode } = req.body || {};
  const plan = resolvePlan(priceId, planName);
  if (!plan) return res.status(400).json({ error: 'Invalid plan selected' });
  const isBeta = Boolean(process.env.BETA_CODE && betaCode === process.env.BETA_CODE);
  const trialDays = isBeta ? 30 : plan.name === 'Growth' ? 14 : 0;

  try {
    const { customers, forbidden } = await loadCustomers(restaurantId);
    if (forbidden) return res.status(403).json({ error: 'Forbidden' });

    if (customers.length === 0) {
      customers.push(await stripe.customers.create({
        metadata: { restaurant_id: restaurantId, seatable_checkout: '1' },
      }, { idempotencyKey: `seatable-customer-v1:${restaurantId}` }));
    }

    const customer = customers[0].id;
    const latest = await latestCheckout(customer, restaurantId);
    // Check current Stripe state across all mapped customers, including when
    // the webhook is still catching up or the local row is marked canceled.
    const billing = await existingSubscription(restaurantId, customers);
    if (billing.forbidden) return res.status(403).json({ error: 'Forbidden' });
    if (billing.exists) {
      return res.status(409).json({
        code: 'SUBSCRIPTION_EXISTS',
        error: 'This restaurant already has a Stripe subscription. Manage it in the billing portal.',
      });
    }

    if (latest?.status === 'open') {
      if (latest.metadata.plan_price_id === plan.priceId && latest.metadata.trial_days === String(trialDays)) {
        return respondWithSession(res, latest);
      }
      return checkoutInProgress(res);
    }

    let discounts;
    try {
      const { data: referral } = await supabaseAdmin
        .from('referrals')
        .select('id')
        .eq('referee_id', restaurantId)
        .eq('status', 'pending')
        .limit(1)
        .single();
      if (referral) discounts = [{ coupon: 'REFERRED_20_3M' }];
    } catch (error) {
      logger.warn('Referral lookup failed', { code: error?.code });
    }

    const returnOrigin = process.env.CLIENT_URL || 'https://seatable.one';
    const allowedOrigins = ['https://seatable.one', 'https://restaurant-ai-mcp.vercel.app', returnOrigin];
    const origin = allowedOrigins.includes(req.headers.origin) ? req.headers.origin : returnOrigin;
    const metadata = { restaurant_id: restaurantId, plan_name: plan.name, plan_price_id: plan.priceId };

    // Requests for different plans still compete for the same checkout slot.
    // Once it expires or its subscription ends, its ID anchors a new slot.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: await checkoutLineItems(plan.priceId),
      locale: 'auto',
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription/manage?plan=${plan.name.toLowerCase()}`,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      billing_address_collection: 'required',
      metadata: { ...metadata, trial_days: String(trialDays) },
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        description: planDisplay[plan.name],
        metadata,
      },
    }, { idempotencyKey: `seatable-checkout-v1:${restaurantId}:${customer}:${latest?.id || 'first'}` });

    return respondWithSession(res, session);
  } catch (error) {
    if (error?.type === 'StripeIdempotencyError' || error?.code === 'idempotency_key_in_use') {
      return checkoutInProgress(res);
    }
    logger.error('Error creating checkout session', { code: error?.code });
    return res.status(503).json({ error: 'Unable to start checkout. Please try again.' });
  }
};
