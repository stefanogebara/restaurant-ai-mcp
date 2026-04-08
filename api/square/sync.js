/**
 * Square Sync API
 *
 * GET  /api/square/sync?action=status    → Connection status
 * POST /api/square/sync?action=catalog   → Sync menu catalog now
 * POST /api/square/sync?action=disconnect → Disconnect Square
 *
 * Cron: /api/square/sync?action=cron_catalog  → Daily catalog sync (all restaurants)
 * Cron: /api/square/sync?action=cron_refresh  → Daily token refresh
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyAuth } = require('../_lib/auth');
const { setInternalCors } = require('../_lib/cors');
const { logCronRun, logCronError } = require('../_lib/cron-tracker');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('SquareSync');

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const SQUARE_BASE = SQUARE_ENV === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';
const SQUARE_APP_ID = process.env.SQUARE_APP_ID;
const SQUARE_APP_SECRET = process.env.SQUARE_APP_SECRET;

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  // Cron endpoints — secured with CRON_SECRET
  if (action === 'cron_catalog' || action === 'cron_refresh') {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (action === 'cron_catalog') return handleCronCatalog(req, res);
    if (action === 'cron_refresh') return handleCronRefresh(req, res);
  }

  // Authenticated endpoints
  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  switch (action) {
    case 'status': return handleStatus(req, res, auth.user);
    case 'catalog': return handleSyncCatalog(req, res, auth.user);
    case 'disconnect': return handleDisconnect(req, res, auth.user);
    default: return res.status(400).json({ success: false, error: 'Invalid action' });
  }
};

// ─── Status ──────────────────────────────────────────────────────────────────

async function handleStatus(req, res, user) {
  const { data: connection } = await supabaseAdmin
    .from('pos_connections')
    .select('id, pos_provider, merchant_id, location_id, status, last_sync_at, sync_error, created_at')
    .eq('restaurant_id', user.restaurant_id)
    .eq('pos_provider', 'square')
    .maybeSingle();

  const { count: menuCount } = await supabaseAdmin
    .from('pos_menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', user.restaurant_id);

  return res.status(200).json({
    success: true,
    connection: connection || null,
    menu_items_count: menuCount || 0,
  });
}

// ─── Sync Catalog (single restaurant, on-demand) ────────────────────────────

async function handleSyncCatalog(req, res, user) {
  const { data: connection } = await supabaseAdmin
    .from('pos_connections')
    .select('id, restaurant_id, pos_provider, merchant_id, location_id, access_token, refresh_token, token_expires_at, status, last_sync_at, sync_error, created_at, updated_at')
    .eq('restaurant_id', user.restaurant_id)
    .eq('pos_provider', 'square')
    .eq('status', 'active')
    .single();

  if (!connection) {
    return res.status(400).json({ success: false, error: 'No active Square connection' });
  }

  try {
    const result = await syncCatalogForConnection(connection);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error('[SquareSync] Catalog sync error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

async function handleDisconnect(req, res, user) {
  // Revoke token at Square
  const { data: connection } = await supabaseAdmin
    .from('pos_connections')
    .select('access_token')
    .eq('restaurant_id', user.restaurant_id)
    .eq('pos_provider', 'square')
    .maybeSingle();

  if (connection?.access_token) {
    try {
      await fetch(`${SQUARE_BASE}/oauth2/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Client ${SQUARE_APP_SECRET}`,
        },
        body: JSON.stringify({
          client_id: SQUARE_APP_ID,
          access_token: connection.access_token,
        }),
      });
    } catch (err) {
      logger.warn('[SquareSync] Token revoke failed (continuing):', err.message);
    }
  }

  // Delete connection and menu items
  await supabaseAdmin
    .from('pos_menu_items')
    .delete()
    .eq('restaurant_id', user.restaurant_id)
    .eq('pos_provider', 'square');

  await supabaseAdmin
    .from('pos_connections')
    .delete()
    .eq('restaurant_id', user.restaurant_id)
    .eq('pos_provider', 'square');

  logger.info(`[SquareSync] Disconnected Square for restaurant ${user.restaurant_id}`);
  return res.status(200).json({ success: true });
}

// ─── Cron: Catalog Sync (all active connections) ────────────────────────────

async function handleCronCatalog(req, res) {
  try {
    const { data: connections } = await supabaseAdmin
      .from('pos_connections')
      .select('id, restaurant_id, pos_provider, merchant_id, location_id, access_token, refresh_token, token_expires_at, status, last_sync_at, sync_error, created_at, updated_at')
      .eq('pos_provider', 'square')
      .eq('status', 'active');

    if (!connections || connections.length === 0) {
      await logCronRun('square-catalog-sync');
      return res.status(200).json({ success: true, synced: 0 });
    }

    let synced = 0;
    let errors = 0;

    for (const conn of connections) {
      try {
        await syncCatalogForConnection(conn);
        synced++;
      } catch (error) {
        errors++;
        logger.error(`[SquareSync] Catalog sync failed for ${conn.restaurant_id}:`, error.message);
        await supabaseAdmin
          .from('pos_connections')
          .update({ sync_error: error.message, updated_at: new Date().toISOString() })
          .eq('id', conn.id);
      }
    }

    await logCronRun('square-catalog-sync');
    return res.status(200).json({ success: true, synced, errors, total: connections.length });
  } catch (error) {
    await logCronError('square-catalog-sync', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ─── Cron: Token Refresh ────────────────────────────────────────────────────

async function handleCronRefresh(req, res) {
  try {
    // Refresh tokens expiring in the next 7 days
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: connections } = await supabaseAdmin
      .from('pos_connections')
      .select('id, restaurant_id, pos_provider, access_token, refresh_token, token_expires_at, status, sync_error, updated_at')
      .eq('pos_provider', 'square')
      .eq('status', 'active')
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', sevenDaysFromNow);

    if (!connections || connections.length === 0) {
      await logCronRun('square-token-refresh');
      return res.status(200).json({ success: true, refreshed: 0 });
    }

    let refreshed = 0;

    for (const conn of connections) {
      try {
        const response = await fetch(`${SQUARE_BASE}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: SQUARE_APP_ID,
            client_secret: SQUARE_APP_SECRET,
            refresh_token: conn.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const data = await response.json();

        if (response.ok && data.access_token) {
          await supabaseAdmin
            .from('pos_connections')
            .update({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              token_expires_at: data.expires_at,
              status: 'active',
              sync_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conn.id);
          refreshed++;
        } else {
          logger.error(`[SquareSync] Token refresh failed for ${conn.restaurant_id}:`, data);
          await supabaseAdmin
            .from('pos_connections')
            .update({ status: 'expired', sync_error: 'Token refresh failed', updated_at: new Date().toISOString() })
            .eq('id', conn.id);
        }
      } catch (error) {
        logger.error(`[SquareSync] Token refresh error for ${conn.restaurant_id}:`, error.message);
      }
    }

    await logCronRun('square-token-refresh');
    return res.status(200).json({ success: true, refreshed, total: connections.length });
  } catch (error) {
    await logCronError('square-token-refresh', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ─── Catalog Sync Logic ─────────────────────────────────────────────────────

async function syncCatalogForConnection(connection) {
  const { restaurant_id, access_token, location_id } = connection;

  // Fetch catalog from Square
  let allItems = [];
  let cursor = null;

  do {
    const url = new URL(`${SQUARE_BASE}/v2/catalog/list`);
    url.searchParams.set('types', 'ITEM,CATEGORY');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${access_token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Square API ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (data.objects) allItems.push(...data.objects);
    cursor = data.cursor || null;
  } while (cursor);

  // Parse categories
  const categories = {};
  allItems
    .filter(obj => obj.type === 'CATEGORY')
    .forEach(cat => {
      categories[cat.id] = cat.category_data?.name || 'Uncategorized';
    });

  // Parse items into menu records
  const menuItems = allItems
    .filter(obj => obj.type === 'ITEM')
    .flatMap(item => {
      const itemData = item.item_data || {};
      const categoryId = itemData.category_id || itemData.categories?.[0]?.id;
      const categoryName = categoryId ? (categories[categoryId] || 'Other') : 'Other';

      // Each variation is a menu item (e.g., Small/Medium/Large)
      const variations = itemData.variations || [];
      if (variations.length === 0) {
        return [{
          restaurant_id,
          pos_item_id: item.id,
          name: itemData.name || 'Unknown',
          description: itemData.description || null,
          price_cents: null,
          currency: 'USD',
          category: categoryName,
          modifiers: itemData.modifier_list_info || [],
          is_available: !item.is_deleted,
          image_url: null,
          pos_provider: 'square',
          last_synced_at: new Date().toISOString(),
        }];
      }

      return variations.map(v => {
        const varData = v.item_variation_data || {};
        const priceMoney = varData.price_money;
        const varName = variations.length > 1
          ? `${itemData.name} (${varData.name})`
          : itemData.name;

        return {
          restaurant_id,
          pos_item_id: v.id,
          name: varName || 'Unknown',
          description: itemData.description || null,
          price_cents: priceMoney ? Number(priceMoney.amount) : null,
          currency: priceMoney?.currency || 'USD',
          category: categoryName,
          modifiers: itemData.modifier_list_info || [],
          is_available: !item.is_deleted,
          image_url: null,
          pos_provider: 'square',
          last_synced_at: new Date().toISOString(),
        };
      });
    });

  if (menuItems.length === 0) {
    logger.info(`[SquareSync] No menu items found for restaurant ${restaurant_id}`);
    return { items_synced: 0 };
  }

  // Upsert menu items
  const { error: upsertError } = await supabaseAdmin
    .from('pos_menu_items')
    .upsert(menuItems, { onConflict: 'restaurant_id,pos_item_id' });

  if (upsertError) {
    throw new Error(`Menu upsert failed: ${upsertError.message}`);
  }

  // Update connection last_sync_at
  await supabaseAdmin
    .from('pos_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  logger.info(`[SquareSync] Synced ${menuItems.length} items for restaurant ${restaurant_id}`);
  return { items_synced: menuItems.length };
}
