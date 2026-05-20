/**
 * Stripe Usage Reporter
 *
 * Reports usage data from the usage_tracking table to Stripe's metered billing.
 * Uses the Stripe Meter Events API (2025+) — meters are backed by Stripe Meters
 * created via scripts/setup-stripe-metered-prices.js.
 *
 * Flow:
 *   1. Cron (or manual call) triggers reportAllUsage()
 *   2. For each active subscription, query usage_tracking for unreported rows
 *   3. Report usage to Stripe via billing.meterEvents.create() per customer
 *   4. Mark usage as reported in DB
 *
 * Meter event names (configured in Stripe via setup script):
 *   seatable_reservation  → STRIPE_METERED_PRICE_RESERVATION
 *   seatable_ai_call      → STRIPE_METERED_PRICE_AI_CALL
 *   seatable_sms          → STRIPE_METERED_PRICE_SMS
 *   seatable_whatsapp     → STRIPE_METERED_PRICE_WHATSAPP
 *   seatable_manager_ai   → STRIPE_METERED_PRICE_MANAGER_AI
 */

const Stripe = require('stripe');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('StripeUsageReporter');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ============ METRIC → STRIPE METER EVENT MAPPING ============

/**
 * Maps internal metric types to Stripe Meter event names.
 * Only metrics with a configured price ID will be reported to Stripe.
 * Meters were created via scripts/setup-stripe-metered-prices.js.
 *
 * Each mapping has a `delta` field:
 *   delta=+1 → add this metric's count to the meter total (default)
 *   delta=-1 → subtract from the meter total (used for cancellations)
 *
 * Cancellations net against creations so we don't charge the restaurant
 * for a booking that the customer or owner cancelled before service.
 * Stripe Meter Events API doesn't accept negative values — we floor
 * the net at 0 before sending (caller side).
 */
function getMeteredPriceMap() {
  const map = {};

  if (process.env.STRIPE_METERED_PRICE_RESERVATION) {
    map.reservation_created  = { priceId: process.env.STRIPE_METERED_PRICE_RESERVATION, eventName: 'seatable_reservation', delta: +1 };
    map.portal_booking       = { priceId: process.env.STRIPE_METERED_PRICE_RESERVATION, eventName: 'seatable_reservation', delta: +1 };
    map.whatsapp_reservation = { priceId: process.env.STRIPE_METERED_PRICE_RESERVATION, eventName: 'seatable_reservation', delta: +1 };
    // Cancellations nett against creations — bookings that never
    // happened shouldn't bill the restaurant.
    map.reservation_cancelled = { priceId: process.env.STRIPE_METERED_PRICE_RESERVATION, eventName: 'seatable_reservation', delta: -1 };
  }

  if (process.env.STRIPE_METERED_PRICE_AI_CALL) {
    map.ai_call_completed = { priceId: process.env.STRIPE_METERED_PRICE_AI_CALL, eventName: 'seatable_ai_call', delta: +1 };
  }

  if (process.env.STRIPE_METERED_PRICE_SMS) {
    map.sms_sent = { priceId: process.env.STRIPE_METERED_PRICE_SMS, eventName: 'seatable_sms', delta: +1 };
  }

  if (process.env.STRIPE_METERED_PRICE_MANAGER_AI) {
    map.manager_ai_call = { priceId: process.env.STRIPE_METERED_PRICE_MANAGER_AI, eventName: 'seatable_manager_ai', delta: +1 };
  }

  if (process.env.STRIPE_METERED_PRICE_WHATSAPP) {
    map.whatsapp_reservation = { priceId: process.env.STRIPE_METERED_PRICE_WHATSAPP, eventName: 'seatable_whatsapp', delta: +1 };
  }

  return map;
}

// ============ CORE REPORTING ============

