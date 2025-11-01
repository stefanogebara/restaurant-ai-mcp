const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { getPlanFromPriceId } = require('./services/subscription-limits');
const {
  createSubscription,
  updateSubscription,
  getSubscriptionByCustomerId,
} = require('./_lib/supabase');

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

        // Session completed, subscription will be created in customer.subscription.created event
        // Just log for now
        console.log('Customer:', session.customer);
        console.log('Subscription:', session.subscription);
        console.log('Email:', session.customer_details?.email);

        break;

      case 'customer.subscription.created':
        const subscriptionCreated = event.data.object;
        console.log('Subscription created:', subscriptionCreated.id);

        // Get customer email from Stripe
        const customer = await stripe.customers.retrieve(subscriptionCreated.customer);
        const priceId = subscriptionCreated.items.data[0].price.id;
        const planName = getPlanFromPriceId(priceId);

        // Create subscription record in Airtable
        const createResult = await createSubscription({
          'Subscription ID': subscriptionCreated.id,
          'Customer ID': subscriptionCreated.customer,
          'Customer Email': customer.email,
          'Plan Name': planName || 'unknown',
          'Price ID': priceId,
          'Status': subscriptionCreated.status,
          'Current Period Start': new Date(subscriptionCreated.current_period_start * 1000).toISOString().split('T')[0],
          'Current Period End': new Date(subscriptionCreated.current_period_end * 1000).toISOString().split('T')[0],
          'Trial End': subscriptionCreated.trial_end ? new Date(subscriptionCreated.trial_end * 1000).toISOString().split('T')[0] : null,
          'Created At': new Date().toISOString().split('T')[0]
        });

        if (!createResult.success) {
          console.error('Failed to create subscription in database:', createResult.message);
        } else {
          console.log('Subscription saved to database:', subscriptionCreated.id);
        }

        break;

      case 'customer.subscription.updated':
        const subscriptionUpdated = event.data.object;
        console.log('Subscription updated:', subscriptionUpdated.id);

        // Update subscription in database
        const updatedPriceId = subscriptionUpdated.items.data[0].price.id;
        const updatedPlanName = getPlanFromPriceId(updatedPriceId);

        const updateResult = await updateSubscription(subscriptionUpdated.id, {
          'Plan Name': updatedPlanName || 'unknown',
          'Price ID': updatedPriceId,
          'Status': subscriptionUpdated.status,
          'Current Period Start': new Date(subscriptionUpdated.current_period_start * 1000).toISOString().split('T')[0],
          'Current Period End': new Date(subscriptionUpdated.current_period_end * 1000).toISOString().split('T')[0],
          'Trial End': subscriptionUpdated.trial_end ? new Date(subscriptionUpdated.trial_end * 1000).toISOString().split('T')[0] : null,
        });

        if (!updateResult.success) {
          console.error('Failed to update subscription in database:', updateResult.message);
        } else {
          console.log('Subscription updated in database:', subscriptionUpdated.id);
        }

        break;

      case 'customer.subscription.deleted':
        const subscriptionDeleted = event.data.object;
        console.log('Subscription cancelled:', subscriptionDeleted.id);

        // Mark subscription as canceled in database
        const cancelResult = await updateSubscription(subscriptionDeleted.id, {
          'Status': 'canceled',
          'Canceled At': new Date().toISOString().split('T')[0]
        });

        if (!cancelResult.success) {
          console.error('Failed to cancel subscription in database:', cancelResult.message);
        } else {
          console.log('Subscription canceled in database:', subscriptionDeleted.id);
        }

        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        console.log('Invoice payment succeeded:', invoice.id);
        console.log('Customer:', invoice.customer);
        console.log('Amount paid:', invoice.amount_paid / 100, invoice.currency.toUpperCase());

        // Payment status is automatically reflected in subscription.updated event
        // TODO: Send receipt email to customer (future enhancement)

        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        console.log('Invoice payment failed:', failedInvoice.id);
        console.log('Customer:', failedInvoice.customer);
        console.log('Amount due:', failedInvoice.amount_due / 100, failedInvoice.currency.toUpperCase());

        // Subscription status will be updated to 'past_due' automatically in subscription.updated event
        // TODO: Send payment failure notification email (future enhancement)

        break;

      case 'customer.subscription.trial_will_end':
        const trialEndingSoon = event.data.object;
        console.log('Trial ending soon:', trialEndingSoon.id);
        console.log('Trial ends:', new Date(trialEndingSoon.trial_end * 1000).toISOString());

        // TODO: Send trial ending reminder email (future enhancement)

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
