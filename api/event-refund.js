/**
 * Event Refund API
 *
 * POST: Processes a refund for an event booking.
 * Authenticated endpoint (restaurant owner only).
 * Creates Stripe refund + decrements event capacity.
 */

const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

const logger = createSecureLogger('EventRefund');

let stripe;
function getStripe() {
  if (!stripe) stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

function eventsDb() {
  return supabaseAdmin.schema('restaurant');
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  // --- Auth ---
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  req.user = authResult.user;
  const restaurantId = req.user.restaurant_id;

  const { booking_id } = req.body || {};

  if (!booking_id) {
    return res.status(400).json({ success: false, error: 'Missing booking_id' });
  }

  try {
    // --- Fetch booking (scoped to restaurant) ---
    const { data: booking, error: bookingError } = await eventsDb()
      .from('event_bookings')
      .select('id, event_id, restaurant_id, customer_name, customer_email, customer_phone, guests, total_amount, payment_status, booking_status, stripe_payment_intent_id, refund_amount, created_at, updated_at')
      .eq('id', booking_id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.payment_status !== 'paid') {
      return res.status(400).json({ success: false, error: `Cannot refund booking with payment status: ${booking.payment_status}` });
    }

    if (booking.booking_status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking is already cancelled' });
    }

    // --- Fetch event refund policy ---
    const { data: event } = await eventsDb()
      .from('events')
      .select('refund_policy')
      .eq('id', booking.event_id)
      .single();

    const refundPolicy = event?.refund_policy || 'full';

    // --- Calculate refund amount based on policy ---
    let refundAmount;
    switch (refundPolicy) {
      case 'none':
        refundAmount = 0;
        break;
      case 'partial':
        refundAmount = booking.total_amount * 0.5; // 50% refund
        break;
      case 'full':
      default:
        refundAmount = booking.total_amount;
        break;
    }

    // --- Process Stripe refund if amount > 0 ---
    if (refundAmount > 0 && booking.stripe_payment_intent_id) {
      const refundCents = Math.round(refundAmount * 100);
      await getStripe().refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: refundCents,
        reason: 'requested_by_customer',
        metadata: {
          booking_id: booking.id,
          event_id: booking.event_id,
          restaurant_id: restaurantId,
        },
      });

      logger.info('Stripe refund created', {
        bookingId: booking.id,
        refundAmount,
        paymentIntentId: booking.stripe_payment_intent_id,
      });
    }

    // --- Atomically cancel booking + decrement capacity ---
    const { data: cancelled } = await supabaseAdmin.rpc('cancel_event_booking', {
      p_booking_id: booking.id,
      p_refund_amount: refundAmount,
    });

    if (!cancelled) {
      logger.error('Failed to cancel booking via RPC', { bookingId: booking.id });
      return res.status(500).json({ success: false, error: 'Failed to update booking status' });
    }

    logger.info('Event booking refunded', {
      bookingId: booking.id,
      refundPolicy,
      refundAmount,
    });

    return res.status(200).json({
      success: true,
      data: {
        booking_id: booking.id,
        refund_amount: refundAmount,
        refund_policy: refundPolicy,
        booking_status: 'cancelled',
        payment_status: refundAmount > 0 ? 'refunded' : 'paid',
      },
    });
  } catch (error) {
    logger.error('Event refund error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to process refund' });
  }
};
