/**
 * POS Table Status Endpoint
 *
 * POST /api/pos/table-status
 * Auth: API key via X-API-Key header
 *
 * POS reports table status changes (occupied/available/cleaning).
 */

const { verifyApiKey, hasPermission } = require('../_lib/api-key-auth');
const { supabaseAdmin } = require('../_lib/supabase');
const { setWebhookCors, handlePreflight } = require('../_lib/cors');
const { rejectOversizedBody } = require('../_lib/rate-limit');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('POS-TableStatus');

const VALID_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'];

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;
  if (rejectOversizedBody(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate via API key
  let auth;
  try {
    auth = await verifyApiKey(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!hasPermission(auth.permissions, 'pos:table_status')) {
    return res.status(403).json({ error: 'Insufficient permissions: pos:table_status required' });
  }

  const restaurantId = auth.restaurant_id;

  try {
    const { table_number, status } = req.body || {};

    if (!table_number) {
      return res.status(400).json({ error: 'table_number is required' });
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}`,
      });
    }

    // Find table by number
    const { data: table, error: findError } = await supabaseAdmin
      .from('tables')
      .select('id, table_number, status')
      .eq('restaurant_id', restaurantId)
      .eq('table_number', table_number)
      .eq('is_active', true)
      .single();

    if (findError || !table) {
      return res.status(404).json({ error: `Table ${table_number} not found` });
    }

    // Update status
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('tables')
      .update({ status })
      .eq('id', table.id)
      .eq('restaurant_id', restaurantId)
      .select('id, table_number, status')
      .single();

    if (updateError) {
      logger.error('Failed to update table status', updateError);
      return res.status(500).json({ error: 'Failed to update table status' });
    }

    // Dispatch webhook event (fire-and-forget)
    try {
      const { dispatchEvent } = require('../_services/webhookDispatcher');
      dispatchEvent(restaurantId, 'table.status_changed', {
        table_number: updated.table_number,
        previous_status: table.status,
        new_status: updated.status,
        changed_at: new Date().toISOString(),
      }).catch((err) => logger.warn('Webhook dispatch failed (non-fatal)', { error: err.message }));
    } catch {
      // webhookDispatcher not available — skip
    }

    logger.info('Table status updated', {
      table: table_number,
      from: table.status,
      to: status,
      restaurant: restaurantId,
    });

    return res.status(200).json({
      success: true,
      table: {
        table_number: updated.table_number,
        status: updated.status,
      },
    });
  } catch (err) {
    logger.error('Table status error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
