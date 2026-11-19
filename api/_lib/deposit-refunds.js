const { stripeMode } = require('./hosted-reservation-deposit');

const REFUND_RESERVATION_FIELDS = 'id, reservation_id, restaurant_id, deposit_amount, deposit_currency, deposit_captured_payment_intent_id';
const REFUND_EVENTS = new Set(['charge.refunded', 'refund.updated']);

function refundIntentId(event, key) {
  if (!REFUND_EVENTS.has(event.type) || event.livemode !== stripeMode(key)) return null;
  const intent = event.data.object.payment_intent;
  const id = typeof intent === 'string' ? intent : intent?.id;
  return typeof id === 'string' && /^pi_[A-Za-z0-9]+$/.test(id) ? id : null;
}

async function readRefunds(stripe, intentId, expectedCurrency) {
  let refundedMinor = 0;
  let pending = false;
  let latestFailed;
  for await (const refund of stripe.refunds.list({ payment_intent: intentId, limit: 100 })) {
    if (refund.currency !== expectedCurrency) throw new Error('Refund currency does not match deposit');
    if (refund.status === 'succeeded') refundedMinor += refund.amount;
    else if (['pending', 'requires_action'].includes(refund.status)) pending = true;
    else if (!latestFailed && ['failed', 'canceled'].includes(refund.status)) latestFailed = refund.id;
  }
  return { refundedMinor, pending, latestFailed };
}

async function saveRefundAmount(db, reservation, refundedMinor) {
  if (!refundedMinor) return;
  if (refundedMinor > Math.round(Number(reservation.deposit_amount) * 100)) {
    throw new Error('Refund exceeds the stored deposit');
  }
  const refundedAmount = refundedMinor / 100;
  const { error } = await db.from('reservations')
    .update({ deposit_refunded_amount: refundedAmount })
    .eq('id', reservation.id)
    .eq('restaurant_id', reservation.restaurant_id)
    .eq('deposit_captured_payment_intent_id', reservation.deposit_captured_payment_intent_id)
    .or(`deposit_refunded_amount.is.null,deposit_refunded_amount.lt.${refundedAmount}`);
  if (error) throw error;
}

async function projectDepositRefund(db, stripe, intentId) {
  const { data: reservation, error } = await db.from('reservations')
    .select(REFUND_RESERVATION_FIELDS).eq('deposit_captured_payment_intent_id', intentId).maybeSingle();
  if (error) throw error;
  if (!reservation) return false;
  const summary = await readRefunds(stripe, intentId, reservation.deposit_currency);
  await saveRefundAmount(db, reservation, summary.refundedMinor);
  return true;
}

module.exports = { REFUND_RESERVATION_FIELDS, projectDepositRefund, readRefunds, refundIntentId, saveRefundAmount };
