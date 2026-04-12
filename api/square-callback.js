/**
 * Square OAuth Callback
 * GET /api/square/callback
 *
 * Handles the redirect from Square after user authorizes.
 * Exchanges the code for an access token, fetches merchant info,
 * and stores the connection in pos_connections.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('square-callback');

const SQUARE_APP_ID = process.env.SQUARE_APP_ID;
const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;
const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'production';
const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';

const SQUARE_API_BASE =
  SQUARE_ENV === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';

const SETTINGS_REDIRECT = `${CLIENT_URL}/host-dashboard/voice-settings`;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: squareError } = req.query;

  // User denied authorization
  if (squareError) {
    logger.warn('Square OAuth denied', { error: squareError });
    return res.redirect(`${SETTINGS_REDIRECT}?pos_error=denied`);
  }

  if (!code || !state) {
    return res.redirect(`${SETTINGS_REDIRECT}?pos_error=invalid_callback`);
  }

  // Decode state to get restaurant_id
  let restaurantId;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [rid] = decoded.split(':');
    if (!rid) throw new Error('Invalid state format');
    restaurantId = rid;
  } catch (err) {
    logger.error('Invalid state param', { error: err.message });
    return res.redirect(`${SETTINGS_REDIRECT}?pos_error=invalid_state`);
  }

  if (!SQUARE_APP_ID || !SQUARE_APP_SECRET) {
    logger.error('Square credentials not configured');
    return res.redirect(`${SETTINGS_REDIRECT}?pos_error=not_configured`);
  }

  try {
    // Exchange code for access token
    const callbackUrl = `${CLIENT_URL}/api/square/callback`;
    const tokenRes = await fetch(`${SQUARE_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
      body: JSON.stringify({
        client_id: SQUARE_APP_ID,
        client_secret: SQUARE_APP_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      logger.error('Token exchange failed', { status: tokenRes.status });
      return res.redirect(`${SETTINGS_REDIRECT}?pos_error=token_failed`);
    }

    const { access_token, refresh_token, expires_at, merchant_id } = tokenData;

    // Fetch first location for this merchant
    let locationId = null;
    try {
      const locRes = await fetch(`${SQUARE_API_BASE}/v2/locations`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Square-Version': '2024-01-17',
        },
      });
      if (locRes.ok) {
        const locData = await locRes.json();
        locationId = locData.locations?.[0]?.id || null;
      }
    } catch (err) {
      logger.warn('Could not fetch locations', { error: err.message });
    }

    // Upsert pos_connections (one per restaurant, replace on conflict)
    const { error: dbErr } = await supabaseAdmin
      .schema('restaurant').from('pos_connections')
      .upsert(
        {
          restaurant_id: restaurantId,
          pos_provider: 'square',
          merchant_id: merchant_id || null,
          location_id: locationId,
          access_token,
          refresh_token: refresh_token || null,
          token_expires_at: expires_at || null,
          status: 'active',
          sync_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,pos_provider' }
      );

    if (dbErr) {
      logger.error('DB upsert failed', { error: dbErr.message });
      return res.redirect(`${SETTINGS_REDIRECT}?pos_error=db_error`);
    }

    logger.info('Square connected', { restaurantId, merchantId: merchant_id });
    res.redirect(`${SETTINGS_REDIRECT}?pos_connected=1`);
  } catch (err) {
    logger.error('OAuth callback error', { error: err.message });
    res.redirect(`${SETTINGS_REDIRECT}?pos_error=server_error`);
  }
};
