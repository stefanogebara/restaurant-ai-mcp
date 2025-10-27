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
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Fetch all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1, // Get the most recent subscription
    });

    // If no subscriptions found
    if (!subscriptions.data || subscriptions.data.length === 0) {
      return res.status(200).json({
        status: 'none',
        planName: 'No Plan',
        planPrice: 'N/A',
      });
    }

    // Get the most recent subscription
    const subscription = subscriptions.data[0];

    // Get the price details
    const priceId = subscription.items.data[0].price.id;
    const price = subscription.items.data[0].price;

    // Map price ID to plan name
    const planMapping = {
      [process.env.STRIPE_BASIC_PRICE_ID]: 'Basic',
      [process.env.STRIPE_PROFESSIONAL_PRICE_ID]: 'Professional',
      [process.env.STRIPE_ENTERPRISE_PRICE_ID]: 'Enterprise',
    };

    const planName = planMapping[priceId] || 'Unknown Plan';
    const planPrice = `€${(price.unit_amount / 100).toFixed(2)}/${price.recurring.interval}`;

    // Build response
    const response = {
      status: subscription.status, // active, trialing, canceled, past_due, etc.
      planName,
      planPrice,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toLocaleDateString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };

    // Add trial end date if in trial
    if (subscription.status === 'trialing' && subscription.trial_end) {
      response.trialEnd = new Date(subscription.trial_end * 1000).toLocaleDateString();
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return res.status(500).json({
      error: 'Failed to fetch subscription',
      message: error.message,
    });
  }
};
