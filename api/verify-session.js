const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('VerifySession');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve the checkout session from Stripe with line items expanded
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items.data.price']
    });

    // Map Stripe price IDs to plan names
    const planMapping = {
      [process.env.STRIPE_STARTER_PRICE_ID]: 'Starter',
      [process.env.STRIPE_GROWTH_PRICE_ID]: 'Growth',
      [process.env.STRIPE_SCALE_PRICE_ID]: 'Scale',
    };

    // Extract plan from line items
    let plan = 'Starter'; // Default to Starter
    if (session.line_items && session.line_items.data.length > 0) {
      const priceId = session.line_items.data[0].price.id;
      plan = planMapping[priceId] || 'Starter';
    }

    // Reject sessions that weren't paid (expired, cancelled, etc.)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return res.status(402).json({
        error: 'Payment not completed',
        status: session.payment_status,
      });
    }

    // Return relevant session information
    return res.status(200).json({
      status: session.payment_status,
      customer_id: session.customer,
      customer_email: session.customer_details?.email,
      subscription_id: session.subscription,
      amount_total: session.amount_total,
      currency: session.currency,
      plan: plan, // Add plan to response
    });
  } catch (error) {
    logger.error('Error verifying session:', error);
    return res.status(500).json({
      error: 'Failed to verify session',
      message: error.message,
    });
  }
};
