/**
 * Outbound Webhook Dispatcher
 *
 * Dispatches events to registered webhook subscriptions.
 * Uses HMAC-SHA256 signature in X-Webhook-Signature header.
 * Retries 3 times with exponential backoff.
 * Auto-disables after 10 consecutive failures.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('WebhookDispatcher');

const MAX_RETRIES = 3;
const MAX_FAILURES_BEFORE_DISABLE = 10;
const BASE_DELAY_MS = 1000;

/**
 * Sign a payload with HMAC-SHA256
 * @param {string} payload - JSON string
 * @param {string} secret - Webhook secret
 * @returns {string} Hex-encoded HMAC signature
 */
function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Dispatch an event to all matching webhook subscriptions
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} eventType - Event type (e.g., 'service.completed')
 * @param {object} payload - Event payload data
 */
async function dispatchEvent(restaurantId, eventType, payload) {
  if (!supabaseAdmin) {
    logger.warn('Supabase not available, skipping webhook dispatch');
    return;
  }

  // Find active subscriptions for this event
  const { data: subscriptions, error } = await supabaseAdmin
    .schema('restaurant')
    .from('webhook_subscriptions')
    .select('id, url, secret, events, failure_count')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

  if (error) {
    logger.error('Failed to fetch webhook subscriptions', error);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    return;
  }

  // Filter to subscriptions that listen for this event type
  const matching = subscriptions.filter(
    (sub) => sub.events.includes('*') || sub.events.includes(eventType)
  );

  if (matching.length === 0) {
    return;
  }

  const envelope = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  // Dispatch to all matching subscriptions in parallel
  const results = await Promise.allSettled(
    matching.map((sub) => deliverWebhook(sub, envelope))
  );

  const successes = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
  const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

  if (failures > 0) {
    logger.warn('Some webhook deliveries failed', {
      event: eventType,
      successes,
      failures,
      total: matching.length,
    });
  }
}

/**
 * Deliver a webhook to a single subscription with retries
 * @param {object} subscription - Webhook subscription record
 * @param {object} envelope - Event envelope { event, timestamp, data }
 * @returns {Promise<{success: boolean}>}
 */
async function deliverWebhook(subscription, envelope) {
  const jsonPayload = JSON.stringify(envelope);
  const signature = signPayload(jsonPayload, subscription.secret);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': envelope.event,
          'User-Agent': 'Seatable-Webhooks/1.0',
        },
        body: jsonPayload,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        // Reset failure count and update last_triggered_at
        await supabaseAdmin
          .schema('restaurant')
          .from('webhook_subscriptions')
          .update({
            failure_count: 0,
            last_triggered_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);

        return { success: true };
      }

      logger.warn('Webhook delivery got non-OK response', {
        url: subscription.url,
        status: response.status,
        attempt: attempt + 1,
      });
    } catch (err) {
      logger.warn('Webhook delivery attempt failed', {
        url: subscription.url,
        attempt: attempt + 1,
        error: err.message,
      });
    }

    // Exponential backoff (skip on last attempt)
    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted — increment failure count
  const newFailureCount = (subscription.failure_count || 0) + 1;
  const updates = { failure_count: newFailureCount };

  // Auto-disable after too many consecutive failures
  if (newFailureCount >= MAX_FAILURES_BEFORE_DISABLE) {
    updates.is_active = false;
    logger.error('Webhook auto-disabled after consecutive failures', {
      id: subscription.id,
      url: subscription.url,
      failures: newFailureCount,
    });
  }

  await supabaseAdmin
    .schema('restaurant')
    .from('webhook_subscriptions')
    .update(updates)
    .eq('id', subscription.id);

  return { success: false };
}

module.exports = {
  dispatchEvent,
  signPayload,
};
