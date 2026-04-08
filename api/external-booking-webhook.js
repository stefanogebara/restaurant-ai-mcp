/**
 * External Booking Webhook
 *
 * POST /api/external-booking-webhook
 *
 * Accepts reservation data from external platforms (OpenTable, Resy, Google, etc.)
 * Auth: X-API-Key header matched against restaurant's API key.
 *
 * Deduplicates by (restaurant_id, source, external_id) to prevent double-booking.
 *
 * Request body:
 * {
 *   "source": "opentable",
 *   "external_id": "OT-12345",
 *   "guest_name": "John Doe",
 *   "guest_phone": "+1234567890",
 *   "guest_email": "john@example.com",
 *   "party_size": 4,
 *   "reservation_date": "2026-04-15",
 *   "reservation_time": "19:30",
 *   "special_requests": "Anniversary dinner",
 *   "status": "confirmed"
 * }
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('ExternalBookingWebhook');

const VALID_SOURCES = ['opentable', 'resy', 'google', 'thefork', 'yelp', 'manual', 'other'];
const VALID_STATUSES = ['confirmed', 'pending', 'cancelled', 'no_show'];

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Authenticate via API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'X-API-Key header required' });
  }

  try {
    // Look up API key to get restaurant_id
    const { data: keyRecord, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('restaurant_id, is_active')
      .eq('key_value', apiKey)
      .eq('is_active', true)
      .maybeSingle();

    if (keyError || !keyRecord) {
      return res.status(403).json({ success: false, error: 'Invalid or inactive API key' });
    }

    const restaurantId = keyRecord.restaurant_id;

    // Validate request body
    const {
      source,
      external_id,
      guest_name,
      guest_phone,
      guest_email,
      party_size,
      reservation_date,
      reservation_time,
      special_requests,
      status = 'confirmed',
    } = req.body;

    if (!source || !VALID_SOURCES.includes(source)) {
      return res.status(400).json({
        success: false,
        error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`,
      });
    }

    // Accept both naming conventions (guest_name or customer_name)
    const customerName = guest_name || req.body.customer_name;
    const customerPhone = guest_phone || req.body.customer_phone;
    const customerEmail = guest_email || req.body.customer_email;

    if (!customerName || !party_size || !reservation_date || !reservation_time) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: guest_name, party_size, reservation_date, reservation_time',
      });
    }

    if (!Number.isInteger(party_size) || party_size < 1 || party_size > 50) {
      return res.status(400).json({ success: false, error: 'party_size must be 1-50' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    // Date format validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation_date)) {
      return res.status(400).json({ success: false, error: 'reservation_date must be YYYY-MM-DD' });
    }

    if (!/^\d{2}:\d{2}$/.test(reservation_time)) {
      return res.status(400).json({ success: false, error: 'reservation_time must be HH:MM' });
    }

    // Dedup check: if external_id provided, check for existing
    if (external_id) {
      const { data: existing } = await supabaseAdmin
        .from('reservations')
        .select('id, status')
        .eq('restaurant_id', restaurantId)
        .eq('source', source)
        .eq('external_id', external_id)
        .maybeSingle();

      if (existing) {
        // Update existing reservation instead of creating duplicate
        if (status === 'cancelled') {
          await supabaseAdmin
            .from('reservations')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', existing.id);

          logger.info(`[ExternalBooking] Cancelled existing reservation ${existing.id} from ${source}`);
          return res.status(200).json({
            success: true,
            action: 'cancelled',
            reservation_id: existing.id,
          });
        }

        // Update fields
        await supabaseAdmin
          .from('reservations')
          .update({
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_email: customerEmail,
            party_size,
            date: reservation_date,
            time: reservation_time,
            special_requests,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        logger.info(`[ExternalBooking] Updated existing reservation ${existing.id} from ${source}`);
        return res.status(200).json({
          success: true,
          action: 'updated',
          reservation_id: existing.id,
        });
      }
    }

    // Create new reservation
    const { data: reservation, error: createError } = await supabaseAdmin
      .from('reservations')
      .insert({
        restaurant_id: restaurantId,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        party_size,
        date: reservation_date,
        time: reservation_time,
        special_requests: special_requests || null,
        status,
        source,
        external_id: external_id || null,
      })
      .select('id')
      .single();

    if (createError) {
      logger.error('[ExternalBooking] Create error:', createError.message);
      return res.status(500).json({ success: false, error: 'Failed to create reservation' });
    }

    logger.info(`[ExternalBooking] Created reservation ${reservation.id} from ${source} for ${customerName}`);
    return res.status(201).json({
      success: true,
      action: 'created',
      reservation_id: reservation.id,
    });

  } catch (error) {
    logger.error('[ExternalBooking] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
