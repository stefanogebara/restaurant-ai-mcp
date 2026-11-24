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

const { issueBookingToken, WINDOW_SECONDS } = require('./_lib/booking-token');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('BookingToken');

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

  // Fail fast with a distinct error when the HMAC secret isn't configured.
  // Previously this threw inside the try/catch below and surfaced as a
  // generic 500, which masked a config issue (env var never set on Vercel)
  // as if it were a runtime bug. Now we return 503 with a clear log line.
  if (!process.env.BOOKING_HMAC_SECRET) {
    logger.error('BOOKING_HMAC_SECRET not configured — deposit booking disabled');
    return res.status(503).json({ error: 'Payments temporarily unavailable. Please contact the restaurant.' });
  }

  try {
    // Verify the restaurant exists and has deposits enabled
    const { data: config, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('deposit_config')
      .eq('id', restaurant_id)
      .eq('is_active', true)
      .eq('onboarding_completed', true)
      .maybeSingle();

    if (error || !config) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    if (config.deposit_config?.enabled !== true) {
      return res.status(400).json({ code: 'deposit_not_required', error: 'Deposits not enabled for this restaurant' });
    }

    const token = issueBookingToken(restaurant_id);

    logger.info('Booking token issued', { restaurant_id });
    return res.status(200).json({ token, expires_in: WINDOW_SECONDS });
  } catch (err) {
    logger.error('booking-token error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};
