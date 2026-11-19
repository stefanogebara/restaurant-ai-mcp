const { supabaseAdmin } = require('./db/clients');
const { getStripe, readReservationDeposit } = require('./reservation-deposits');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('ChangedReservationDeposit');
const RELEASE_FIELDS = 'id, reservation_id, restaurant_id, deposit_amount, deposit_payment_intent_id, deposit_release_pending_at';
const STRIPE_OPTIONS = { timeout: 4000, maxNetworkRetries: 0 };

async function settleChangedDeposit(reservation) {
  if (!reservation?.deposit_release_pending_at || !reservation.deposit_payment_intent_id) return 'unchanged';

  try {
    const stripe = getStripe();
    let payment = await readReservationDeposit(reservation, 'deposit_payment_intent_id', STRIPE_OPTIONS);
    if (!payment) throw new Error('Deposit ownership could not be verified');
    if (payment.status === 'requires_capture') {
      try {
        payment = await stripe.paymentIntents.cancel(payment.id, {}, {
          ...STRIPE_OPTIONS, idempotencyKey: `reservation-deposit-release-${payment.id}`,
        });
      } catch (error) {
        if (error.code !== 'payment_intent_unexpected_state') throw error;
        payment = await readReservationDeposit(reservation, 'deposit_payment_intent_id', STRIPE_OPTIONS);
      }
    }

    // If capture won a concurrent provider operation, retain the capture so
    // the owner can refund it. Never clear an amount Stripe actually charged.
    const captured = payment?.status === 'succeeded' && payment.amount_received === payment.amount;
    if (!captured && payment?.status !== 'canceled') throw new Error('Deposit is not ready to settle');
    const fields = captured
      ? { deposit_captured_payment_intent_id: payment.id, deposit_currency: payment.currency }
      : { deposit_amount: null, deposit_currency: null };
    const { data, error } = await supabaseAdmin.from('reservations')
      .update({ ...fields, deposit_payment_intent_id: null })
      .eq('id', reservation.id).eq('restaurant_id', reservation.restaurant_id)
      .eq('deposit_payment_intent_id', payment.id)
      .not('deposit_release_pending_at', 'is', null)
      .select('id').maybeSingle();
    if (error) throw error;
    return data ? (captured ? 'captured' : 'released') : 'unchanged';
  } catch (error) {
    logger.warn('Deposit reconciliation will retry', { reservation_id: reservation.id, code: error.code });
    return 'pending';
  }
}

async function settleChangedDepositForReservation(restaurantId, reservationId) {
  try {
    const { data, error } = await supabaseAdmin.from('reservations').select(RELEASE_FIELDS)
      .eq('id', reservationId).eq('restaurant_id', restaurantId)
      .not('deposit_release_pending_at', 'is', null).maybeSingle();
    if (error) throw error;
    return await settleChangedDeposit(data);
  } catch (error) {
    logger.warn('Could not read queued deposit release', { reservation_id: reservationId, code: error.code });
    return 'pending';
  }
}

async function retryChangedDeposits() {
  const { data, error } = await supabaseAdmin.from('reservations').select(RELEASE_FIELDS)
    .not('deposit_release_pending_at', 'is', null).order('deposit_release_pending_at').limit(12);
  if (error) throw error;

  return Promise.all(data.map(async reservation => {
    const result = await settleChangedDeposit(reservation);
    if (result === 'pending') {
      // Send failed items to the end of the next batch without losing their hold.
      const { error: rescheduleError } = await supabaseAdmin.from('reservations')
        .update({ deposit_release_pending_at: new Date().toISOString() })
        .eq('restaurant_id', reservation.restaurant_id).eq('id', reservation.id)
        .eq('deposit_release_pending_at', reservation.deposit_release_pending_at);
      if (rescheduleError) logger.warn('Could not reorder deposit release', { code: rescheduleError.code });
    }
    return result;
  }));
}

module.exports = { settleChangedDeposit, settleChangedDepositForReservation, retryChangedDeposits };
