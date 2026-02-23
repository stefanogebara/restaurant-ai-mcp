const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('StripeWebhook');
const { getPlanFromPriceId } = require('./services/subscription-limits');
const {
  createSubscription,
  updateSubscription,
  getSubscriptionByCustomerId,
  updateRestaurantPlan,
  query: supabase,
} = require('./_lib/supabase');
const { sendPaymentReceiptEmail, sendPaymentFailedEmail, sendTrialEndingEmail } = require('./_lib/email');

// This is your Stripe webhook secret for verifying webhook signatures
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Look up restaurant_id from Stripe event metadata or customer email.
 * Stripe checkout sessions should include restaurant_id in metadata.
 * Fallback: look up restaurant_config by email.
 *
 * @param {object} stripeObject - The Stripe event data object (session, subscription, invoice, etc.)
 * @param {string|null} customerEmail - Customer email if already retrieved
 * @returns {Promise<string|null>} restaurant_id or null
 */
async function resolveRestaurantId(stripeObject, customerEmail = null) {
  // Method 1: Check Stripe metadata for restaurant_id
  // (create-checkout-session.js includes restaurant_id in both session and subscription metadata)
  const metadataRestaurantId = stripeObject.metadata?.restaurant_id;
  if (metadataRestaurantId) {
    logger.info('Restaurant ID from Stripe metadata:', metadataRestaurantId);
    return metadataRestaurantId;
  }

  // Method 2: Look up by customer email in restaurant_config
  if (customerEmail) {
    try {
      const { data, error } = await supabase
        .schema('restaurant')
        .from('restaurant_config')
        .select('id')
        .eq('email', customerEmail)
        .limit(1)
        .single();

      if (!error && data) {
        logger.info('Restaurant ID resolved from email:', data.id);
        return data.id;
      }
    } catch (err) {
      logger.warn('Could not look up restaurant by email:', err.message);
    }
  }

  logger.warn('Could not resolve restaurant_id from Stripe event. Subscription functions will fail without it.');
  return null;
}

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
    // Vercel exposes req.rawBody for webhook endpoints; fall back to re-serializing
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        logger.info('Checkout session completed:', session.id);

        // Session completed, subscription will be created in customer.subscription.created event
        // Just log for now
        logger.info('Customer:', session.customer);
        logger.info('Subscription:', session.subscription);
        logger.info('Email:', session.customer_details?.email);
        logger.info('Metadata restaurant_id:', session.metadata?.restaurant_id || 'NOT SET');

        break;

      case 'customer.subscription.created':
        const subscriptionCreated = event.data.object;
        logger.info('Subscription created:', subscriptionCreated.id);

        // Get customer email from Stripe
        const customer = await stripe.customers.retrieve(subscriptionCreated.customer);
        if (!customer || customer.deleted) {
          logger.error('Customer not found or deleted for subscription:', subscriptionCreated.id, 'Customer ID:', subscriptionCreated.customer);
          break;
        }
        const priceId = subscriptionCreated.items.data[0].price.id;
        const planName = getPlanFromPriceId(priceId);

        // Resolve restaurant_id from Stripe metadata or customer email
        const createRestaurantId = await resolveRestaurantId(subscriptionCreated, customer.email);
        if (!createRestaurantId) {
          logger.error('Cannot create subscription without restaurant_id. Subscription:', subscriptionCreated.id, 'Customer email:', customer.email, 'Customer ID:', subscriptionCreated.customer);
          // Throw to return 500 so Stripe retries this event
          throw new Error(`Cannot resolve restaurant for subscription ${subscriptionCreated.id}`);
        }

        // Create subscription record in database
        const createResult = await createSubscription(createRestaurantId, {
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
        }, { idempotency_key: `stripe-event-${event.id}` });

        if (!createResult.success) {
          logger.error('Failed to create subscription in database:', createResult.message);
        } else {
          logger.info('Subscription saved to database:', subscriptionCreated.id);
        }

        // Also update restaurant_info.metric_profile.plan as fallback
        const planUpdateResult = await updateRestaurantPlan(createRestaurantId, planName, customer.email);
        if (!planUpdateResult.success) {
          logger.error('Failed to update restaurant plan:', planUpdateResult.message);
        } else {
          logger.info('Restaurant plan updated to:', planName);
        }

        break;

      case 'customer.subscription.updated':
        const subscriptionUpdated = event.data.object;
        logger.info('Subscription updated:', subscriptionUpdated.id);

        // Update subscription in database
        const updatedPriceId = subscriptionUpdated.items.data[0].price.id;
        const updatedPlanName = getPlanFromPriceId(updatedPriceId);

        // Resolve restaurant_id from Stripe metadata or customer lookup
        const updateCustomer = await stripe.customers.retrieve(subscriptionUpdated.customer);
        const updateRestaurantId = await resolveRestaurantId(subscriptionUpdated, updateCustomer.email);
        if (!updateRestaurantId) {
          logger.error('Cannot update subscription without restaurant_id. Customer:', subscriptionUpdated.customer);
          break;
        }

        const updateResult = await updateSubscription(updateRestaurantId, subscriptionUpdated.id, {
          'Plan Name': updatedPlanName || 'unknown',
          'Price ID': updatedPriceId,
          'Status': subscriptionUpdated.status,
          'Current Period Start': new Date(subscriptionUpdated.current_period_start * 1000).toISOString().split('T')[0],
          'Current Period End': new Date(subscriptionUpdated.current_period_end * 1000).toISOString().split('T')[0],
          'Trial End': subscriptionUpdated.trial_end ? new Date(subscriptionUpdated.trial_end * 1000).toISOString().split('T')[0] : null,
        });

        if (!updateResult.success) {
          logger.error('Failed to update subscription in database:', updateResult.message);
        } else {
          logger.info('Subscription updated in database:', subscriptionUpdated.id);
        }

        // Also update restaurant_info.metric_profile.plan
        if (updatedPlanName) {
          await updateRestaurantPlan(updateRestaurantId, updatedPlanName);
        }

        break;

      case 'customer.subscription.deleted':
        const subscriptionDeleted = event.data.object;
        logger.info('Subscription cancelled:', subscriptionDeleted.id);

        // Resolve restaurant_id from Stripe metadata or customer lookup
        const deleteCustomer = await stripe.customers.retrieve(subscriptionDeleted.customer);
        const deleteRestaurantId = await resolveRestaurantId(subscriptionDeleted, deleteCustomer.email);
        if (!deleteRestaurantId) {
          logger.error('Cannot cancel subscription without restaurant_id. Customer:', subscriptionDeleted.customer);
          break;
        }

        // Mark subscription as canceled in database
        const cancelResult = await updateSubscription(deleteRestaurantId, subscriptionDeleted.id, {
          'Status': 'canceled',
          'Canceled At': new Date().toISOString().split('T')[0]
        });

        if (!cancelResult.success) {
          logger.error('Failed to cancel subscription in database:', cancelResult.message);
        } else {
          logger.info('Subscription canceled in database:', subscriptionDeleted.id);
        }

        // Downgrade restaurant plan to Starter when subscription is cancelled
        await updateRestaurantPlan(deleteRestaurantId, 'Starter');

        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        logger.info('Invoice payment succeeded:', invoice.id);
        logger.info('Customer:', invoice.customer);
        logger.info('Amount paid:', invoice.amount_paid / 100, invoice.currency.toUpperCase());

        // Payment status is automatically reflected in subscription.updated event
        // Send receipt email
        try {
          const receiptCustomer = await stripe.customers.retrieve(invoice.customer);
          if (receiptCustomer.email) {
            await sendPaymentReceiptEmail({
              customerEmail: receiptCustomer.email,
              amount: (invoice.amount_paid / 100).toFixed(2),
              currency: invoice.currency.toUpperCase(),
              invoiceId: invoice.id,
            });
          }
        } catch (emailErr) {
          logger.error('Failed to send receipt email:', emailErr.message);
        }

        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        logger.info('Invoice payment failed:', failedInvoice.id);
        logger.info('Customer:', failedInvoice.customer);
        logger.info('Amount due:', failedInvoice.amount_due / 100, failedInvoice.currency.toUpperCase());

        // Subscription status will be updated to 'past_due' automatically in subscription.updated event
        // Send payment failure notification
        try {
          const failedCustomer = await stripe.customers.retrieve(failedInvoice.customer);
          if (failedCustomer.email) {
            await sendPaymentFailedEmail({
              customerEmail: failedCustomer.email,
              amount: (failedInvoice.amount_due / 100).toFixed(2),
              currency: failedInvoice.currency.toUpperCase(),
              invoiceId: failedInvoice.id,
            });
          }
        } catch (emailErr) {
          logger.error('Failed to send payment failed email:', emailErr.message);
        }

        break;

      case 'customer.subscription.trial_will_end':
        const trialEndingSoon = event.data.object;
        logger.info('Trial ending soon:', trialEndingSoon.id);
        logger.info('Trial ends:', new Date(trialEndingSoon.trial_end * 1000).toISOString());

        // Send trial ending reminder
        try {
          const trialCustomer = await stripe.customers.retrieve(trialEndingSoon.customer);
          if (trialCustomer.email) {
            await sendTrialEndingEmail({
              customerEmail: trialCustomer.email,
              trialEndsAt: new Date(trialEndingSoon.trial_end * 1000).toISOString(),
            });
          }
        } catch (emailErr) {
          logger.error('Failed to send trial ending email:', emailErr.message);
        }

        break;

      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error processing webhook:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
    });
  }
};
