/**
 * Square webhook receiver.
 *
 * Square POSTs payment + order events here whenever a transaction lands
 * at a connected restaurant. We:
 *
 *   1. Read the raw body (signature verification requires the exact bytes
 *      Square hashed, so we can't let bodyParser run).
 *   2. Verify x-square-hmacsha256-signature using SQUARE_WEBHOOK_SIGNATURE_KEY.
 *      The hash covers `notification_url + raw_body`.
 *   3. Route on event.type. Only `payment.created` / `payment.updated` (when
 *      it lands at 'COMPLETED' status) drive revenue ingestion right now.
 *   4. Look up the restaurant via merchant_id from pos_connections.
 *   5. Use the reservation-matcher to find the associated booking.
 *   6. Call recordServiceCompletion() with pos_provider='square' and
 *      pos_transaction_id=payment.id for idempotency.
 *
 * Always return 200 to Square once we've finished. Square retries on
 * non-2xx responses, so a 500 here means we'll see the same event again
 * in seconds — fine for genuine 5xx, expensive otherwise. We catch all
 * errors below and respond 200 with a status body instead.
 *
 * Required env:
 *   SQUARE_WEBHOOK_SIGNATURE_KEY  — from Square Dashboard → Webhooks
 *   SQUARE_WEBHOOK_NOTIFICATION_URL — the URL we registered with Square
 *                                     (e.g. https://seatable.one/api/square/webhook).
 *                                     Square's HMAC is over (URL + body), so
 *                                     this must match exactly.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { recordServiceCompletion } = require('./_lib/pos/service-completion-core');
const { matchPaymentToReservation } = require('./_lib/pos/reservation-matcher');

const logger = createSecureLogger('square-webhook');

// Disable bodyParser so we can read the raw bytes for signature verification.
module.exports.config = { api: { bodyParser: false } };

const SIG_HEADER = 'x-square-hmacsha256-signature';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ---- 1. Read raw body --------------------------------------------------
  const chunks = [];
  try {
    await new Promise((resolve, reject) => {
      req.on('data', (c) => chunks.push(c));
      req.on('end', resolve);
      req.on('error', reject);
    });
  } catch (err) {
    logger.error('square-webhook: failed to read body', { error: err.message });
    return res.status(400).json({ error: 'Could not read body' });
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');

  // ---- 2. Verify signature ----------------------------------------------
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL
    || `${process.env.CLIENT_URL || 'https://seatable.one'}/api/square/webhook`;

  if (!signatureKey) {
    logger.error('square-webhook: SQUARE_WEBHOOK_SIGNATURE_KEY not configured — rejecting all events');
    return res.status(503).json({ error: 'webhook not configured' });
  }

  const sigHeader = req.headers[SIG_HEADER];
  if (!sigHeader) {
    logger.warn('square-webhook: missing signature header');
    return res.status(401).json({ error: 'signature required' });
  }

  const expected = crypto
    .createHmac('sha256', signatureKey)
    .update(notificationUrl + rawBody, 'utf8')
    .digest('base64');

  // Constant-time compare to avoid timing leaks. Buffer.compare returns 0
  // on equal lengths; timingSafeEqual throws if the lengths differ, which
  // by itself is a soft signal we want to swallow.
  const ok = (() => {
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(sigHeader);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
  })();

  if (!ok) {
    logger.warn('square-webhook: signature mismatch');
    return res.status(401).json({ error: 'signature mismatch' });
  }

  // ---- 3. Parse + route --------------------------------------------------
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'invalid JSON' });
  }

  const eventType = event.type;
  const merchantId = event.merchant_id;
  if (!eventType || !merchantId) {
    return res.status(400).json({ error: 'missing event.type or merchant_id' });
  }

  // Only payment events drive revenue right now. Other event types (refunds,
  // orders.fulfilled, etc.) acknowledged but no-op. Square stops retrying
  // once we 200 so this is the right answer.
  if (eventType !== 'payment.created' && eventType !== 'payment.updated') {
    logger.info('square-webhook: event acknowledged but no-op', { eventType });
    return res.status(200).json({ ok: true, skipped: 'unsupported_event_type', eventType });
  }

  const payment = event.data?.object?.payment;
  if (!payment) {
    return res.status(400).json({ error: 'missing payment object' });
  }

  // Skip non-final statuses; payment.updated fires multiple times.
  if (payment.status && payment.status !== 'COMPLETED') {
    return res.status(200).json({ ok: true, skipped: 'non_final_status', status: payment.status });
  }

  // ---- 4. Resolve restaurant via merchant_id ----------------------------
  const { data: connection, error: connError } = await supabaseAdmin
    .schema('restaurant')
    .from('pos_connections')
    .select('restaurant_id, status')
    .eq('merchant_id', merchantId)
    .eq('pos_provider', 'square')
    .neq('status', 'disconnected')
    .maybeSingle();

  if (connError || !connection?.restaurant_id) {
    logger.warn('square-webhook: no active connection for merchant', { merchantId, eventType });
    // Acknowledge so Square stops retrying; the operator can connect later.
    return res.status(200).json({ ok: true, skipped: 'no_connection' });
  }

  const restaurantId = connection.restaurant_id;

  // ---- 5. Extract fields + reservation match ----------------------------
  // Square stores amount in the smallest currency unit (e.g. cents).
  const amountMoney = payment.amount_money || payment.total_money || {};
  const amountUnits = (Number(amountMoney.amount) || 0) / 100;
  const currency = amountMoney.currency || 'BRL';
  const paymentMethod = payment.source_type
    ? String(payment.source_type).toLowerCase()
    : (payment.card_details ? 'card' : null);
  const customerPhone =
    payment.buyer_phone_number ||
    payment.shipping_address?.phone ||
    null;
  // Square's `customer.full_name` isn't always populated; fall back.
  const customerName =
    payment.note ||
    payment.reference_id ||
    payment.buyer_email_address ||
    'Square customer';
  const partySize = 2; // Reasonable default; we update from the matched reservation later.

  const paymentTime = payment.created_at || event.created_at || new Date().toISOString();

  const { reservation_id, strategy } = await matchPaymentToReservation({
    restaurantId,
    customerPhone,
    paymentTime,
  });

  // If the matcher found a reservation, lift its party_size onto the record
  // so the LTV math uses the right cover count.
  let resolvedPartySize = partySize;
  let resolvedCustomerName = customerName;
  let resolvedCustomerPhone = customerPhone || 'unknown';
  if (reservation_id) {
    const { data: res } = await supabaseAdmin
      .from('reservations')
      .select('party_size, customer_name, customer_phone')
      .eq('restaurant_id', restaurantId)
      .eq('reservation_id', reservation_id)
      .single();
    if (res) {
      resolvedPartySize = res.party_size || partySize;
      resolvedCustomerName = res.customer_name || customerName;
      resolvedCustomerPhone = res.customer_phone || resolvedCustomerPhone;
    }
  }

  // ---- 6. Record completion via shared core -----------------------------
  const result = await recordServiceCompletion({
    restaurantId,
    customerPhone: resolvedCustomerPhone,
    customerName: resolvedCustomerName,
    partySize: resolvedPartySize,
    totalBill: amountUnits,
    paymentMethod,
    reservationId: reservation_id,
    posProvider: 'square',
    posTransactionId: payment.id,
    currency,
  });

  if (!result.ok) {
    logger.error('square-webhook: recordServiceCompletion failed', {
      restaurantId, error: result.error,
    });
    // Still 200 — Square retries are expensive and the failure is ours.
    return res.status(200).json({ ok: false, error: result.error });
  }

  return res.status(200).json({
    ok: true,
    service_id: result.service_id,
    revenue_id: result.revenue_id,
    reservation_match: strategy,
    duplicate: !!result.duplicate,
  });
};
