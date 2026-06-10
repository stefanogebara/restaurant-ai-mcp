/**
 * Square integration — consolidated handler.
 *
 * Three former single-file endpoints folded into one Vercel function to
 * cut per-function NFT-trace/bundle time at deploy. Routing is by the
 * `route` query param (NOT `action` — square-sync uses `action` for its
 * own sub-routing, which is preserved):
 *
 *   GET  /api/square?route=auth                       → OAuth URL generator (JWT)
 *   GET  /api/square?route=callback&code=&state=      → OAuth callback (public redirect)
 *   GET  /api/square?route=sync&action=status         → connection status (JWT)
 *   POST /api/square?route=sync&action=catalog        → sync catalog (JWT)
 *   POST /api/square?route=sync&action=disconnect     → disconnect (JWT)
 *
 * vercel.json rewrites map the stable public paths
 * (/api/square/auth, /api/square/callback, /api/square/sync) onto these.
 *
 * NOT included here: square-webhook. It sets `bodyParser: false` to read
 * raw bytes for HMAC signature verification — a function-global setting
 * that would break the JSON/redirect handlers above. It stays a separate
 * function (api/square-webhook.js).
 */

const crypto = require('crypto');
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('square');

const SQUARE_APP_ID = process.env.SQUARE_APP_ID;
const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;
const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'production';
const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';

const SQUARE_API_BASE =
  SQUARE_ENV === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
const SQUARE_OAUTH_BASE = `${SQUARE_API_BASE}/oauth2/authorize`;

const SQUARE_SCOPES = ['ITEMS_READ', 'MERCHANT_PROFILE_READ', 'INVENTORY_READ', 'ORDERS_READ'].join('+');
const SETTINGS_REDIRECT = `${CLIENT_URL}/host-dashboard/voice-settings`;

module.exports = async (req, res) => {
  const { route } = req.query;

  if (route === 'auth') return handleAuth(req, res);
  if (route === 'callback') return handleCallback(req, res);
  if (route === 'sync') return handleSync(req, res);

  return res.status(400).json({ error: 'Unknown route', route: route || null });
};

// ── route=auth ───────────────────────────────────────────────────────────────
// GET /api/square?route=auth — returns the Square OAuth URL for the
// authenticated restaurant. State = base64url(restaurant_id:nonce) for CSRF.