/**
 * Report usage for a single restaurant's subscription to Stripe.
 *
 * @param {object} subscription - Subscription record from DB
 * @param {string} subscription.subscription_id - Stripe subscription ID
 * @param {string} subscription.restaurant_id - Restaurant UUID
 * @param {string} subscription.current_period_start - Billing period start (YYYY-MM-DD)
 * @returns {Promise<{reported: number, errors: number}>}
 */
async function reportUsageForSubscription(subscription) {
  const {
    subscription_id: stripeSubId,
    restaurant_id: restaurantId,
    current_period_start: periodStart,
  } = subscription;

  if (!stripeSubId || stripeSubId === 'onboarding-plan') {
    return { reported: 0, errors: 0, skipped: 'no_stripe_subscription' };
  }

  const meteredPriceMap = getMeteredPriceMap();
  if (Object.keys(meteredPriceMap).length === 0) {
    return { reported: 0, errors: 0, skipped: 'no_metered_prices_configured' };
  }

  let reported = 0;
  let errors = 0;

  try {
    // Verify the subscription is active in Stripe
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    if (stripeSub.status !== 'active' && stripeSub.status !== 'trialing') {
      return { reported: 0, errors: 0, skipped: `subscription_${stripeSub.status}` };
    }

    // Resolve the Stripe customer ID (needed for Meter Events)
    const stripeCustomerId = typeof stripeSub.customer === 'string'
      ? stripeSub.customer
      : stripeSub.customer.id;

    // Get unreported usage since the billing period start
    const startDate = periodStart || new Date(stripeSub.current_period_start * 1000).toISOString().split('T')[0];

    const { data: usageRows, error: queryError } = await supabaseAdmin
      .from('usage_tracking')
      .select('id, metric_type, count, period')
      .eq('restaurant_id', restaurantId)
      .gte('period', startDate)
      .is('reported_to_stripe', null);

    if (queryError) {
      logger.error('Failed to query usage_tracking', { restaurantId, error: queryError.message });
      return { reported: 0, errors: 1, skipped: null };
    }

    if (!usageRows || usageRows.length === 0) {
      return { reported: 0, errors: 0, skipped: 'no_unreported_usage' };
    }

    // Group by meter event name and sum (delta-weighted) counts.
    // The `delta` on each mapping is +1 for creations / -1 for
    // cancellations, so the aggregator naturally produces the NET
    // billable count per meter event without a second pass.
    const eventTotals = {}; // { eventName: { total, rowIds } }
    const allRowIds = [];

    for (const row of usageRows) {
      const mapping = meteredPriceMap[row.metric_type];
      if (!mapping) continue; // Metric not billable

      const { eventName, delta = 1 } = mapping;
      if (!eventTotals[eventName]) {
        eventTotals[eventName] = { total: 0, rowIds: [] };
      }
      eventTotals[eventName].total += row.count * delta;
      eventTotals[eventName].rowIds.push(row.id);
      allRowIds.push(row.id);
    }

    // Report each metric total to Stripe via Meter Events API.
    //
    // Two correctness guarantees layered together:
    //
    //   1. IDEMPOTENCY KEY (R.3): Stripe meter events accept `identifier`
    //      in the payload — events with the same (stripe_customer_id,
    //      identifier) within 24h are dedup'd by Stripe. If the cron
    //      retries (Vercel restart, ops replay), the second send is a
    //      no-op rather than a double-charge. The key is deterministic:
    //      ${restaurantId}-${eventName}-${UTC date}, so the same logical
    //      "today's usage for this metric" maps to one event ID.
    //
    //   2. PER-EVENT SUCCESS TRACKING (R.4): Previously the code marked
    //      ALL rows as reported as long as ANY event succeeded. If
    //      meterEvents.create succeeded for `reservation_created` but
    //      threw for `ai_call_completed`, the ai_call rows were marked
    //      reported anyway and that usage was permanently lost. Now we
    //      track which event names succeeded and only mark THOSE rows;
    //      the failed-event rows stay unreported and the next cron run
    //      picks them back up.
    const todayUtc = new Date().toISOString().split('T')[0];
    const succeededRowIds = [];

    for (const [eventName, { total, rowIds }] of Object.entries(eventTotals)) {
      // Floor at 0 — Stripe Meter Events API rejects negative values.
      // A net-negative happens when cancellations in this reporting
      // window exceed creations from the same window (e.g. all of
      // today's cancellations refer to bookings made BEFORE this
      // window). Floor + mark all rows reported so the next cron run
      // doesn't replay them. Any "credit" the customer is owed is
      // surfaced via the cancellation log + manual refund flow, not
      // by sending negative meter values.
      const netValue = Math.max(0, total);
      try {
        await stripe.billing.meterEvents.create({
          event_name: eventName,
          payload: {
            stripe_customer_id: stripeCustomerId,
            value: String(netValue),
          },
          identifier: `${restaurantId}-${eventName}-${todayUtc}`,
        });

        reported += netValue;
        succeededRowIds.push(...rowIds);
        logger.info('Reported meter event to Stripe', {
          eventName,
          netValue,
          rawTotal: total, // includes negative deltas from cancellations
          stripeCustomerId,
          restaurantId,
        });
      } catch (stripeErr) {
        errors++;
        logger.error('Stripe meterEvents.create failed', {
          eventName,
          error: stripeErr.message,
        });
        // Intentionally NOT pushing this event's rowIds into
        // succeededRowIds — those rows stay unreported so the next cron
        // run will retry them.
      }
    }

    // Mark only the rows whose event actually succeeded.
    if (succeededRowIds.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('usage_tracking')
        .update({ reported_to_stripe: new Date().toISOString() })
        .in('id', succeededRowIds);

      if (updateError) {
        logger.error('Failed to mark usage as reported', { error: updateError.message });
      }
    }
  } catch (err) {
    logger.error('reportUsageForSubscription failed', {
      stripeSubId,
      restaurantId,
      error: err.message,
    });
    errors++;
  }

  return { reported, errors, skipped: null };
}

