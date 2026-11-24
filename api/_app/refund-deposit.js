const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { getStripe, readReservationDeposit } = require('./_lib/reservation-deposits');
const { REFUND_RESERVATION_FIELDS, readRefunds, saveRefundAmount } = require('./_lib/deposit-refunds');

const logger = createSecureLogger('RefundDeposit');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (await checkAndApplyRateLimit(req, res, 'refund_deposit')) return;

  const auth = await verifyAuth(req, { required: true });
  if (auth.error) return res.status(auth.status || 401).json({ success: false, error: auth.error });
  if (auth.user.role !== 'owner') return res.status(403).json({ success: false, code: 'owner_required' });

  const { reservation_id: reservationId } = req.body || {};
  if (typeof reservationId !== 'string' || !reservationId) {
    return res.status(400).json({ success: false, error: 'Missing reservation_id' });
  }

  try {
    const { data: reservation, error } = await supabaseAdmin.from('reservations')
      .select(REFUND_RESERVATION_FIELDS).eq('reservation_id', reservationId)
      .eq('restaurant_id', auth.user.restaurant_id).maybeSingle();
    if (error) throw error;
    if (!reservation) return res.status(404).json({ success: false, error: 'Reservation not found' });
    const intentId = reservation.deposit_captured_payment_intent_id;
    if (!intentId) return res.status(409).json({ success: false, code: 'deposit_not_captured' });

    const stripe = getStripe();
    const payment = await readReservationDeposit(reservation, 'deposit_captured_payment_intent_id');
    if (payment?.status !== 'succeeded' || payment.amount !== payment.amount_received ||
        reservation.deposit_currency !== payment.currency) {
      return res.status(409).json({ success: false, code: 'deposit_not_captured' });
    }

    let summary = await readRefunds(stripe, intentId, payment.currency);
    if (!summary.pending && summary.refundedMinor < payment.amount_received) {
      const amount = payment.amount_received - summary.refundedMinor;
      const refund = await stripe.refunds.create({
        payment_intent: intentId,
        amount,
        ...(payment.transfer_data?.destination ? { reverse_transfer: true } : {}),
      }, { idempotencyKey: `reservation-deposit-refund-${intentId}-${amount}-${summary.latestFailed || 'first'}` });
      summary = await readRefunds(stripe, intentId, payment.currency);
      if (['failed', 'canceled'].includes(refund.status) && summary.refundedMinor < payment.amount_received) {
        return res.status(503).json({ success: false, code: 'refund_failed' });
      }
    }

    await saveRefundAmount(supabaseAdmin, reservation, summary.refundedMinor);
    const refunded = summary.refundedMinor === payment.amount_received;
    return res.status(refunded ? 200 : 202).json({
      success: true, state: refunded ? 'refunded' : 'pending', amount_refunded: summary.refundedMinor / 100,
    });
  } catch (error) {
    logger.warn('Could not confirm deposit refund', { code: error.code, type: error.type });
    return res.status(503).json({ success: false, code: 'refund_unconfirmed' });
  }
};
