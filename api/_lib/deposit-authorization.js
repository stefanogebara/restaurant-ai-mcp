const { supabaseAdmin } = require('./db/clients');
const { getStripe, captureDeadline, readReservationDeposit, stripeLiveMode } = require('./reservation-deposits');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('DepositAuthorization');
const FIELDS = 'id, restaurant_id, reservation_id, deposit_amount, deposit_payment_intent_id, deposit_release_pending_at, deposit_check_after';
const STRIPE_OPTIONS = { timeout: 4000, maxNetworkRetries: 0 };
const HOUR = 60 * 60 * 1000;
const CAPTURE_LEASE_MS = 2 * 60_000;

function depositAuthorizationEventIntent(event) {
  const payment = event.data?.object;
  if (!payment || event.account || event.livemode !== stripeLiveMode() || payment.livemode !== event.livemode) return null;
  const id = event.type === 'payment_intent.canceled' ? payment.id
    : event.type === 'charge.expired' ? payment.payment_intent : null;
  return typeof id === 'string' && /^pi_[A-Za-z0-9]+$/.test(id) ? id : null;
}

function updateAttachedHold(reservation, fields) {
  return supabaseAdmin.from('reservations').update(fields)
    .eq('id', reservation.id).eq('restaurant_id', reservation.restaurant_id)
    .eq('deposit_payment_intent_id', reservation.deposit_payment_intent_id)
    .is('deposit_release_pending_at', null);
}

async function clearEndedAuthorization(reservation, payment, explicitExpiry = false, now = Date.now()) {
  if (payment.status !== 'canceled' || payment.amount_received !== 0) return false;
  const deadline = captureDeadline(payment);
  const expired = explicitExpiry || Boolean(deadline && deadline <= now);
  const { error } = await updateAttachedHold(reservation, {
    deposit_payment_intent_id: null,
    deposit_amount: null,
    deposit_currency: null,
    ...(expired ? {
      deposit_authorization_expired_at: new Date(now).toISOString(),
      deposit_reauthorization_required: true,
    } : {}),
  });
  if (error) throw error;
  return true;
}

async function reconcileDepositAuthorizationEvent(intentId, explicitExpiry) {
  const { data: reservation, error } = await supabaseAdmin.from('reservations').select(FIELDS)
    .eq('deposit_payment_intent_id', intentId).is('deposit_release_pending_at', null).maybeSingle();
  if (error) throw error;
  if (!reservation) return;
  const payment = await readReservationDeposit(reservation, 'deposit_payment_intent_id', STRIPE_OPTIONS);
  if (!payment) return;
  if (!(await clearEndedAuthorization(reservation, payment, explicitExpiry))) {
    // charge.expired can precede the PaymentIntent's final state. Let Stripe
    // retry the event and keep the scheduled check available as a fallback.
    if (explicitExpiry && payment.status !== 'succeeded') throw new Error('Expired authorization has not settled');
  }
}

async function cancelPastDeadline(reservation, payment) {
  try {
    return await getStripe().paymentIntents.cancel(payment.id, {}, {
      ...STRIPE_OPTIONS, idempotencyKey: `reservation-deposit-release-${payment.id}`,
    });
  } catch (error) {
    if (error.code !== 'payment_intent_unexpected_state') throw error;
    return readReservationDeposit(reservation, 'deposit_payment_intent_id', STRIPE_OPTIONS);
  }
}

async function reviewAuthorization(reservation, now) {
  let payment = await readReservationDeposit(reservation, 'deposit_payment_intent_id', STRIPE_OPTIONS);
  if (!payment) throw new Error('Deposit ownership could not be verified');
  const deadline = captureDeadline(payment);
  if (payment.status === 'requires_capture' && deadline && deadline <= now) {
    payment = await cancelPastDeadline(reservation, payment);
  }

  if (payment && await clearEndedAuthorization(reservation, payment, Boolean(deadline && deadline <= now), now)) return 'cleared';
  if (payment?.status === 'succeeded' && payment.amount_received === payment.amount) {
    const { error } = await updateAttachedHold(reservation, {
      deposit_payment_intent_id: null, deposit_captured_payment_intent_id: payment.id, deposit_currency: payment.currency,
    });
    if (error) throw error;
    return 'captured';
  }
  await scheduleReview(reservation, Math.min(deadline && deadline > now ? deadline : Infinity, now + 24 * HOUR));
  return 'scheduled';
}

async function scheduleReview(reservation, deadline) {
  const { error } = await updateAttachedHold(reservation, {
    deposit_check_after: new Date(deadline).toISOString(),
  }).eq('deposit_check_after', reservation.deposit_check_after);
  if (error) throw error;
}

async function reviewDueDepositAuthorizations(now = Date.now()) {
  const { data, error } = await supabaseAdmin.from('reservations').select(FIELDS)
    .not('deposit_payment_intent_id', 'is', null).is('deposit_release_pending_at', null)
    .lte('deposit_check_after', new Date(now).toISOString())
    .or(`deposit_capture_started_at.is.null,deposit_capture_started_at.lte.${new Date(now - CAPTURE_LEASE_MS).toISOString()}`)
    .order('deposit_check_after').order('id').limit(12);
  if (error) throw error;
  return Promise.all(data.map(async reservation => {
    try {
      return await reviewAuthorization(reservation, now);
    } catch (cause) {
      logger.warn('Could not review the deposit authorization', { reservation_id: reservation.id, code: cause.code });
      await scheduleReview(reservation, now + HOUR);
      return 'pending';
    }
  }));
}

module.exports = {
  CAPTURE_LEASE_MS, cancelPastDeadline, clearEndedAuthorization, depositAuthorizationEventIntent, reconcileDepositAuthorizationEvent, reviewDueDepositAuthorizations,
};
