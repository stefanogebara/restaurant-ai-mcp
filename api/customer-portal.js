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
    return res.status(500).json({
      error: 'Failed to create portal session',
      message: 'Something went wrong. Please try again.',
    });
  }
};
