/**
 * Square POS OAuth API
 *
 * Handles Square OAuth 2.0 flow for POS integration.
 *
 * Endpoints:
 * - GET ?action=authorize - Start OAuth flow (redirects to Square)
 * - GET ?action=callback - Handle OAuth callback
 * - POST ?action=disconnect - Revoke and disconnect
 * - GET ?action=status - Check connection status
 */

const { createClient } = require('@supabase/supabase-js');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const crypto = require('crypto');

const { verifyAuth } = require('./_lib/auth');
const logger = createSecureLogger('SquareOAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Square OAuth URLs
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const SQUARE_BASE_URL = SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

const SQUARE_OAUTH_URL = `${SQUARE_BASE_URL}/oauth2/authorize`;
const SQUARE_TOKEN_URL = `${SQUARE_BASE_URL}/oauth2/token`;
const SQUARE_REVOKE_URL = `${SQUARE_BASE_URL}/oauth2/revoke`;

// OAuth scopes needed
const SQUARE_SCOPES = [
  'PAYMENTS_READ',
  'ORDERS_READ',
  'CUSTOMERS_READ',
  'MERCHANT_PROFILE_READ'
].join(' ');

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const { action } = req.query;

  // Require auth for all actions except callback (external redirect from Square)
  if (action !== 'callback') {
    const auth = await verifyAuth(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }
  }

  try {
    switch (action) {
      case 'authorize':
        return await handleAuthorize(req, res);

      case 'callback':
        return await handleCallback(req, res);

      case 'disconnect':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed. Use POST' });
        }
        return await handleDisconnect(req, res);

      case 'status':
        return await handleStatus(req, res);

      default:
        return res.status(400).json({
          error: 'Invalid action',
          available_actions: {
            'authorize': 'GET /api/square-oauth?action=authorize&restaurant_id=xxx',
            'callback': 'GET /api/square-oauth?action=callback (called by Square)',
            'disconnect': 'POST /api/square-oauth?action=disconnect',
            'status': 'GET /api/square-oauth?action=status&restaurant_id=xxx'
          }
        });
    }
  } catch (error) {
    logger.error('Square OAuth API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Start OAuth authorization flow
 * GET /api/square-oauth?action=authorize&restaurant_id=xxx
 *
 * Redirects user to Square authorization page
 */
async function handleAuthorize(req, res) {
  const { restaurant_id } = req.query;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'restaurant_id is required'
    });
  }

  // Check Square credentials are configured
  if (!process.env.SQUARE_APPLICATION_ID || !process.env.SQUARE_APPLICATION_SECRET) {
    return res.status(500).json({
      success: false,
      error: 'Square credentials not configured'
    });
  }

  // Generate state parameter for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');

  // Store state in database temporarily (expires in 10 minutes)
  const { error: stateError } = await supabase
    .from('pos_connections')
    .upsert({
      restaurant_id,
      pos_provider: 'square',
      merchant_id: 'pending', // Will be updated on callback
      access_token: state, // Temporarily store state here
      status: 'pending',
      connected_at: new Date().toISOString()
    }, {
      onConflict: 'restaurant_id,pos_provider'
    });

  if (stateError) {
    logger.error('Error storing OAuth state:', stateError);
    return res.status(500).json({
      success: false,
      error: 'Failed to initiate OAuth flow'
    });
  }

  // Build authorization URL
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const redirectUri = `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : clientUrl}/api/square-oauth?action=callback`;

  const authUrl = new URL(SQUARE_OAUTH_URL);
  authUrl.searchParams.set('client_id', process.env.SQUARE_APPLICATION_ID);
  authUrl.searchParams.set('scope', SQUARE_SCOPES);
  authUrl.searchParams.set('session', 'false');
  authUrl.searchParams.set('state', `${restaurant_id}:${state}`);
  authUrl.searchParams.set('redirect_uri', redirectUri);

  logger.info(`Redirecting to Square OAuth for restaurant ${restaurant_id}`);

  // Redirect to Square
  res.redirect(302, authUrl.toString());
}

/**
 * Handle OAuth callback from Square
 * GET /api/square-oauth?action=callback&code=xxx&state=xxx
 */