async function handleAuth(req, res) {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SQUARE_APP_ID) {
    logger.error('SQUARE_APP_ID not configured');
    return res.status(503).json({
      success: false,
      error: 'Square integration not yet configured. Contact hello@seatable.one to request early access.',
    });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const state = Buffer.from(`${user.restaurant_id}:${nonce}`).toString('base64url');

  const callbackUrl = `${CLIENT_URL}/api/square/callback`;
  const url =
    `${SQUARE_OAUTH_BASE}` +
    `?client_id=${encodeURIComponent(SQUARE_APP_ID)}` +
    `&scope=${SQUARE_SCOPES}` +
    `&session=false` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}`;

  logger.info('Generated Square OAuth URL', { restaurantId: user.restaurant_id });
  return res.json({ success: true, url });
}

// ── route=callback ─────────────────────────────────────────────────────────────
// GET /api/square?route=callback — Square redirects here after authorization.
// Exchanges code for token, fetches merchant location, stores connection.

async function handleCallback(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: squareError } = req.query;

  if (squareError) {
    logger.warn('Square OAuth denied', { error: squareError });
    return res.redirect(`${SETTINGS_REDIRECT}?pos_error=denied`);
  }

  if (!code || !state) {
    return res.redirect(`${SETTINGS_REDIRECT}?pos_error=invalid_callback`);
  }

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

    let locationId = null;
    try {
      const locRes = await fetch(`${SQUARE_API_BASE}/v2/locations`, {
        headers: { Authorization: `Bearer ${access_token}`, 'Square-Version': '2024-01-17' },
      });
      if (locRes.ok) {
        const locData = await locRes.json();
        locationId = locData.locations?.[0]?.id || null;
      }
    } catch (err) {
      logger.warn('Could not fetch locations', { error: err.message });
    }

    const row = {
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
    };

    // Partial unique index (WHERE status <> 'disconnected') can't drive
    // ON CONFLICT, so look up the active row first then UPDATE/INSERT.
    const { data: existing, error: selErr } = await supabaseAdmin
      .schema('restaurant').from('pos_connections')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('pos_provider', 'square')
      .neq('status', 'disconnected')
      .maybeSingle();

    if (selErr) {
      logger.error('Lookup failed', { error: selErr.message });
      return res.redirect(`${SETTINGS_REDIRECT}?pos_error=db_error`);
    }

    const { error: dbErr } = existing
      ? await supabaseAdmin
          .schema('restaurant').from('pos_connections')
          .update(row)
          .eq('id', existing.id)
      : await supabaseAdmin
          .schema('restaurant').from('pos_connections')
          .insert(row);

    if (dbErr) {
      logger.error('DB write failed', { error: dbErr.message });
      return res.redirect(`${SETTINGS_REDIRECT}?pos_error=db_error`);
    }

    logger.info('Square connected', { restaurantId, merchantId: merchant_id });
    res.redirect(`${SETTINGS_REDIRECT}?pos_connected=1`);
  } catch (err) {
    logger.error('OAuth callback error', { error: err.message });
    res.redirect(`${SETTINGS_REDIRECT}?pos_error=server_error`);
  }
}

// ── route=sync ───────────────────────────────────────────────────────────────
// Dispatches on ?action=status|catalog|disconnect (preserves the original
// square-sync sub-routing contract that the frontend calls).

async function handleSync(req, res) {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const { action } = req.query;

  if (req.method === 'GET' && action === 'status') return handleStatus(req, res);
  if (req.method === 'POST' && action === 'catalog') return handleCatalogSync(req, res);
  if (req.method === 'POST' && action === 'disconnect') return handleDisconnect(req, res);

  return res.status(400).json({ error: 'Unknown action', action: action || null });
}

async function getAuth(req) {
  const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
  if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
  return user;
}

async function getConnection(restaurantId) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant').from('pos_connections')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('pos_provider', 'square')
    .neq('status', 'disconnected')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function handleStatus(req, res) {
  try {
    const user = await getAuth(req);
    const connection = await getConnection(user.restaurant_id);

    return res.json({
      success: true,
      connection: connection
        ? {
            id: connection.id,
            pos_provider: connection.pos_provider,
            merchant_id: connection.merchant_id,
            location_id: connection.location_id,
            status: connection.status,
            last_sync_at: connection.last_sync_at,
            sync_error: connection.sync_error,
            created_at: connection.created_at,
          }
        : null,
      menu_items_count: connection?.menu_items_synced || 0,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('Status error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function handleCatalogSync(req, res) {
  try {
    const user = await getAuth(req);
    const connection = await getConnection(user.restaurant_id);

    if (!connection) {
      return res.status(404).json({ success: false, error: 'No active Square connection' });
    }

    const catalogRes = await fetch(`${SQUARE_API_BASE}/v2/catalog/list?types=ITEM`, {
      headers: { Authorization: `Bearer ${connection.access_token}`, 'Square-Version': '2024-01-17' },
    });

    if (!catalogRes.ok) {
      const errData = await catalogRes.json().catch(() => ({}));
      const errorMsg = errData.errors?.[0]?.detail || 'Square API error';

      await supabaseAdmin
        .schema('restaurant').from('pos_connections')
        .update({ sync_error: errorMsg, updated_at: new Date().toISOString() })
        .eq('id', connection.id);

      return res.status(502).json({ success: false, error: errorMsg });
    }

    const catalogData = await catalogRes.json();
    const items = catalogData.objects || [];
    const foodItems = items.filter(
      (obj) => obj.type === 'ITEM' && obj.item_data?.product_type !== 'APPOINTMENTS_SERVICE'
    );

    await supabaseAdmin
      .schema('restaurant').from('pos_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null,
        menu_items_synced: foodItems.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    logger.info('Catalog synced', { restaurantId: user.restaurant_id, itemCount: foodItems.length });

    return res.json({
      success: true,
      synced_items: foodItems.length,
      message: `Synced ${foodItems.length} menu items from Square`,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('Catalog sync error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function handleDisconnect(req, res) {
  try {
    const user = await getAuth(req);
    const connection = await getConnection(user.restaurant_id);

    if (!connection) {
      return res.status(404).json({ success: false, error: 'No active Square connection' });
    }

    if (connection.access_token && SQUARE_APP_SECRET) {
      try {
        await fetch(`${SQUARE_API_BASE}/oauth2/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Client ${SQUARE_APP_SECRET}`,
            'Square-Version': '2024-01-17',
          },
          body: JSON.stringify({ client_id: SQUARE_APP_ID, access_token: connection.access_token }),
        });
      } catch (revokeErr) {
        logger.warn('Token revoke failed (non-fatal)', { error: revokeErr.message });
      }
    }

    await supabaseAdmin
      .schema('restaurant').from('pos_connections')
      .update({
        status: 'disconnected',
        access_token: null,
        refresh_token: null,
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    logger.info('Square disconnected', { restaurantId: user.restaurant_id });
    return res.json({ success: true, message: 'Square disconnected' });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('Disconnect error', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
