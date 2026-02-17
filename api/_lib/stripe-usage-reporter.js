/**
 * Stripe Usage Reporter
 *
 * Reports usage data from the usage_tracking table to Stripe's metered billing.
 * Stripe uses subscription items with metered prices to bill based on actual usage.
 *
 * Flow:
 *   1. Cron (or manual call) triggers reportAllUsage()
 *   2. For each active subscription with metered items, query usage_tracking
 *   3. Report unreported usage to Stripe via createUsageRecord()
 *   4. Mark usage as reported in DB
 *
 * Metric types and their Stripe metered price IDs are configured via env vars:
 *   STRIPE_METERED_PRICE_RESERVATION  - Per-reservation charge
 *   STRIPE_METERED_PRICE_AI_CALL      - Per-AI-call charge
 *   STRIPE_METERED_PRICE_SMS          - Per-SMS charge
 *   STRIPE_METERED_PRICE_WHATSAPP     - Per-WhatsApp-reservation charge
 */

const Stripe = require('stripe');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('StripeUsageReporter');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ============ METRIC → STRIPE PRICE MAPPING ============

/**
 * Maps internal metric types to Stripe metered price IDs.
 * Only metrics with a configured price ID will be reported to Stripe.
 */
function getMeteredPriceMap() {
  const map = {};

  if (process.env.STRIPE_METERED_PRICE_RESERVATION) {
    map.reservation_created = process.env.STRIPE_METERED_PRICE_RESERVATION;
    map.portal_booking = process.env.STRIPE_METERED_PRICE_RESERVATION;
    map.whatsapp_reservation = process.env.STRIPE_METERED_PRICE_RESERVATION;
  }

  if (process.env.STRIPE_METERED_PRICE_AI_CALL) {
    map.ai_call_completed = process.env.STRIPE_METERED_PRICE_AI_CALL;
  }

  if (process.env.STRIPE_METERED_PRICE_SMS) {
    map.sms_sent = process.env.STRIPE_METERED_PRICE_SMS;
  }

  if (process.env.STRIPE_METERED_PRICE_WHATSAPP) {
    // Override whatsapp-specific price if set separately
    map.whatsapp_reservation = process.env.STRIPE_METERED_PRICE_WHATSAPP;
  }

  // Reservation overage prices (plan-specific)
  if (process.env.STRIPE_OVERAGE_STARTER_PRICE_ID) {
    map.reservation_overage_starter = process.env.STRIPE_OVERAGE_STARTER_PRICE_ID;
  }
  if (process.env.STRIPE_OVERAGE_GROWTH_PRICE_ID) {
    map.reservation_overage_growth = process.env.STRIPE_OVERAGE_GROWTH_PRICE_ID;
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
    // Fetch the Stripe subscription to get subscription item IDs
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, {
      expand: ['items.data'],
    });

    if (stripeSub.status !== 'active' && stripeSub.status !== 'trialing') {
      return { reported: 0, errors: 0, skipped: `subscription_${stripeSub.status}` };
    }

    // Build a map of price_id → subscription_item_id
    const priceToItemId = {};
    for (const item of stripeSub.items.data) {
      priceToItemId[item.price.id] = item.id;
    }

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

    // Group by metric type and sum counts
    const metricTotals = {};
    const rowIds = [];
    for (const row of usageRows) {
      const priceId = meteredPriceMap[row.metric_type];
      if (!priceId) continue; // Metric not billable

      if (!metricTotals[priceId]) {
        metricTotals[priceId] = 0;
      }
      metricTotals[priceId] += row.count;
      rowIds.push(row.id);
    }

    // Report each metric total to Stripe
    for (const [priceId, quantity] of Object.entries(metricTotals)) {
      const subscriptionItemId = priceToItemId[priceId];
      if (!subscriptionItemId) {
        logger.warn('No subscription item for metered price', { priceId, stripeSubId });
        continue;
      }

      try {
        await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
          quantity,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'set', // 'set' replaces the current period total; 'increment' adds to it
        });

        reported += quantity;
        logger.info('Reported usage to Stripe', {
          subscriptionItemId,
          priceId,
          quantity,
          restaurantId,
        });
      } catch (stripeErr) {
        errors++;
        logger.error('Stripe createUsageRecord failed', {
          subscriptionItemId,
          priceId,
          error: stripeErr.message,
        });
      }
    }

    // Mark rows as reported
    if (rowIds.length > 0 && reported > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('usage_tracking')
        .update({ reported_to_stripe: new Date().toISOString() })
        .in('id', rowIds);

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
