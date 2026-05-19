const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { getSubscriptions } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('CustomerPortal');

module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'customer_portal');
  if (rateLimited) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant setup required' });
  }

  try {
    // Look up customerId from DB by restaurant_id (no need to pass from client)
    const result = await getSubscriptions(restaurantId);

    if (!result.success || !result.data.records || result.data.records.length === 0) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const customerId = result.data.records[0].fields['Customer ID'];

    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe customer found for this restaurant' });
    }

    // Guard against onboarding-seeded fake customer IDs (UUIDs, not cus_xxx)
    if (!customerId.startsWith('cus_')) {
      return res.status(400).json({ error: 'No active subscription found. Please select a plan to continue.' });
    }

    // Defense in depth: cross-check Stripe customer metadata.restaurant_id
    // against the caller's JWT restaurant_id BEFORE opening a portal session.
    // The subscriptions table lookup is the primary control (RLS + JWT-scoped
    // query), but if the DB row were ever corrupted or hijacked, opening the
    // portal for the wrong customer would let one tenant manage another
    // tenant's billing — change card, cancel subscription, etc. Stripe is
    // the source of truth for which restaurant_id owns which cus_xxx, so we
    // verify there too.
    try {
      const stripeCustomer = await stripe.customers.retrieve(customerId);
      const metaRestaurantId = stripeCustomer?.metadata?.restaurant_id;
      if (metaRestaurantId && metaRestaurantId !== restaurantId) {
        logger.warn('Customer-portal ownership mismatch detected', {
          jwtRestaurantId: restaurantId,
          stripeMetaRestaurantId: metaRestaurantId,
          customerId,
        });
        return res.status(403).json({ error: 'Subscription does not belong to this restaurant' });
      }
      // If metadata is missing (legacy customers from before metadata
      // backfill), we DON'T block — opening the portal there is still the
      // best option for that legitimate tenant — but the subscriptions
      // table mapping is the only guard for that case.
    } catch (lookupErr) {
      // Stripe customer lookup failures (404, network blip) shouldn't block
      // the portal — that would be more disruptive than the rare cross-tenant
      // risk. Log loudly so ops can catch a pattern.
      logger.warn('Stripe customer lookup failed (proceeding with portal)', {
        customerId,
        error: lookupErr?.message,
      });
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

    // Create a portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/subscription/manage`,
    });

    return res.status(200).json({
      url: portalSession.url,
    });
  } catch (error) {
    logger.error('Error creating portal session:', error);
    // Don't forward raw Stripe error messages — they can leak customer IDs,
    // API-key-location hints ("you provided a key in the ... body"),
    // webhook-secret hints, and other implementation details the user
    // can't act on anyway. Use a generic message and rely on logs +
    // Sentry for ops triage.
    return res.status(500).json({
      error: 'Unable to open the billing portal. Please try again or contact support.',
    });
  }
};
