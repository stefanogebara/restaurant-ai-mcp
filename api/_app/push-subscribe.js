/**
 * Push Subscription Endpoint
 *
 * POST /api/push-subscribe
 * Body: { subscription: PushSubscription, reservation_id?: string, restaurant_id: string }
 *
 * Public endpoint (no auth required) — same pattern as portal.js.
 * Stores the Web Push subscription in customer_push_subscriptions table.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

const logger = createSecureLogger('PushSubscribe');

module.exports = async (req, res) => {
  // CORS for public endpoint
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'customer_portal');
  if (rateLimited) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { subscription, reservation_id, restaurant_id } = req.body || {};

  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth || !restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: subscription, restaurant_id',
    });
  }

  try {
    // Validate restaurant_id exists. .maybeSingle() so 0 rows returns
    // null instead of throwing PGRST116 (which masquerades as a 500).
    const { data: restaurant, error: lookupError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id')
      .eq('id', restaurant_id)
      .maybeSingle();
    if (lookupError) {
      logger.error('push-subscribe: restaurant lookup failed', lookupError.message);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    if (!restaurant) {
      return res.status(400).json({ success: false, error: 'Invalid restaurant' });
    }

    // Cap subscriptions per reservation to prevent storage flooding
    if (reservation_id) {
      const { count, error: countError } = await supabaseAdmin
        .from('customer_push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('reservation_id', reservation_id);
      if (countError) {
        logger.error('push-subscribe: subscription count check failed', countError.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
      if (count >= 10) {
        return res.status(429).json({ success: false, error: 'Too many subscriptions for this reservation' });
      }
    }

    const { error } = await supabaseAdmin
      .from('customer_push_subscriptions')
      .insert({
        restaurant_id,
        reservation_id: reservation_id || null,
        subscription,
      });

    if (error) {
      logger.error('Failed to save push subscription:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to save subscription' });
    }

    return res.status(201).json({ success: true });
  } catch (err) {
    logger.error('Push subscribe error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
