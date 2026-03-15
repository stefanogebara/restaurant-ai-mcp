const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('CaptureDeposit');
let stripe;
function getStripe() {
  if (!stripe) stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

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
  req.user = authResult.user;

  const { reservation_id } = req.body || {};

  if (!reservation_id) {
    return res.status(400).json({ success: false, error: 'Missing reservation_id' });
  }

  try {
    // Fetch reservation to get payment_intent_id
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select('id, deposit_payment_intent_id, deposit_amount, restaurant_id')
      .eq('reservation_id', reservation_id)
      .eq('restaurant_id', req.user.restaurant_id)
      .single();

    if (fetchError || !reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    if (!reservation.deposit_payment_intent_id) {
      return res.status(400).json({ success: false, error: 'No deposit held for this reservation' });
    }

    // Capture the payment
    const paymentIntent = await getStripe().paymentIntents.capture(
      reservation.deposit_payment_intent_id
    );

    // Null out the payment intent ID so DepositActions stops showing buttons.
    // Keep deposit_amount for reporting purposes.
    await supabaseAdmin
      .from('reservations')
      .update({ deposit_payment_intent_id: null })
      .eq('id', reservation.id)
      .eq('restaurant_id', req.user.restaurant_id);

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
