const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const { getMeteredPriceMap } = require('./_lib/stripe-usage-reporter');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('CheckoutSession');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { planName, betaCode } = req.body;
    let { priceId } = req.body;

    // Validate beta access code (grants 30-day free trial on any plan)
    const isBetaAccess = betaCode && process.env.BETA_CODE && betaCode === process.env.BETA_CODE;

    // Resolve priceId server-side if not provided by client (VITE_ vars may be missing from bundle)
    const serverPriceMap = {
      Starter: process.env.STRIPE_STARTER_PRICE_ID,
      Growth: process.env.STRIPE_GROWTH_PRICE_ID,
      Scale: process.env.STRIPE_SCALE_PRICE_ID,
    };
    if (!priceId && planName) {
      priceId = serverPriceMap[planName] || null;
    }

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    // CRITICAL: validate priceId is one of OUR plan prices, not an arbitrary
    // Stripe price the caller picked from the URL. Before this gate, an
    // attacker could pass `{ priceId: 'price_test_one_cent' }` and check out
    // at $0.01 — the Stripe API happily creates a session with any active
    // price in the account, including test prices, draft prices, or
    // promotional prices we forgot to retire. The allowlist below is the
    // ONLY thing distinguishing "real plan" from "anything else in Stripe".
    const ALLOWED_PRICE_IDS = new Set(
      Object.values(serverPriceMap).filter(Boolean),
    );
    if (!ALLOWED_PRICE_IDS.has(priceId)) {
      logger.warn('Rejected checkout with non-plan priceId', { restaurantIdHint: auth.user?.restaurant_id });
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Get restaurant_id from authenticated user for multi-tenancy
    const restaurantId = auth.user?.restaurant_id || null;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurant setup required before subscribing. Please complete onboarding first.' });
    }

    if (isBetaAccess) logger.info('Beta access granted for restaurant:', restaurantId);

    // Check if this restaurant was referred — apply referee discount if so
    let discounts;
    try {
      const { supabaseAdmin } = require('./_lib/supabase');
      const { data: referral } = await supabaseAdmin
        .from('referrals')
        .select('id')
        .eq('referee_id', restaurantId)
        .eq('status', 'pending')
        .limit(1)
        .single();
      if (referral) {
        discounts = [{ coupon: 'REFERRED_20_3M' }];
        logger.info('Applying referral discount for restaurant:', restaurantId);
      }
    } catch (err) {
      logger.warn('Referral lookup failed, proceeding without discount:', err.message);
    }

    // Resolve origin against an explicit allowlist to prevent open-redirect via
    // a spoofed Origin header. Attacker-supplied origins fall back to CLIENT_URL.
    const ALLOWED_RETURN_ORIGINS = [
      'https://seatable.one',
      'https://restaurant-ai-mcp.vercel.app',
      process.env.CLIENT_URL,
    ].filter(Boolean);

    const origin = ALLOWED_RETURN_ORIGINS.includes(req.headers.origin)
      ? req.headers.origin
      : (process.env.CLIENT_URL || 'https://seatable.one');

    // Build line items: base subscription + metered prices
    const lineItems = [
      {
        price: priceId,
        quantity: 1,
      },
    ];

    // Add metered price items for usage-based billing (unique price IDs only)
    // Fetch base price + all unique metered prices in parallel to check currency compatibility
    const meteredPriceMap = getMeteredPriceMap();
    const uniqueMeteredIds = [...new Set(Object.values(meteredPriceMap).map(m => m.priceId))];
    const allPriceIds = [priceId, ...uniqueMeteredIds];

    const priceResults = await Promise.allSettled(
      allPriceIds.map(id => stripe.prices.retrieve(id))
    );

    const basePriceResult = priceResults[0];
    const baseCurrency = basePriceResult.status === 'fulfilled' ? basePriceResult.value.currency : null;

    if (!baseCurrency) {
      logger.warn('Could not retrieve base price currency, skipping metered items');
    } else {
      for (let i = 1; i < priceResults.length; i++) {
        const result = priceResults[i];
        if (result.status === 'fulfilled' && result.value.currency === baseCurrency) {
          lineItems.push({ price: uniqueMeteredIds[i - 1] });
        } else if (result.status === 'rejected') {
          logger.warn('Skipping metered price (retrieve failed):', uniqueMeteredIds[i - 1]);
        }
      }
    }

    // Tier-specific description shown on Stripe Checkout + invoices + receipts.
    // Audit BUG #16: all three plan prices hang off a single Stripe Product
    // named "Seatable Subscription", so the Checkout page can't tell the
    // tiers apart. The shared product name is now generic ("Seatable —
    // Gestão de Restaurantes com IA", via stripe-rename-products.cjs); this
    // subscription description is what disambiguates "Plano Profissional"
    // from "Plano Essencial" for the customer.
    const PLAN_DISPLAY = {
      Starter: 'Plano Essencial · R$ 497/mês',
      Growth: 'Plano Profissional · R$ 1.497/mês',
      Scale: 'Plano Enterprise · R$ 2.997/mês',
    };
    const subscriptionDescription = PLAN_DISPLAY[planName] || undefined;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: lineItems,
      locale: 'auto',
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#pricing`,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      billing_address_collection: 'required',
      customer_email: req.body.email || undefined,
      metadata: {
        plan_name: planName || 'Unknown Plan',
        restaurant_id: restaurantId || '',
      },
      subscription_data: {
        ...(isBetaAccess ? { trial_period_days: 30 } : planName === 'Growth' ? { trial_period_days: 14 } : {}),
        ...(subscriptionDescription ? { description: subscriptionDescription } : {}),
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
    const stripeMessage = error?.message || 'Failed to create checkout session';
    return res.status(400).json({
      error: stripeMessage,
      message: stripeMessage,
    });
  }
};
