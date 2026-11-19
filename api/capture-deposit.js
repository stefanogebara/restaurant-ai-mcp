const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { captureDeadline, getStripe, isCapturable, readReservationDeposit } = require('./_lib/reservation-deposits');

const { CAPTURE_LEASE_MS, cancelPastDeadline, clearEndedAuthorization } = require('./_lib/deposit-authorization');

const NO_SHOW_STATUSES = ['no-show', 'no_show'];
const logger = createSecureLogger('CaptureDeposit');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  if (authResult.user.role !== 'owner') {
    return res.status(403).json({ success: false, code: 'owner_required', error: 'Only the restaurant owner can charge a deposit.' });
  }
  req.user = authResult.user;

  const { reservation_id } = req.body || {};

  if (!reservation_id) {
    return res.status(400).json({ success: false, error: 'Missing reservation_id' });
  }

  try {
    // Fetch reservation to get payment_intent_id
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, deposit_payment_intent_id, deposit_amount, restaurant_id, status, checked_in_at, deposit_release_pending_at, deposit_authorization_expired_at, deposit_captured_payment_intent_id')
      .eq('reservation_id', reservation_id)
      .eq('restaurant_id', req.user.restaurant_id)
      .single();

    if (fetchError || !reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    if (!NO_SHOW_STATUSES.includes(reservation.status) || reservation.checked_in_at) {
      return res.status(409).json({ success: false, error: 'A deposit can only be charged after a no-show.' });
    }

    if (reservation.deposit_release_pending_at) {
      return res.status(409).json({ success: false, error: 'This authorization can no longer be captured. Refresh the reservation.' });
    }

    const expired = () => res.status(409).json({
      success: false, code: 'deposit_authorization_expired', error: 'The deposit authorization has expired or been released.',
    });
    if (!reservation.deposit_payment_intent_id) {
      if (reservation.deposit_captured_payment_intent_id) {
        return res.status(200).json({
          success: true, message: 'Deposit already captured', amount_captured: Number(reservation.deposit_amount),
          payment_intent_id: reservation.deposit_captured_payment_intent_id,
        });
      }
      if (reservation.deposit_authorization_expired_at) return expired();
      return res.status(400).json({ success: false, error: 'No deposit held for this reservation' });
    }

    let payment = await readReservationDeposit(reservation);
    if (!payment) {
      return res.status(409).json({ success: false, error: 'No matching deposit authorization can be captured' });
    }
    const deadline = captureDeadline(payment);
    if (payment.status === 'requires_capture' && deadline && deadline <= Date.now()) {
      payment = await cancelPastDeadline(reservation, payment);
    }
    if (payment?.status === 'canceled') {
      await clearEndedAuthorization(reservation, payment, Boolean(deadline && deadline <= Date.now()));
      return expired();
    }
    if (!payment || (payment.status !== 'succeeded' && !isCapturable(payment, payment.amount))) {
      return res.status(409).json({ success: false, error: 'No matching deposit authorization can be captured' });
    }

    let paymentIntent = payment;
    if (payment.status !== 'succeeded') {
      // Reserve the explicit charge while the Stripe call is in flight. The
      // seating transaction locks this same row, so whichever starts first wins.
      const startedAt = new Date();
      const staleBefore = new Date(startedAt.getTime() - CAPTURE_LEASE_MS);
      const { data: currentHold, error: checkError } = await supabaseAdmin.from('reservations')
        .update({ deposit_capture_started_at: startedAt.toISOString(), deposit_check_after: startedAt.toISOString() })
        .eq('id', reservation.id).eq('restaurant_id', reservation.restaurant_id)
        .eq('deposit_payment_intent_id', payment.id).is('deposit_release_pending_at', null)
        .in('status', NO_SHOW_STATUSES).is('checked_in_at', null)
        .or(`deposit_capture_started_at.is.null,deposit_capture_started_at.lt.${staleBefore.toISOString()}`)
        .select('id').maybeSingle();
      if (checkError) return res.status(503).json({ success: false, error: 'Could not verify the current authorization' });
      if (!currentHold) return res.status(409).json({ success: false, error: 'This authorization can no longer be captured. Refresh the reservation.' });
      try {
        paymentIntent = await getStripe().paymentIntents.capture(
          payment.id, {}, { idempotencyKey: `reservation-deposit-capture-${payment.id}` }
        );
      } catch (error) {
        if (error.code !== 'payment_intent_unexpected_state' && error.code !== 'charge_expired_for_capture') throw error;
        paymentIntent = await readReservationDeposit(reservation);
        if (paymentIntent?.status === 'canceled') await clearEndedAuthorization(reservation, paymentIntent);
        if (paymentIntent?.status === 'canceled' || error.code === 'charge_expired_for_capture') return expired();
        if (!paymentIntent) throw error;
      }
    }
    if (paymentIntent.status !== 'succeeded' || paymentIntent.amount_received !== payment.amount) {
      return res.status(409).json({ success: false, error: 'Stripe did not confirm capture of the full deposit' });
    }

    // Move the authorization out of the hold field and keep its Stripe reference for refunds.
    const { error: clearError } = await supabaseAdmin
      .from('reservations')
      .update({
        deposit_payment_intent_id: null,
        deposit_captured_payment_intent_id: paymentIntent.id,
        deposit_currency: paymentIntent.currency,
      })
      .eq('id', reservation.id)
      .eq('restaurant_id', req.user.restaurant_id)
      .eq('deposit_payment_intent_id', payment.id);
    if (clearError) {
      logger.error('Stripe captured deposit but local update failed', { payment_intent_id: payment.id, code: clearError.code });
      return res.status(503).json({ success: false, error: 'The deposit was captured. Retry to update the reservation.' });
    }

    logger.info('Deposit captured', {
      reservation_id,
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount_received,
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit captured successfully',
      amount_captured: paymentIntent.amount_received / 100,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    logger.error('Capture deposit error:', error.message);

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: 'Something went wrong. Please try again.',
      });
    }

    return res.status(500).json({ success: false, error: 'Failed to capture deposit' });
  }
};
