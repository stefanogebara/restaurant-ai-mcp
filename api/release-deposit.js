const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { getStripe, readReservationDeposit } = require('./_lib/reservation-deposits');

const logger = createSecureLogger('ReleaseDeposit');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'release_deposit', 30, 60);
  if (rateLimited) return;

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  req.user = authResult.user;

  const { reservation_id } = req.body || {};

  if (!reservation_id) {
    return res.status(400).json({ success: false, error: 'Missing reservation_id' });
  }

  try {
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, deposit_payment_intent_id, deposit_amount, restaurant_id')
      .eq('reservation_id', reservation_id)
      .eq('restaurant_id', req.user.restaurant_id)
      .single();

    if (fetchError || !reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    if (!reservation.deposit_payment_intent_id) {
      return res.status(400).json({ success: false, error: 'No deposit held for this reservation' });
    }

    const payment = await readReservationDeposit(reservation);
    if (!payment || !['requires_capture', 'canceled'].includes(payment.status)) {
      return res.status(409).json({ success: false, error: 'No matching deposit authorization can be released' });
    }
    const paymentIntent = payment.status === 'canceled' ? payment : await getStripe().paymentIntents.cancel(
      payment.id, {}, { idempotencyKey: `reservation-deposit-release-${payment.id}` }
    );
    if (paymentIntent.status !== 'canceled') {
      return res.status(409).json({ success: false, error: 'Stripe did not confirm release of the deposit' });
    }

    // DD.1 — chain .select('id'). Without this, a race where the row is
    // deleted between fetch and update leaves Stripe's hold released but
    // any cached UI row still shows the deposit as held, with no error
    // surfaced to the operator.
    const { data: cleared, error: clearErr } = await supabaseAdmin
      .from('reservations')
      .update({
        deposit_payment_intent_id: null,
        deposit_amount: null,
      })
      .eq('id', reservation.id)
      .eq('restaurant_id', reservation.restaurant_id)
      .eq('deposit_payment_intent_id', payment.id)
      .select('id');

    if (clearErr) {
      logger.error('Deposit released on Stripe but DB clear failed', {
        reservation_id,
        payment_intent_id: paymentIntent.id,
        error: clearErr.message,
      });
      return res.status(503).json({
        success: false,
        error: 'The hold was released. Retry to update the reservation.',
      });
    }
    if (!cleared || cleared.length === 0) {
      logger.warn('release-deposit: DB clear matched 0 rows', {
        reservation_id,
        payment_intent_id: paymentIntent.id,
      });
    }

    logger.info('Deposit released', {
      reservation_id,
      payment_intent_id: paymentIntent.id,
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit hold released',
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    logger.error('Release deposit error:', error.message);

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: 'Stripe could not release the deposit.',
      });
    }

    return res.status(500).json({ success: false, error: 'Failed to release deposit' });
  }
};
