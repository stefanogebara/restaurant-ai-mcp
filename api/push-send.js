/**
 * Push Send Endpoint (Internal)
 *
 * POST /api/push-send
 * Body: { reservation_id: string, title: string, body: string, url?: string }
 *
 * Internal endpoint secured with CRON_SECRET Bearer token.
 * Sends Web Push notifications to all subscribers for a reservation.
 */

const webpush = require('web-push');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('PushSend');

// VAPID details are set inside the handler (C-1: avoid cold-start crash when keys absent)

module.exports = async (req, res) => {
  // Internal endpoint — secured with CRON_SECRET
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // C-1: Guard — return gracefully when VAPID keys are not configured
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    logger.warn('VAPID keys not configured — push notifications disabled');
    return res.status(200).json({ success: true, sent: 0, message: 'VAPID keys not configured' });
  }

  // C-1: Set VAPID details inside the handler so it only runs when keys are present
  webpush.setVapidDetails(
    'mailto:hello@seatable.one',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const { reservation_id, title, body, url } = req.body || {};

  if (!reservation_id || !title || !body) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: reservation_id, title, body',
    });
  }

  try {
    const { data: subscriptions, error } = await supabaseAdmin
      .from('customer_push_subscriptions')
      .select('id, subscription')
      .eq('reservation_id', reservation_id);

    if (error || !subscriptions?.length) {
      return res.status(200).json({ success: true, sent: 0, message: 'No subscriptions found' });
    }

    // C-2: Nest url inside data so sw.js can read event.notification.data?.url
    const payload = JSON.stringify({ title, body, data: { url: url || '/book' } });

    // I-4: Sequential loop to detect and clean up expired subscriptions
    let sent = 0;
    let failed = 0;
    const expiredIds = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        // 410 Gone or 404 Not Found means the subscription has expired
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredIds.push(sub.id);
        } else {
          logger.warn(`Push failed for sub ${sub.id}: ${err.message}`);
        }
      }
    }

    // I-4: Delete expired subscriptions in a single batch query
    if (expiredIds.length > 0) {
      await supabaseAdmin
        .from('customer_push_subscriptions')
        .delete()
        .in('id', expiredIds);
      logger.info(`Deleted ${expiredIds.length} expired push subscriptions`);
    }

    if (failed > 0) {
      logger.warn(`Push send: ${sent} sent, ${failed} failed for reservation ${reservation_id}`);
    }

    return res.status(200).json({ success: true, sent, failed });
  } catch (err) {
    logger.error('Push send error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to send notifications' });
  }
};
