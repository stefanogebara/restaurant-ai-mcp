const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      [process.env.STRIPE_BASIC_PRICE_ID]: 'Basic',
      [process.env.STRIPE_PROFESSIONAL_PRICE_ID]: 'Professional',
      [process.env.STRIPE_ENTERPRISE_PRICE_ID]: 'Enterprise',
    };

    // Extract plan from line items
    let plan = 'Basic'; // Default to Basic
    if (session.line_items && session.line_items.data.length > 0) {
      const priceId = session.line_items.data[0].price.id;
      plan = planMapping[priceId] || 'Basic';
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
    console.error('Error verifying session:', error);
    return res.status(500).json({
      error: 'Failed to verify session',
      message: error.message,
    });
  }
};
