const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// This is your Stripe webhook secret for verifying webhook signatures
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);

        // TODO: Save subscription details to database
        // - session.customer (Stripe customer ID)
        // - session.subscription (Stripe subscription ID)
        // - session.customer_email
        // - session.metadata (plan_name, etc.)

        break;

      case 'customer.subscription.created':
        const subscriptionCreated = event.data.object;
        console.log('Subscription created:', subscriptionCreated.id);

        // TODO: Update database with subscription details
        // - subscriptionCreated.customer
        // - subscriptionCreated.status
        // - subscriptionCreated.current_period_end
        // - subscriptionCreated.items.data[0].price.id (price ID)

        break;

      case 'customer.subscription.updated':
        const subscriptionUpdated = event.data.object;
        console.log('Subscription updated:', subscriptionUpdated.id);

        // TODO: Update subscription status in database
        // Handle plan changes, trial endings, etc.

        break;

      case 'customer.subscription.deleted':
        const subscriptionDeleted = event.data.object;
        console.log('Subscription cancelled:', subscriptionDeleted.id);

        // TODO: Mark subscription as cancelled in database

        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        console.log('Invoice payment succeeded:', invoice.id);

        // TODO: Update payment status in database
        // Send receipt email to customer

        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        console.log('Invoice payment failed:', failedInvoice.id);

        // TODO: Send payment failure notification to customer
        // Update subscription status

        break;

      case 'customer.subscription.trial_will_end':
        const trialEndingSoon = event.data.object;
        console.log('Trial ending soon:', trialEndingSoon.id);

        // TODO: Send trial ending reminder email

        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
    });
  }
};
