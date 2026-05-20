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
  supabaseAdmin,
} = require('./_lib/supabase');
const { sendPaymentReceiptEmail, sendPaymentFailedEmail, sendTrialEndingEmail, sendReferralRewardEmail } = require('./_lib/email');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');

// This is your Stripe webhook secret for verifying webhook signatures
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Look up restaurant_id from Stripe event metadata, Stripe customer metadata,
 * subscriptions table, or (last resort) customer email.
 *
 * Fallback chain:
 *   1. Object metadata (safe — set at checkout)
 *   2. Stripe customer metadata (safe — propagated from checkout.session.completed)
 *   3. Subscriptions table by customer_id (safe for existing customers)
 *   4. Email lookup in restaurant_config (UNSAFE — could match wrong restaurant,
 *      logged as ERROR, NEVER used for creation events)
 *
 * @param {object} stripeObject - The Stripe event data object (session, subscription, invoice, etc.)
 * @param {string|null} customerEmail - Customer email if already retrieved
 * @param {string} eventType - The Stripe event type (e.g. 'customer.subscription.created')
 * @returns {Promise<string|null>} restaurant_id or null
 */
async function resolveRestaurantId(stripeObject, customerEmail = null, eventType = '') {
  const isCreationEvent = eventType === 'customer.subscription.created';

  // Method 1: Check Stripe object metadata for restaurant_id
  // (create-checkout-session.js includes restaurant_id in both session and subscription metadata)
  const metadataRestaurantId = stripeObject.metadata?.restaurant_id;
  if (metadataRestaurantId) {
    logger.info('Restaurant ID from Stripe metadata:', metadataRestaurantId);
    return metadataRestaurantId;
  }

  // Method 2: Check Stripe customer metadata for restaurant_id
  // (propagated from checkout.session.completed handler)
  const stripeCustomerId = stripeObject.customer;
  if (stripeCustomerId) {
    try {
      const customerObj = await stripe.customers.retrieve(stripeCustomerId);
      if (customerObj && !customerObj.deleted && customerObj.metadata?.restaurant_id) {
        logger.info('Restaurant ID from Stripe customer metadata:', customerObj.metadata.restaurant_id);
        return customerObj.metadata.restaurant_id;
      }
    } catch (err) {
      logger.warn('Could not retrieve Stripe customer for metadata lookup:', err.message);
    }
  }

  // Method 3: Look up by stripe customer_id in subscriptions table
  if (stripeCustomerId) {
    logger.warn('Falling back to Stripe customer_id lookup in subscriptions. Customer:', stripeCustomerId);
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('restaurant_id')
        .eq('customer_id', stripeCustomerId)
        .limit(1)
        .single();

      if (!error && data?.restaurant_id) {
        logger.info('Restaurant ID resolved from subscriptions via customer_id:', data.restaurant_id);
        return data.restaurant_id;
      }
    } catch (err) {
      logger.warn('Could not look up restaurant by Stripe customer_id:', err.message);
    }
  }

  // For creation events, NEVER fall back to email lookup — it's unsafe.
  // Throw so Stripe retries and we get alerted.
  if (isCreationEvent) {
    logger.error('Cannot resolve restaurant_id for subscription creation event. Object metadata, customer metadata, and subscriptions table all failed. Customer:', stripeCustomerId, 'Email:', customerEmail);
    return null;
  }

  // Method 4: Email lookup in restaurant_config (LAST RESORT, non-creation events only).
  //
  // S.4 OBSERVABILITY: This fallback ONLY exists for legacy Stripe customers
  // that predate the metadata.restaurant_id backfill. Every hit here is a
  // signal that:
  //   (a) Stripe customer.metadata.restaurant_id is missing (backfill gap), or
  //   (b) The subscriptions table lookup by subscription_id failed, or
  //   (c) The event is genuinely orphaned and email is the only link.
  // The structured `metric: 'webhook_email_fallback_fired'` tag below
  // is the canary ops can alert on — once hits drop to ~0/week we can
  // safely remove the fallback entirely.
  //
  // Cross-tenant safety: refuse the resolution when MULTIPLE restaurants
  // share the email (the previous code took the first one with .single()
  // and would have thrown). Now we explicitly fetch up to 2 rows and
  // refuse if both come back.
  if (customerEmail) {
    logger.error('UNSAFE FALLBACK: Resolving restaurant_id via email lookup', {
      metric: 'webhook_email_fallback_fired',
      email: customerEmail,
      eventType,
    });
    try {
      const { data: matches, error } = await supabase
        .schema('restaurant')
        .from('restaurant_config')
        .select('id')
        .eq('email', customerEmail)
        .limit(2);

      if (error) {
        logger.warn('Email-fallback supabase query errored:', error.message);
      } else if (matches && matches.length > 1) {
        // Two or more restaurants share this email — refuse to guess
        // which one the event belongs to. Better to drop the event
        // (Stripe will retry) than silently update the wrong tenant.
        logger.error('Email fallback REFUSED: multiple restaurants share email', {
          metric: 'webhook_email_fallback_ambiguous',
          email: customerEmail,
          eventType,
          matchCount: matches.length,
        });
        return null;
      } else if (matches && matches.length === 1) {
        logger.error('Restaurant ID resolved from email (unsafe):', {
          metric: 'webhook_email_fallback_resolved',
          restaurantId: matches[0].id,
          email: customerEmail,
          eventType,
        });
        return matches[0].id;
      }
    } catch (err) {
      logger.warn('Could not look up restaurant by email:', err.message);
    }
  }

  logger.warn('Could not resolve restaurant_id from Stripe event. Subscription functions will fail without it.');
  return null;
}

