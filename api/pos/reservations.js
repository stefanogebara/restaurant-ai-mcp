/**
 * POS Reservations Endpoint
 *
 * GET /api/pos/reservations
 * Auth: API key via X-API-Key header
 *
 * Pull today's reservations (or date range) for POS display.
 * Query params: date, start_date, end_date, status, limit, offset
 */

const { verifyApiKey, hasPermission } = require('../_lib/api-key-auth');
const { supabaseAdmin } = require('../_lib/supabase');
const { setWebhookCors, handlePreflight } = require('../_lib/cors');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('POS-Reservations');

// ISO date pattern YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate via API key
  let auth;
  try {
    auth = await verifyApiKey(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!hasPermission(auth.permissions, 'pos:reservations_read')) {
    return res.status(403).json({ error: 'Insufficient permissions: pos:reservations_read required' });
  }

  const restaurantId = auth.restaurant_id;

  try {
    const {
      date,
      start_date,
      end_date,
      status,
      limit: rawLimit = '50',
      offset: rawOffset = '0',
    } = req.query;

    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);

    let query = supabaseAdmin
      .from('reservations')
      .select('*', { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .order('reservation_time', { ascending: true })
      .range(offset, offset + limit - 1);

    // Date filtering
    if (date) {
      if (!DATE_REGEX.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }
      query = query
        .gte('reservation_time', `${date}T00:00:00`)
        .lt('reservation_time', `${date}T23:59:59`);
    } else if (start_date || end_date) {
      if (start_date) {
        if (!DATE_REGEX.test(start_date)) {
          return res.status(400).json({ error: 'Invalid start_date format. Use YYYY-MM-DD.' });
        }
        query = query.gte('reservation_time', `${start_date}T00:00:00`);
      }
      if (end_date) {
        if (!DATE_REGEX.test(end_date)) {
          return res.status(400).json({ error: 'Invalid end_date format. Use YYYY-MM-DD.' });
        }
        query = query.lte('reservation_time', `${end_date}T23:59:59`);
      }
    } else {
      // Default: today
      const today = new Date().toISOString().slice(0, 10);
      query = query
        .gte('reservation_time', `${today}T00:00:00`)
        .lt('reservation_time', `${today}T23:59:59`);
    }

    // Status filter
    if (status) {
      const validStatuses = ['confirmed', 'seated', 'completed', 'cancelled', 'no_show'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
        });
      }
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch reservations', error);
      return res.status(500).json({ error: 'Failed to fetch reservations' });
    }

    const reservations = (data || []).map((r) => ({
      id: r.id,
      reservation_id: r.reservation_id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      customer_email: r.customer_email || null,
      party_size: r.party_size,
      reservation_time: r.reservation_time,
      status: r.status,
      special_requests: r.special_requests || null,
      created_at: r.created_at,
    }));

    return res.status(200).json({
      success: true,
      reservations,
      meta: {
        total: count || 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    logger.error('POS reservations error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
