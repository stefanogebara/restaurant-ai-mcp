/**
 * Proactive Comms Queue API (C6)
 *
 * Manager interface for the queue produced by api/cron/proactive-comms.js.
 *
 * Endpoints:
 *   GET    /api/proactive-comms                       — list pending+approved items
 *   GET    /api/proactive-comms?status=sent           — list a specific status
 *   GET    /api/proactive-comms?id=<uuid>             — fetch one item
 *   PATCH  /api/proactive-comms?id=<uuid>             — { status?, draft_message? }
 *                                                       valid status transitions: pending→approved|dismissed,
 *                                                       approved→pending|dismissed
 *   POST   /api/proactive-comms?id=<uuid>&action=send — send via WhatsApp
 *
 * All operations are scoped to the authenticated user's restaurant. Returns
 * empty list (not 500) if the migration hasn't been applied yet — UI degrades
 * gracefully during the deploy window.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('./_lib/whatsapp-sender');

const logger = createSecureLogger('proactive-comms-api');

const VALID_STATUSES = ['pending', 'approved', 'sent', 'dismissed', 'expired'];

/**
 * "Table doesn't exist" can show up as either the postgres-native code 42P01
 * (raw connection) or PGRST205 (PostgREST schema-cache miss — what the
 * Supabase JS client actually returns). Both are treated as "migration not
 * yet applied" for graceful degradation.
 */
function isMissingTableError(error) {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205';
}
const ALLOWED_TRANSITIONS = {
  pending: new Set(['approved', 'dismissed']),
  approved: new Set(['pending', 'dismissed']),
  // sent/dismissed/expired are terminal
};

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  const restaurantId = authResult.user.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant associated with account' });
  }

  try {
    if (req.method === 'GET') return await handleGet(req, res, restaurantId);
    if (req.method === 'PATCH') return await handlePatch(req, res, restaurantId, authResult.user);
    if (req.method === 'POST') return await handlePost(req, res, restaurantId, authResult.user);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    logger.error('proactive-comms API error', { restaurantId, error: error.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET — list or fetch one
// ────────────────────────────────────────────────────────────────────────────

async function handleGet(req, res, restaurantId) {
  const { id, status } = req.query;

  // Single item
  if (id) {
    const item = await fetchById(restaurantId, id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true, item });
  }

  // List
  let query = supabaseAdmin
    .schema('restaurant')
    .from('proactive_comms_queue')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid_status' });
    }
    query = query.eq('status', status);
  } else {
    // Default: show actionable items (pending + approved)
    query = query.in('status', ['pending', 'approved']);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      // Table doesn't exist yet — return empty list so UI degrades gracefully
      return res.status(200).json({ success: true, items: [], migration_pending: true });
    }
    logger.error('Failed to list queue', { restaurantId, error: error.message });
    return res.status(500).json({ success: false, error: 'list_failed' });
  }

  // Tally per status for the dashboard badge
  const counts = { pending: 0, approved: 0, sent: 0, dismissed: 0, expired: 0 };
  for (const it of data || []) counts[it.status] = (counts[it.status] || 0) + 1;

  return res.status(200).json({ success: true, items: data || [], counts });
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH — update status or edit draft
// ────────────────────────────────────────────────────────────────────────────

async function handlePatch(req, res, restaurantId, user) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'id_required' });

  const { status, draft_message } = req.body || {};

  // Fetch current to validate transition
  const current = await fetchById(restaurantId, id);
  if (!current) return res.status(404).json({ success: false, error: 'Not found' });

  const updates = { updated_at: new Date().toISOString() };

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid_status' });
    }
    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed || !allowed.has(status)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_transition',
        message: `Cannot transition from ${current.status} → ${status}`,
      });
    }
    updates.status = status;
    if (status === 'approved') {
      updates.approved_by = user.sub || null;
      updates.approved_at = new Date().toISOString();
    }
  }

  if (draft_message !== undefined) {
    if (typeof draft_message !== 'string' || draft_message.length > 2000) {
      return res.status(400).json({ success: false, error: 'invalid_draft_message' });
    }
    updates.draft_message = draft_message;
  }

  if (Object.keys(updates).length === 1) {
    // only updated_at — nothing meaningful changed
    return res.status(400).json({ success: false, error: 'no_changes' });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('proactive_comms_queue')
    .update(updates)
    .eq('id', id)
    .eq('restaurant_id', restaurantId) // double-scope to prevent cross-tenant
    .select()
    .single();

  if (error) {
    logger.error('PATCH failed', { id, error: error.message });
    return res.status(500).json({ success: false, error: 'update_failed' });
  }

  return res.status(200).json({ success: true, item: data });
}

// ────────────────────────────────────────────────────────────────────────────
// POST — send the message
// ────────────────────────────────────────────────────────────────────────────

async function handlePost(req, res, restaurantId, user) {
  const { id, action } = req.query;
  if (action !== 'send') {
    return res.status(400).json({ success: false, error: 'unsupported_action', message: 'Use ?action=send' });
  }
  if (!id) return res.status(400).json({ success: false, error: 'id_required' });

  const item = await fetchById(restaurantId, id);
  if (!item) return res.status(404).json({ success: false, error: 'Not found' });

  // Must be approved before sending
  if (item.status !== 'approved') {
    return res.status(400).json({
      success: false,
      error: 'not_approved',
      message: 'Item must be in "approved" status to send. Current status: ' + item.status,
    });
  }

  // Use the manager's edited draft (PATCH already saved it)
  const message = item.draft_message;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'no_draft', message: 'No message to send' });
  }

  if (!isWhatsAppConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'whatsapp_not_configured',
      message: 'WhatsApp sender is not configured for this environment.',
    });
  }

  try {
    const sendResult = await sendWhatsAppMessage(item.customer_phone, message, {
      restaurant_id: restaurantId,
      campaign_type: 'proactive_comms',
    });

    if (!sendResult.success) {
      // Record the failure so the manager can see it and retry / dismiss
      await supabaseAdmin
        .schema('restaurant')
        .from('proactive_comms_queue')
        .update({
          send_error: sendResult.error || 'send_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('restaurant_id', restaurantId);
      return res.status(502).json({ success: false, error: 'send_failed', detail: sendResult.error });
    }

    const { data, error: updateErr } = await supabaseAdmin
      .schema('restaurant')
      .from('proactive_comms_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        send_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();

    if (updateErr) {
      logger.error('Send succeeded but DB update failed', { id, error: updateErr.message });
      // Still return success — the message went out, just couldn't mark as sent
      return res.status(200).json({ success: true, item, warning: 'sent_but_not_recorded' });
    }

    logger.info('Proactive comm sent', { id, restaurantId, customerPhone: item.customer_phone });
    return res.status(200).json({ success: true, item: data });
  } catch (err) {
    logger.error('Send threw', { id, error: err.message });
    return res.status(500).json({ success: false, error: 'send_threw', detail: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

async function fetchById(restaurantId, id) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('proactive_comms_queue')
    .select('*')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error && !isMissingTableError(error)) {
    logger.error('fetchById error', { id, error: error.message });
  }
  return data || null;
}
