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

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Return relevant session information
    return res.status(200).json({
      status: session.payment_status,
      customer_id: session.customer,
      customer_email: session.customer_details?.email,
      subscription_id: session.subscription,
      amount_total: session.amount_total,
      currency: session.currency,
    });
  } catch (error) {
    console.error('Error verifying session:', error);
    return res.status(500).json({
      error: 'Failed to verify session',
      message: error.message,
    });
  }
};