/**
 * Report usage for ALL active subscriptions.
 * Meant to be called by a daily cron job.
 *
 * @returns {Promise<{total_reported: number, total_errors: number, subscriptions_processed: number}>}
 */
async function reportAllUsage() {
  if (!supabaseAdmin) {
    logger.error('supabaseAdmin not available');
    return { total_reported: 0, total_errors: 1, subscriptions_processed: 0 };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    logger.error('STRIPE_SECRET_KEY not configured');
    return { total_reported: 0, total_errors: 1, subscriptions_processed: 0 };
  }

  // Get all active subscriptions with Stripe subscription IDs
  const { data: subscriptions, error } = await supabaseAdmin
    .from('subscriptions')
    .select('subscription_id, restaurant_id, current_period_start, status')
    .in('status', ['active', 'trialing'])
    .not('subscription_id', 'is', null);

  if (error) {
    logger.error('Failed to fetch active subscriptions', { error: error.message });
    return { total_reported: 0, total_errors: 1, subscriptions_processed: 0 };
  }

  if (!subscriptions || subscriptions.length === 0) {
    logger.info('No active subscriptions to report usage for');
    return { total_reported: 0, total_errors: 0, subscriptions_processed: 0 };
  }

  let totalReported = 0;
  let totalErrors = 0;

  for (const sub of subscriptions) {
    const result = await reportUsageForSubscription(sub);
    totalReported += result.reported;
    totalErrors += result.errors;

    if (result.skipped) {
      logger.info('Skipped subscription', {
        subscription_id: sub.subscription_id,
        reason: result.skipped,
      });
    }
  }

  logger.info('Usage reporting complete', {
    subscriptions_processed: subscriptions.length,
    total_reported: totalReported,
    total_errors: totalErrors,
  });

  return {
    total_reported: totalReported,
    total_errors: totalErrors,
    subscriptions_processed: subscriptions.length,
  };
}

module.exports = {
  reportUsageForSubscription,
  reportAllUsage,
  getMeteredPriceMap,
};