async function handleCallback(req, res) {
  const { code, state, error, error_description } = req.query;

  // Handle OAuth error
  if (error) {
    logger.error('Square OAuth error:', error, error_description);
    return redirectWithError(res, 'Square authorization failed: ' + (error_description || error));
  }

  if (!code || !state) {
    return redirectWithError(res, 'Missing authorization code or state');
  }

  // Parse state to get restaurant_id
  const [restaurant_id, expectedState] = state.split(':');

  if (!restaurant_id || !expectedState) {
    return redirectWithError(res, 'Invalid state parameter');
  }

  // Verify state matches what we stored
  const { data: pending, error: fetchError } = await supabase
    .from('pos_connections')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square')
    .eq('status', 'pending')
    .single();

  if (fetchError || !pending || pending.access_token !== expectedState) {
    logger.error('State mismatch or expired');
    return redirectWithError(res, 'Authorization session expired or invalid');
  }

  // Exchange code for tokens
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const redirectUri = `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : clientUrl}/api/square-oauth?action=callback`;

  try {
    const tokenResponse = await fetch(SQUARE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-17'
      },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_APPLICATION_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error('Token exchange failed:', errorData);
      return redirectWithError(res, 'Failed to exchange authorization code');
    }

    const tokenData = await tokenResponse.json();

    // Get merchant info
    const merchantResponse = await fetch(`${SQUARE_BASE_URL}/v2/merchants/me`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Square-Version': '2024-01-17'
      }
    });

    let merchantId = 'unknown';
    let locationId = null;

    if (merchantResponse.ok) {
      const merchantData = await merchantResponse.json();
      merchantId = merchantData.merchant?.id || 'unknown';

      // Get first location
      const locationsResponse = await fetch(`${SQUARE_BASE_URL}/v2/locations`, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Square-Version': '2024-01-17'
        }
      });

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        locationId = locationsData.locations?.[0]?.id || null;
      }
    }

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 2592000));

    // Generate webhook signature key
    const webhookSignatureKey = crypto.randomBytes(32).toString('hex');

    // Update connection with tokens
    const { error: updateError } = await supabase
      .from('pos_connections')
      .update({
        merchant_id: merchantId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        location_id: locationId,
        webhook_signature_key: webhookSignatureKey,
        status: 'active',
        connected_at: new Date().toISOString()
      })
      .eq('id', pending.id);

    if (updateError) {
      logger.error('Error saving tokens:', updateError);
      return redirectWithError(res, 'Failed to save connection');
    }

    logger.info(`Square connected successfully for restaurant ${restaurant_id}`);

    // Redirect to success page
    const successUrl = new URL(`${clientUrl}/host-dashboard/settings`);
    successUrl.searchParams.set('pos_connected', 'true');
    successUrl.searchParams.set('pos_provider', 'square');

    res.redirect(302, successUrl.toString());

  } catch (error) {
    logger.error('OAuth callback error:', error);
    return redirectWithError(res, 'An unexpected error occurred');
  }
}

/**
 * Disconnect Square POS
 * POST /api/square-oauth?action=disconnect
 *
 * Body: { restaurant_id: "xxx" }
 */
async function handleDisconnect(req, res) {
  const { restaurant_id } = req.body;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'restaurant_id is required'
    });
  }

  // Get current connection
  const { data: connection, error: fetchError } = await supabase
    .from('pos_connections')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square')
    .single();

  if (fetchError || !connection) {
    return res.status(404).json({
      success: false,
      error: 'No Square connection found'
    });
  }

  // Revoke token at Square
  try {
    await fetch(SQUARE_REVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-17',
        'Authorization': `Client ${process.env.SQUARE_APPLICATION_SECRET}`
      },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID,
        access_token: connection.access_token
      })
    });
  } catch (error) {
    logger.error('Error revoking Square token:', error);
    // Continue anyway - we'll mark as disconnected
  }

  // Update connection status
  const { error: updateError } = await supabase
    .from('pos_connections')
    .update({
      status: 'disconnected',
      access_token: null,
      refresh_token: null
    })
    .eq('id', connection.id);

  if (updateError) {
    logger.error('Error updating connection status:', updateError);
    return res.status(500).json({
      success: false,
      error: 'Failed to disconnect'
    });
  }

  logger.info(`Square disconnected for restaurant ${restaurant_id}`);

  return res.json({
    success: true,
    message: 'Square POS disconnected successfully'
  });
}

/**
 * Check Square connection status
 * GET /api/square-oauth?action=status&restaurant_id=xxx
 */
async function handleStatus(req, res) {
  const { restaurant_id } = req.query;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'restaurant_id is required'
    });
  }

  const { data: connection, error } = await supabase
    .from('pos_connections')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .eq('pos_provider', 'square')
    .single();

  if (error || !connection) {
    return res.json({
      success: true,
      connected: false,
      status: 'not_connected'
    });
  }

  // Check if token is expired
  const isExpired = connection.token_expires_at &&
    new Date(connection.token_expires_at) <= new Date();

  return res.json({
    success: true,
    connected: connection.status === 'active' && !isExpired,
    status: isExpired ? 'expired' : connection.status,
    merchant_id: connection.merchant_id,
    location_id: connection.location_id,
    connected_at: connection.connected_at,
    last_sync_at: connection.last_sync_at,
    sync_error: connection.sync_error
  });
}

/**
 * Redirect with error message
 */
function redirectWithError(res, message) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const errorUrl = new URL(`${clientUrl}/host-dashboard/settings`);
  errorUrl.searchParams.set('pos_error', message);
  res.redirect(302, errorUrl.toString());
}
