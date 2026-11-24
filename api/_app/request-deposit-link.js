/**
 * POST /api/request-deposit-link
 *
 * Returns a shareable Checkout URL for a tenant's existing reservation.
 * A pending link never writes a PaymentIntent to the reservation. Attachment
 * happens only after verification of a completed Checkout authorization.
 */

const Stripe = require('stripe');
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const {
  stripeMode, read, quoteDeposit, connectDestination, startAttempt, beginAttempt, openCheckout,
} = require('./_lib/hosted-reservation-deposit');

const logger = createSecureLogger('request-deposit-link');
let stripe;

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = await verifyJWT(token).catch(() => null);
  if (!user?.restaurant_id) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { reservation_id: code } = req.body || {};
  if (typeof code !== 'string' || !code.trim() || code.length > 255) {
    return res.status(400).json({ success: false, error: 'reservation_id is required' });
  }

  const restaurantId = user.restaurant_id;
  const db = supabaseAdmin;
  try {
    const reservation = await read(db.from('reservations')
      .select('id, reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, status, deposit_payment_intent_id, deposit_amount')
      .eq('restaurant_id', restaurantId).eq('reservation_id', code).maybeSingle(), 'Could not read reservation');
    if (!reservation) return missingReservation(res);
    if (reservation.deposit_payment_intent_id || Number(reservation.deposit_amount) > 0) return alreadyRequested(res);
    if (!['confirmed', 'pending'].includes(reservation.status?.toLowerCase())) {
      return res.status(409).json({ success: false, error: 'Reservation is no longer eligible for a deposit' });
    }

    const restaurant = db.schema('restaurant');
    const config = await read(restaurant.from('restaurant_config').select('deposit_config, restaurant_name, country, slug')
      .eq('id', restaurantId).maybeSingle(), 'Could not read restaurant config');
    if (!config) return res.status(404).json({ success: false, error: 'Restaurant config not found' });

    const quote = quoteDeposit(config, reservation.party_size);
    if (quote.error) return res.status(400).json({ success: false, error: quote.error });

    const account = await read(restaurant.from('stripe_connect_accounts')
      .select('stripe_account_id, status, charges_enabled, default_currency')
      .eq('restaurant_id', restaurantId).maybeSingle(), 'Could not read Stripe Connect route');
    const destination = connectDestination(account, quote.currency);
    const livemode = stripeMode(process.env.STRIPE_SECRET_KEY);
    const baseUrl = (process.env.CLIENT_URL || 'https://seatable.one').replace(/\/$/, '');
    const proposed = startAttempt({ restaurantId, reservation, config, baseUrl, destination, livemode, ...quote });
    const { result, attempt } = await beginAttempt(db, proposed);
    if (result === 'missing') return missingReservation(res);
    if (result === 'already_requested') return alreadyRequested(res);
    if (result === 'reservation_changed') {
      return res.status(409).json({ success: false, error: 'Reservation changed. Refresh it before requesting a deposit.' });
    }
    if (result !== 'pending') throw new Error('Could not recover hosted deposit attempt');

    if (!stripe) stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const checkout = await openCheckout(db, stripe, attempt);
    if (checkout.result === 'attached') return alreadyRequested(res);
    if (checkout.result !== 'open') {
      return res.status(409).json({ success: false, error: 'Deposit link is unavailable. Refresh the reservation and try again.' });
    }
    const amount = attempt.amount_minor / 100;
    return res.status(200).json({
      success: true,
      checkout_url: checkout.url,
      payment_intent_id: null,
      deposit_amount: amount,
      currency: attempt.currency,
      whatsapp_message: buildWhatsAppMessage({
        customerName: reservation.customer_name,
        restaurantName: config.restaurant_name,
        date: attempt.booking_date,
        time: attempt.booking_time.slice(0, 5),
        amount,
        currency: attempt.currency,
        link: checkout.url,
      }),
      customer_phone: reservation.customer_phone || null,
    });
  } catch (error) {
    logger.error('Could not generate hosted deposit link', { code: error.code || error.cause?.code, reason: error.type || error.message });
    return res.status(500).json({ success: false, error: 'Failed to generate deposit link' });
  }
};

function missingReservation(res) {
  return res.status(404).json({ success: false, error: 'Reservation not found' });
}

function alreadyRequested(res) {
  return res.status(409).json({
    success: false,
    error: 'Deposit already requested for this reservation',
    already_requested: true,
  });
}

function buildWhatsAppMessage({ customerName, restaurantName, date, time, amount, currency, link }) {
  const name = customerName || 'there';
  const dateLabel = date || 'your booking';
  const timeLabel = time ? ` at ${time}` : '';
  const amt = `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  return [
    `Hi ${name},`,
    `For your reservation at ${restaurantName} on ${dateLabel}${timeLabel}, please authorize a deposit of ${amt} here:`,
    link,
    `Thanks!`,
  ].join('\n');
}
