const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('CustomerPortal');

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
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get the origin for return URL
    const origin = req.headers.origin || process.env.CLIENT_URL || 'http://localhost:8086';

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
      message: error.message,
    });
  }
};
