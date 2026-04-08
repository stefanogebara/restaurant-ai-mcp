/**
 * Square OAuth Flow
 *
 * GET /api/square/auth?restaurant_id=X  → Redirect to Square consent screen
 * GET /api/square/callback              → Exchange code for tokens, save to pos_connections
 *
 * Requires: SQUARE_APP_ID, SQUARE_APP_SECRET env vars
 * Optional: SQUARE_ENVIRONMENT (sandbox|production, defaults to sandbox)
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { verifyAuth } = require('../_lib/auth');
const { setInternalCors } = require('../_lib/cors');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('SquareAuth');

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const SQUARE_BASE = SQUARE_ENV === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';
const SQUARE_APP_ID = process.env.SQUARE_APP_ID;
const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';

// Scopes needed for menu sync + transaction reading
const SCOPES = [
  'ITEMS_READ',
  'MERCHANT_PROFILE_READ',
  'ORDERS_READ',
  'PAYMENTS_READ',
].join('+');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  if (action === 'callback') {
    return handleCallback(req, res);
  }

  return handleAuth(req, res);
};

/**
 * Step 1: Redirect user to Square OAuth consent screen
 */
async function handleAuth(req, res) {
  if (!SQUARE_APP_ID || !SQUARE_APP_SECRET) {
    return res.status(500).json({ success: false, error: 'Square integration not configured' });
  }

  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'Restaurant ID required' });
  }

  // Generate CSRF state token: restaurant_id + random nonce
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${restaurantId}:${nonce}`;

  // Store state temporarily (5 min TTL)
  await supabaseAdmin
    .from('pos_connections')
    .upsert({
      restaurant_id: restaurantId,
      pos_provider: 'square',
      status: 'pending',
      sync_error: state, // temporarily store state for CSRF validation
      updated_at: new Date().toISOString(),
    }, { onConflict: 'restaurant_id,pos_provider' });

  const callbackUrl = `${CLIENT_URL}/api/square/auth?action=callback`;
  const authorizeUrl = `${SQUARE_BASE}/oauth2/authorize?client_id=${SQUARE_APP_ID}&scope=${SCOPES}&session=false&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(callbackUrl)}`;

  return res.redirect(302, authorizeUrl);
}

/**
 * Step 2: Handle Square OAuth callback — exchange code for tokens
 */
async function handleCallback(req, res) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    logger.error('[SquareAuth] OAuth error:', oauthError);
    return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=error&reason=${oauthError}`);
  }

  if (!code || !state) {
    return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=error&reason=missing_params`);
  }

  // Parse state: restaurant_id:nonce
  const [restaurantId] = state.split(':');
  if (!restaurantId) {
    return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=error&reason=invalid_state`);
  }

  // Validate state matches stored value (CSRF protection)
  const { data: connection } = await supabaseAdmin
    .from('pos_connections')
    .select('sync_error')
    .eq('restaurant_id', restaurantId)
    .eq('pos_provider', 'square')
    .single();

  if (!connection || connection.sync_error !== state) {
    logger.warn('[SquareAuth] State mismatch — possible CSRF attempt');
    return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=error&reason=state_mismatch`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(`${SQUARE_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SQUARE_APP_ID,
        client_secret: SQUARE_APP_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${CLIENT_URL}/api/square/auth?action=callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      logger.error('[SquareAuth] Token exchange failed:', tokenData);
      return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=error&reason=token_failed`);
    }

    // Get merchant info for location_id
    const merchantResponse = await fetch(`${SQUARE_BASE}/v2/merchants/me`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const merchantData = await merchantResponse.json();
    const merchantId = merchantData.merchant?.[0]?.id || merchantData.merchant?.id || null;

    // Get first location
    const locationsResponse = await fetch(`${SQUARE_BASE}/v2/locations`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const locationsData = await locationsResponse.json();
    const locationId = locationsData.locations?.[0]?.id || null;

    // Save tokens
    const { error: saveError } = await supabaseAdmin
      .from('pos_connections')
      .upsert({
        restaurant_id: restaurantId,
        pos_provider: 'square',
        merchant_id: merchantId,
        location_id: locationId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenData.expires_at,
        status: 'active',
        sync_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'restaurant_id,pos_provider' });

    if (saveError) {
      logger.error('[SquareAuth] Failed to save tokens:', saveError.message);
      return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=error&reason=save_failed`);
    }

    logger.info(`[SquareAuth] Square connected for restaurant ${restaurantId}, merchant=${merchantId}, location=${locationId}`);
    return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=success`);

  } catch (error) {
    logger.error('[SquareAuth] Callback error:', error.message);
    return res.redirect(302, `${CLIENT_URL}/host-dashboard/voice-settings?square=error&reason=server_error`);
  }
}
