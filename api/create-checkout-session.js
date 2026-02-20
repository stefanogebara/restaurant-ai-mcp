const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const { getMeteredPriceMap } = require('./_lib/stripe-usage-reporter');
const { createSecureLogger } = require('./_lib/secure-logger');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('CheckoutSession');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { priceId, planName, currency } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    // Get restaurant_id from authenticated user for multi-tenancy
    const restaurantId = auth.user?.restaurant_id || null;

    // Get the origin for success/cancel URLs
    const origin = req.headers.origin || process.env.CLIENT_URL || 'https://restaurant-ai-mcp.vercel.app';

    // Build line items: base subscription + metered prices
    const lineItems = [
      {
        price: priceId,
        quantity: 1,
      },
    ];

    // Add metered price items for usage-based billing
    const meteredPriceMap = getMeteredPriceMap();
    const addedPrices = new Set();
    const planLower = (planName || '').toLowerCase();
    for (const [metricType, meteredPriceId] of Object.entries(meteredPriceMap)) {
      // Only attach the overage price matching this plan
      if (metricType === 'reservation_overage_starter' && planLower !== 'starter') continue;
      if (metricType === 'reservation_overage_growth' && planLower !== 'growth') continue;
      // Scale has unlimited reservations — no overage price needed
      if (metricType.startsWith('reservation_overage_') && planLower === 'scale') continue;

      if (!addedPrices.has(meteredPriceId)) {
        addedPrices.add(meteredPriceId);
        lineItems.push({ price: meteredPriceId });
      }
    }

    // Payment methods: add boleto for BRL customers
    const isBRL = currency === 'BRL';
    const paymentMethodTypes = isBRL ? ['card', 'boleto'] : ['card'];

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: paymentMethodTypes,
      line_items: lineItems,
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#pricing`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_email: req.body.email || undefined,
      metadata: {
        plan_name: planName || 'Unknown Plan',
        restaurant_id: restaurantId || '',
        currency: currency || 'EUR',
      },
      subscription_data: {
        ...(planName === 'Growth' ? { trial_period_days: 14 } : {}),
        metadata: {
          plan_name: planName || 'Unknown Plan',
          restaurant_id: restaurantId || '',
        },
      },
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error('Error creating checkout session:', error.message);
    return res.status(500).json({
      error: 'Failed to create checkout session',
      message: error.message,
    });
  }
};
