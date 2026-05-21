/**
 * POST /api/request-deposit-link
 *
 * Phase AA wiring — the manager clicks the deposit-suggest chip on a
 * high-risk reservation. We:
 *   1. Verify the reservation belongs to the caller's tenant (RLS-grade
 *      check via JWT.restaurant_id).
 *   2. Load deposit_config + country to compute amount and currency.
 *   3. Create a Stripe Checkout Session (capture_method=manual so it's a
 *      pre-auth hold, mirroring booking-time deposit behaviour).
 *   4. Persist the resulting payment_intent_id on the reservation so the
 *      chip disappears immediately and we don't double-charge on retry.
 *   5. Return the hosted Checkout URL — the dashboard hands it to the
 *      manager who copies / WhatsApps it to the guest.
 *
 * Auth: JWT (host/manager). Rate-limited.
 */

const Stripe = require('stripe');
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { resolveDepositCurrency, minChargeAmount } = require('./_lib/currency');

const logger = createSecureLogger('request-deposit-link');

let stripe;
function getStripe() {
  if (!stripe) stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  // ---- Auth ---------------------------------------------------------------
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = await verifyJWT(token).catch(() => null);
  if (!user?.restaurant_id) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const restaurantId = user.restaurant_id;

  const { reservation_id } = req.body || {};
  if (!reservation_id) {
    return res.status(400).json({ success: false, error: 'reservation_id is required' });
  }

  try {
    // ---- 1. Reservation lookup, scoped by tenant -------------------------
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, deposit_payment_intent_id')
      .eq('restaurant_id', restaurantId)
      .eq('reservation_id', reservation_id)
      .maybeSingle();

    if (resErr) {
      logger.error('reservation lookup failed', { error: resErr.message, reservation_id });
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    if (!reservation) {
      // Either doesn't exist OR belongs to another tenant — same answer.
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    if (reservation.deposit_payment_intent_id) {
      return res.status(409).json({
        success: false,
        error: 'Deposit already requested for this reservation',
        already_requested: true,
      });
    }

    // ---- 2. Deposit config + currency -----------------------------------
    const { data: config, error: configErr } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('deposit_config, restaurant_name, country, slug')
      .eq('id', restaurantId)
      .single();
    if (configErr || !config) {
      return res.status(404).json({ success: false, error: 'Restaurant config not found' });
    }
    const depositConfig = config.deposit_config || { enabled: false };
    if (!depositConfig.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Deposits are not enabled for this restaurant. Enable them in Settings first.',
      });
    }

    const partySize = reservation.party_size || 1;
    const depositAmount = depositConfig.type === 'per_person'
      ? Number(depositConfig.amount) * partySize
      : Number(depositConfig.amount);

    if (!(depositAmount > 0)) {
      return res.status(400).json({ success: false, error: 'Invalid deposit amount in config' });
    }

    const currency = resolveDepositCurrency(config.country, depositConfig.currency);
    const minAmount = minChargeAmount(currency);
    if (depositAmount < minAmount) {
      return res.status(400).json({
        success: false,
        error: `Deposit amount too small (minimum ${currency.toUpperCase()} ${minAmount.toFixed(2)})`,
      });
    }

    // ---- 3. Stripe Checkout Session (hosted page) -----------------------
    const baseUrl = process.env.CLIENT_URL || 'https://seatable.one';
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(depositAmount * 100),
            product_data: {
              name: `Deposit — ${config.restaurant_name}`,
              description: `${partySize} guest${partySize === 1 ? '' : 's'} on ${reservation.date} at ${(reservation.time || '').slice(0, 5)}`,
            },
          },
        },
      ],
      // capture_method=manual so the deposit is a pre-auth HOLD on the card
      // until either capture_deposit (no-show) or release_deposit (arrival).
      // Mirrors the existing booking-time flow.
      payment_intent_data: {
        capture_method: 'manual',
        description: `Reservation deposit at ${config.restaurant_name}`,
        metadata: {
          restaurant_id: restaurantId,
          reservation_id: reservation.reservation_id,
          party_size: String(partySize),
          type: 'reservation_deposit_post_booking',
          currency,
        },
      },
      success_url: `${baseUrl}/book/${config.slug}/confirmed?id=${reservation.id}&deposit=ok`,
      cancel_url: `${baseUrl}/book/${config.slug}?deposit=cancelled`,
      ...(reservation.customer_email ? { customer_email: reservation.customer_email } : {}),
      metadata: {
        restaurant_id: restaurantId,
        reservation_id: reservation.reservation_id,
      },
    });

    // ---- 4. Persist payment_intent_id so the chip disappears immediately
    if (session.payment_intent) {
      await supabaseAdmin
        .from('reservations')
        .update({
          deposit_payment_intent_id: session.payment_intent,
          deposit_amount: depositAmount,
        })
        .eq('restaurant_id', restaurantId)
        .eq('reservation_id', reservation_id);
    }

    logger.info('deposit link generated', {
      restaurant_id: restaurantId,
      reservation_id: reservation.reservation_id,
      amount: depositAmount,
      currency,
    });

    return res.status(200).json({
      success: true,
      checkout_url: session.url,
      payment_intent_id: session.payment_intent || null,
      deposit_amount: depositAmount,
      currency,
      // Pre-shaped WhatsApp message body the dashboard can drop straight
      // into a wa.me URL — saves the host from typing it.
      whatsapp_message: buildWhatsAppMessage({
        customerName: reservation.customer_name,
        restaurantName: config.restaurant_name,
        date: reservation.date,
        time: (reservation.time || '').slice(0, 5),
        amount: depositAmount,
        currency,
        link: session.url,
      }),
      customer_phone: reservation.customer_phone || null,
    });
  } catch (err) {
    logger.error('request-deposit-link failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to generate deposit link' });
  }
};

function buildWhatsAppMessage({ customerName, restaurantName, date, time, amount, currency, link }) {
  const name = customerName || 'there';
  const dateLabel = date || 'your booking';
  const timeLabel = time ? ` at ${time}` : '';
  const amt = `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  return [
    `Hi ${name},`,
    `To confirm your reservation at ${restaurantName} on ${dateLabel}${timeLabel}, please complete a deposit of ${amt} here:`,
    link,
    `Thanks!`,
  ].join('\n');
}