/**
 * Award referral: credit referrer 1 month free, mark row as rewarded.
 * Only called for invoice.payment_succeeded with billing_reason=subscription_create.
 */
async function rewardReferralIfEligible(refereeRestaurantId, refereeStripeCustomerId, stripe, logger) {
  // Atomic claim: update status to 'converted' WHERE status='pending'
  // This acts as a compare-and-swap — if another execution already claimed it, 0 rows update and we bail.
  // Uses supabaseAdmin (service role) to bypass RLS on the referrals table.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('referrals')
    .update({ status: 'converted', converted_at: new Date().toISOString() })
    .eq('referee_id', refereeRestaurantId)
    .eq('status', 'pending')
    .select('id, referrer_id, referral_code')
    .single();

  if (claimError || !claimed) return; // No pending referral, or already claimed by another execution

  const { data: referrerSub } = await supabaseAdmin
    .from('subscriptions')
    .select('"Customer ID", "Plan Name"')
    .eq('restaurant_id', claimed.referrer_id)
    .not('status', 'eq', 'canceled')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!referrerSub?.['Customer ID']) {
    logger.warn('Referral: referrer has no active subscription, skipping credit:', claimed.referrer_id);
    // Row is already marked 'converted' — leave it there (no double-credit possible)
    return;
  }

  const planPrices = { Starter: 49700, Growth: 149700, Scale: 299700 }; // BRL centavos
  const creditCents = planPrices[referrerSub['Plan Name']] || planPrices.Starter;

  await stripe.customers.createBalanceTransaction(referrerSub['Customer ID'], {
    amount:      -creditCents,
    currency:    'brl',
    description: `Referral reward: 1 month free (referred ${refereeStripeCustomerId})`,
  });

  await supabaseAdmin
    .from('referrals')
    .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
    .eq('id', claimed.id);

  logger.info(`Referral rewarded: ${claimed.referral_code} -> credited R$${creditCents / 100} to ${referrerSub['Customer ID']}`);

  // Send reward notification email to the referrer
  try {
    const client = supabaseAdmin;
    const [{ data: referrerConfig }, { data: refereeConfig }] = await Promise.all([
      client
        .schema('restaurant')
        .from('restaurant_config')
        .select('email, name')
        .eq('id', claimed.referrer_id)
        .single(),
      client
        .schema('restaurant')
        .from('restaurant_config')
        .select('name')
        .eq('id', refereeRestaurantId)
        .single(),
    ]);

    if (referrerConfig?.email) {
      await sendReferralRewardEmail(referrerConfig.email, {
        referrerName: referrerConfig.name || null,
        refereeRestaurantName: refereeConfig?.name || null,
        creditAmount: creditCents,
      });
    } else {
      logger.warn('Referral reward email skipped: referrer email not found for restaurant:', claimed.referrer_id);
    }
  } catch (emailErr) {
    logger.error('Failed to send referral reward email (non-fatal):', emailErr.message);
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  setWebhookCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature. Stripe's HMAC is computed over the EXACT
    // raw request bytes; any re-serialisation (which JSON.stringify(req.body)
    // would do) reorders keys + drops whitespace and the signature check
    // fails. The previous code path used `req.rawBody ?? JSON.stringify(req.body)`
    // — that fallback would silently re-serialise a parsed body and let
    // attackers feed handcrafted events that "verify" against any signature.
    //
    // Accept the body in any form that's still the raw wire bytes:
    //   - req.rawBody (Buffer or string) — Vercel's standard exposure
    //   - req.body (Buffer) — alternate runtimes
    //   - req.body (string) — express-raw or similar middleware
    // PARSED OBJECT bodies are rejected — that's the dangerous case.
    let bodyForVerify = null;
    if (req.rawBody) {
      bodyForVerify = req.rawBody;
    } else if (Buffer.isBuffer(req.body)) {
      bodyForVerify = req.body;
    } else if (typeof req.body === 'string') {
      bodyForVerify = req.body;
    }
    if (!bodyForVerify) {
      logger.error('Webhook rejected: no raw body available for signature verification (parsed-body endpoint?)');
      return res.status(400).json({ error: 'Invalid webhook request' });
    }
    event = stripe.webhooks.constructEvent(bodyForVerify, sig, endpointSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid webhook request' });
  }

  // Idempotency guard: every Stripe event handler used to assume single
  // delivery, but Stripe retries every webhook on 5xx for ~3 days. Before
  // this guard, a duplicate `customer.subscription.deleted` could cancel
  // the same restaurant twice; `invoice.payment_succeeded` could send the
  // receipt email + claim the referral reward twice; `subscription.updated`
  // could re-run the plan transition. Atomic insert into
  // stripe_webhook_events_processed — if it succeeds we process; on 23505
  // (unique violation) we silently 200 and Stripe stops retrying.
  try {
    const { error: idempErr } = await supabaseAdmin
      .from('stripe_webhook_events_processed')
      .insert({ event_id: event.id, event_type: event.type });
    if (idempErr) {
      if (idempErr.code === '23505') {
        // Already processed by an earlier invocation. 200 so Stripe stops
        // retrying; no side effects.
        logger.info('Webhook event already processed, skipping', { event_id: event.id, type: event.type });
        return res.status(200).json({ received: true, deduplicated: true });
      }
      // Any other DB error here — log and continue. We'd rather process
      // the event once (double-send a receipt) than not at all
      // (lose a subscription event entirely).
      logger.error('Webhook idempotency insert failed (continuing)', { event_id: event.id, error: idempErr.message });
    }
  } catch (idempThrow) {
    logger.error('Webhook idempotency insert threw (continuing)', { event_id: event.id, error: idempThrow?.message });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        logger.info('Checkout session completed:', session.id);

        logger.info('Customer:', session.customer);
        logger.info('Subscription:', session.subscription);
        logger.info('Email:', session.customer_details?.email);
        logger.info('Metadata restaurant_id:', session.metadata?.restaurant_id || 'NOT SET');

        // Propagate restaurant_id to Stripe customer metadata so future events
        // (subscription.created, invoice, etc.) can resolve it without email lookup
        if (session.metadata?.restaurant_id && session.customer) {
          try {
            await stripe.customers.update(session.customer, {
              metadata: { restaurant_id: session.metadata.restaurant_id },
            });
            logger.info('Propagated restaurant_id to Stripe customer metadata:', session.customer);
          } catch (err) {
            logger.error('Failed to propagate restaurant_id to Stripe customer metadata:', err.message);
          }
        }

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
        const createRestaurantId = await resolveRestaurantId(subscriptionCreated, customer.email, event.type);
        if (!createRestaurantId) {
          logger.error('Cannot create subscription without restaurant_id. Subscription:', subscriptionCreated.id, 'Customer email:', customer.email, 'Customer ID:', subscriptionCreated.customer);
          // Throw to return 500 so Stripe retries this event
          throw new Error(`Cannot resolve restaurant for subscription ${subscriptionCreated.id}`);
        }

        // Idempotency guard: skip if subscription with this Stripe ID already exists
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('subscription_id', subscriptionCreated.id)
          .limit(1)
          .maybeSingle();

        if (existingSub) {
          logger.info('Subscription already exists in database, skipping creation:', subscriptionCreated.id);
          break;
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
        const updateRestaurantId = await resolveRestaurantId(subscriptionUpdated, updateCustomer.email, event.type);
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
        const deleteRestaurantId = await resolveRestaurantId(subscriptionDeleted, deleteCustomer.email, event.type);
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

        // Award referral reward on first subscription invoice only
        if (invoice.billing_reason === 'subscription_create' && invoice.amount_paid > 0) {
          try {
            const invoiceCustomer = await stripe.customers.retrieve(invoice.customer);
            const invoiceRestaurantId = await resolveRestaurantId(invoice, invoiceCustomer?.email || null, event.type);
            if (invoiceRestaurantId) {
              await rewardReferralIfEligible(invoiceRestaurantId, invoice.customer, stripe, logger);
            }
          } catch (referralErr) {
            logger.error('Referral reward failed (non-fatal):', referralErr.message);
          }
        }

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

      case 'payment_intent.succeeded':
        const succeededPI = event.data.object;
        // Only handle event bookings (skip deposits, subscriptions, etc.)
        if (succeededPI.metadata?.type === 'event_booking') {
          const eventBookingId = succeededPI.metadata?.booking_id;
          const eventPiId = succeededPI.id;
          logger.info('Event booking payment succeeded:', eventPiId);

          try {
            // Look up booking by stripe_payment_intent_id
            const { data: evtBooking, error: evtError } = await supabaseAdmin
              .schema('restaurant')
              .from('event_bookings')
              .select('id, party_size, payment_status')
              .eq('stripe_payment_intent_id', eventPiId)
              .single();

            if (evtError || !evtBooking) {
              logger.warn('Event booking not found for PI:', eventPiId);
              break;
            }

            if (evtBooking.payment_status === 'paid') {
              logger.info('Event booking already confirmed:', evtBooking.id);
              break;
            }

            // Atomically confirm via RPC
            const { data: confirmed } = await supabaseAdmin.rpc('confirm_event_booking', {
              p_booking_id: evtBooking.id,
              p_party_size: evtBooking.party_size,
            });

            if (confirmed) {
              logger.info('Event booking auto-confirmed via webhook:', evtBooking.id);
            } else {
              logger.error('Event booking auto-confirm failed (capacity?):', evtBooking.id);
            }
          } catch (evtErr) {
            logger.error('Event booking webhook handler error:', evtErr.message);
          }
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
    });
  }
};
