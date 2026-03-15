const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('ReleaseDeposit');
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

    // Cancel the payment intent to release the hold
    const paymentIntent = await getStripe().paymentIntents.cancel(
      reservation.deposit_payment_intent_id
    );

    // Clear deposit fields on the reservation — scoped by both id and restaurant_id
    await supabaseAdmin
      .from('reservations')
      .update({
        deposit_payment_intent_id: null,
        deposit_amount: null,
      })
      .eq('id', reservation.id)
      .eq('restaurant_id', reservation.restaurant_id);

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
        error: `Stripe error: ${error.message}`,
      });
    }

    return res.status(500).json({ success: false, error: 'Failed to release deposit' });
  }
};
