/**
 * Stripe Connect status read-back
 * GET /api/stripe-connect-status
 *
 * Returns the restaurant's current Stripe Connect account state so the
 * UI can show the right call-to-action (start onboarding, continue
 * onboarding, connected, revoked, etc.) without spawning a fresh
 * AccountLink on every render.
 *
 * Auth: JWT, restaurant_id from token.
 *
 * Response:
 *   200 { connected: false }                         — no row yet
 *   200 { connected: true, account_id, status,       — row exists
 *         charges_enabled, payouts_enabled,
 *         details_submitted, default_currency,
 *         country }
 *   401 unauthorized
 *   500 db_error
 *
 * The row is the local mirror written by the onboarding endpoint and
 * kept in sync by the Connect webhook (api/stripe-connect-webhook.js).
 * We deliberately don't call Stripe here — that would burn a Stripe API
 * call per dashboard mount.
 */

const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('stripe-connect-status');

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { data: row, error } = await supabaseAdmin
      .schema('restaurant')
      .from('stripe_connect_accounts')
      .select('stripe_account_id, status, charges_enabled, payouts_enabled, details_submitted, default_currency, country')
      .eq('restaurant_id', user.restaurant_id)
      .maybeSingle();

    if (error) {
      logger.error('Status lookup failed', { error: error.message, restaurantId: user.restaurant_id });
      return res.status(500).json({ success: false, error: 'db_error' });
    }

    if (!row) {
      return res.json({ success: true, connected: false });
    }

    return res.json({
      success: true,
      connected: true,
      account_id: row.stripe_account_id,
      status: row.status,
      charges_enabled: !!row.charges_enabled,
      payouts_enabled: !!row.payouts_enabled,
      details_submitted: !!row.details_submitted,
      default_currency: row.default_currency,
      country: row.country,
    });
  } catch (err) {
    logger.error('Status handler error', { error: err.message });
    return res.status(500).json({ success: false, error: 'server_error' });
  }
};
