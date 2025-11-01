/**
 * Get Subscription Status API
 *
 * Returns the current user's subscription details for frontend use
 */

const { getSubscriptionByEmail } = require('./_lib/supabase');

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
    // Get customer email from query params
    const customerEmail = req.query.email;

    if (!customerEmail) {
      return res.status(400).json({
        error: 'Missing email parameter',
        message: 'Please provide customer email in query string'
      });
    }

    // Get subscription from database
    const result = await getSubscriptionByEmail(customerEmail);

    if (!result.success) {
      return res.status(404).json({
        error: 'No subscription found',
        message: 'This email does not have an active subscription',
        has_subscription: false
      });
    }

    const subscription = result.subscription;

    // Return subscription details
    return res.status(200).json({
      has_subscription: true,
      subscription: {
        plan: subscription.plan_name,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        trial_end: subscription.trial_end,
        is_active: subscription.status === 'active' || subscription.status === 'trialing',
        is_trial: subscription.status === 'trialing'
      }
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return res.status(500).json({
      error: 'Failed to fetch subscription status',
      message: error.message
    });
  }
};
