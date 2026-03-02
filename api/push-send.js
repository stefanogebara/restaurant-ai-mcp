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

webpush.setVapidDetails(
  'mailto:hello@seatable.io',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

module.exports = async (req, res) => {
  // Internal endpoint — secured with CRON_SECRET
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    logger.warn('VAPID keys not configured — push notifications disabled');
    return res.status(200).json({ success: true, sent: 0, message: 'VAPID keys not configured' });
  }

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

    const payload = JSON.stringify({ title, body, url: url || '/book' });
    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(sub.subscription, payload)
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      logger.warn(`Push send: ${sent} sent, ${failed} failed for reservation ${reservation_id}`);
    }

    return res.status(200).json({ success: true, sent, failed });
  } catch (err) {
    logger.error('Push send error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to send notifications' });
  }
};
