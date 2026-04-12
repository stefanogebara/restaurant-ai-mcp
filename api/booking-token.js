/**
 * Booking Token Endpoint
 *
 * Public endpoint that issues short-lived HMAC tokens for the deposit flow.
 * Prevents unauthenticated scripts from creating Stripe PaymentIntents against
 * arbitrary restaurants without first passing through the booking page.
 *
 * Token is valid for the current 10-minute window + the previous one (handles
 * edge cases where the page loaded just before a boundary flip).
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('BookingToken');

function getSecret() {
  const secret = process.env.BOOKING_HMAC_SECRET;
  if (!secret) throw new Error('BOOKING_HMAC_SECRET is not configured');
  return secret;
}

function timeBucket() {
  return Math.floor(Date.now() / 600000); // 10-minute window
}

function sign(restaurantId, bucket) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(`${restaurantId}:${bucket}`)
    .digest('hex');
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const { restaurant_id } = req.body || {};
  if (!restaurant_id) {
    return res.status(400).json({ error: 'Missing restaurant_id' });
  }

  try {
    // Verify the restaurant exists and has deposits enabled
    const { data: config, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('deposit_config')
      .eq('id', restaurant_id)
      .maybeSingle();

    if (error || !config) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    if (!config.deposit_config?.enabled) {
      return res.status(400).json({ error: 'Deposits not enabled for this restaurant' });
    }

    const bucket = timeBucket();
    const token = sign(restaurant_id, bucket);

    logger.info('Booking token issued', { restaurant_id });
    return res.status(200).json({ token, expires_in: 600 });
  } catch (err) {
    logger.error('booking-token error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify a booking token. Called by create-deposit-intent.
 * Returns true if the token is valid for the given restaurant_id.
 */
function verifyBookingToken(restaurantId, token) {
  if (!token || !restaurantId) return false;
  const secret = process.env.BOOKING_HMAC_SECRET;
  if (!secret) return false; // if secret not configured, fail open during rollout

  const bucket = timeBucket();
  // Accept current bucket and the previous one
  for (const b of [bucket, bucket - 1]) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${restaurantId}:${b}`)
      .digest('hex');
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))) {
        return true;
      }
    } catch {
      // mismatched lengths = invalid token
    }
  }
  return false;
}

module.exports.verifyBookingToken = verifyBookingToken;
