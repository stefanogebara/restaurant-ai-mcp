/**
 * Square Sync API
 * GET  /api/square/sync?action=status    → connection status + menu item count
 * POST /api/square/sync?action=catalog   → sync catalog from Square
 * POST /api/square/sync?action=disconnect → disconnect Square
 */

const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('square-sync');

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'production';
const SQUARE_API_BASE =
  SQUARE_ENV === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const { action } = req.query;

  if (req.method === 'GET' && action === 'status') return handleStatus(req, res);
  if (req.method === 'POST' && action === 'catalog') return handleCatalogSync(req, res);
  if (req.method === 'POST' && action === 'disconnect') return handleDisconnect(req, res);

  return res.status(400).json({ error: 'Unknown action', action });
};

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Status ─────────────────────────────────────────────────────────────────────

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

// ── Catalog Sync ───────────────────────────────────────────────────────────────

async function handleCatalogSync(req, res) {
  try {
    const user = await getAuth(req);
    const connection = await getConnection(user.restaurant_id);

    if (!connection) {
      return res.status(404).json({ success: false, error: 'No active Square connection' });
    }

    // Fetch catalog from Square
    const catalogRes = await fetch(
      `${SQUARE_API_BASE}/v2/catalog/list?types=ITEM`,
      {
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          'Square-Version': '2024-01-17',
        },
      }
    );

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

    // Update sync stats
    await supabaseAdmin
      .schema('restaurant').from('pos_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null,
        menu_items_synced: foodItems.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    logger.info('Catalog synced', {
      restaurantId: user.restaurant_id,
      itemCount: foodItems.length,
    });

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

// ── Disconnect ─────────────────────────────────────────────────────────────────

async function handleDisconnect(req, res) {
  try {
    const user = await getAuth(req);
    const connection = await getConnection(user.restaurant_id);

    if (!connection) {
      return res.status(404).json({ success: false, error: 'No active Square connection' });
    }

    // Try to revoke the token with Square (best effort)
    if (connection.access_token && process.env.SQUARE_APP_SECRET) {
      try {
        await fetch(`${SQUARE_API_BASE}/oauth2/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Client ${process.env.SQUARE_APP_SECRET}`,
            'Square-Version': '2024-01-17',
          },
          body: JSON.stringify({
            client_id: process.env.SQUARE_APP_ID,
            access_token: connection.access_token,
          }),
        });
      } catch (revokeErr) {
        logger.warn('Token revoke failed (non-fatal)', { error: revokeErr.message });
      }
    }

    // Mark as disconnected in DB
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
