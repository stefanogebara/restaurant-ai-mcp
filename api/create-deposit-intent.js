const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyBookingToken } = require('./booking-token');

const logger = createSecureLogger('DepositIntent');
let stripe;
function getStripe() {
  if (!stripe) stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

module.exports = async (req, res) => {
  // Public endpoint — no auth required (customer-facing booking flow)
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const { restaurant_id, party_size, customer_email, booking_token } = req.body || {};

  if (!restaurant_id) {
    return res.status(400).json({ success: false, error: 'Missing restaurant_id' });
  }

  if (!verifyBookingToken(restaurant_id, booking_token)) {
    return res.status(403).json({ success: false, error: 'Invalid or expired booking token' });
  }

  const parsedPartySize = parseInt(party_size, 10);
  if (isNaN(parsedPartySize) || parsedPartySize < 1) {
    return res.status(400).json({ success: false, error: 'Invalid party_size' });
  }

  if (parsedPartySize > 50) {
    return res.status(400).json({ success: false, error: 'party_size cannot exceed 50' });
  }

  try {
    // Fetch deposit config for this restaurant
    const { data: config, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('deposit_config, restaurant_name')
      .eq('id', restaurant_id)
      .single();

    if (configError || !config) {
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }

    const depositConfig = config.deposit_config || { enabled: false };

    if (!depositConfig.enabled) {
      return res.status(400).json({ success: false, error: 'Deposits are not enabled for this restaurant' });
    }

    // Calculate deposit amount
    let depositAmount;
    if (depositConfig.type === 'per_person') {
      depositAmount = depositConfig.amount * parsedPartySize;
    } else {
      depositAmount = depositConfig.amount;
    }

    // Amount in cents for Stripe
    const amountInCents = Math.round(depositAmount * 100);

    if (amountInCents < 50) {
      return res.status(400).json({ success: false, error: 'Deposit amount too small (minimum EUR 0.50)' });
    }

    // Create PaymentIntent with manual capture
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      description: `Reservation deposit at ${config.restaurant_name}`,
      metadata: {
        restaurant_id,
        party_size: String(parsedPartySize),
        type: 'reservation_deposit',
      },
      ...(customer_email ? { receipt_email: customer_email } : {}),
    });

    logger.info('Deposit intent created', {
      restaurant_id,
      amount: depositAmount,
      payment_intent_id: paymentIntent.id,
    });

    return res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      deposit_amount: depositAmount,
    });
  } catch (error) {
    logger.error('Create deposit intent error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create deposit' });
  }
};
