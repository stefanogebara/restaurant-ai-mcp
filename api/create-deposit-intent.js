const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyBookingToken } = require('./booking-token');
const { resolveDepositCurrency, minChargeAmount } = require('./_lib/currency');

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
    // Fetch deposit config + country for this restaurant. Country drives
    // the currency the customer is actually charged in — previously this
    // was hardcoded to EUR, which silently mis-charged Brazilian restaurants
    // (R$50 was being interpreted as €50, ~5x the intended price after FX)
    // and US restaurants (same direction).
    const { data: config, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('deposit_config, restaurant_name, country')
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

    // Resolve the actual currency to charge in. Precedence:
    //   1. deposit_config.currency explicit override (3-letter ISO)
    //   2. country → currency mapping
    //   3. EUR fallback (keeps historical behaviour for restaurants without
    //      a country populated)
    const currency = resolveDepositCurrency(config.country, depositConfig.currency);
    const minAmount = minChargeAmount(currency);

    if (depositAmount < minAmount) {
      return res.status(400).json({
        success: false,
        error: `Deposit amount too small (minimum ${currency.toUpperCase()} ${minAmount.toFixed(2)})`,
      });
    }

    // Amount in cents for Stripe
    const amountInCents = Math.round(depositAmount * 100);

    // If this restaurant has finished Stripe Connect onboarding, route the
    // deposit to their account (destination charges). Pre-conditions:
    //   - row exists with status='active'
    //   - charges_enabled=true (Stripe blocks transfer_data otherwise)
    //   - currency matches the connected account's default_currency, since
    //     transfer_data requires a presentment currency the destination
    //     supports for settlement
    // Any failed check → graceful fallback to platform-only so the booking
    // doesn't break for restaurants who haven't onboarded yet.
    let connectRouting = null;
    let routedTo = 'platform';
    try {
      const { data: connectRow } = await supabaseAdmin
        .schema('restaurant')
        .from('stripe_connect_accounts')
        .select('stripe_account_id, status, charges_enabled, default_currency')
        .eq('restaurant_id', restaurant_id)
        .maybeSingle();

      if (connectRow?.status === 'active' && connectRow.charges_enabled) {
        const destCurrency = (connectRow.default_currency || '').toLowerCase();
        if (destCurrency && destCurrency !== currency) {
          logger.warn('Skipping Connect routing — currency mismatch', {
            restaurant_id,
            presentment_currency: currency,
            connect_default_currency: destCurrency,
          });
        } else {
          connectRouting = {
            on_behalf_of: connectRow.stripe_account_id,
            transfer_data: { destination: connectRow.stripe_account_id },
          };
          routedTo = 'connect';
        }
      }
    } catch (connectErr) {
      // Don't let a Connect lookup failure break the booking flow.
      logger.warn('Connect routing lookup failed (falling back to platform)', { error: connectErr.message });
    }

    // Create PaymentIntent with manual capture
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountInCents,
      currency,
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      description: `Reservation deposit at ${config.restaurant_name}`,
      metadata: {
        restaurant_id,
        party_size: String(parsedPartySize),
        type: 'reservation_deposit',
        currency,
        routed_to: routedTo,
        ...(connectRouting ? { connect_account_id: connectRouting.on_behalf_of } : {}),
      },
      ...(connectRouting || {}),
      ...(customer_email ? { receipt_email: customer_email } : {}),
    });

    logger.info('Deposit intent created', {
      restaurant_id,
      amount: depositAmount,
      payment_intent_id: paymentIntent.id,
      routed_to: routedTo,
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
