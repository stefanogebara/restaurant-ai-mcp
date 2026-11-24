/**
 * External Booking Webhook
 *
 * POST /api/external-booking-webhook
 *
 * Accepts reservation data from external platforms (OpenTable, Resy, Google, etc.)
 * Auth: X-API-Key header, verified against the SHA-256 hashes in
 * restaurant.api_keys (api/_lib/api-key-auth), with the 'reservations:import'
 * permission (or '*').
 *
 * Deduplicates by (restaurant_id, source, external_id) to prevent double-booking.
 *
 * Deliberately NOT book_guest_reservation (the locked admission every guest
 * channel uses): these are bookings the guest already holds on the partner
 * platform. Refusing one for capacity would not cancel it there; the guest
 * would still arrive and the restaurant would not know. They are recorded as
 * sent, like a host booking. They are still counted by guest bookings: the
 * plain INSERT takes FOR KEY SHARE on the restaurant row, which waits for the
 * guest function's FOR UPDATE.
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
const { verifyApiKey, hasPermission } = require('./_lib/api-key-auth');
const { generateSecureReservationId } = require('./_lib/secure-id');
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

  // Authenticate via API key. Until 12/11/2026 this read a public.api_keys
  // table by the raw key, which does not exist: every call got 403.
  let auth;
  try {
    auth = await verifyApiKey(req);
  } catch (err) {
    return res.status(err.status || 401).json({ success: false, error: err.message });
  }
  if (!hasPermission(auth.permissions, 'reservations:import')) {
    return res.status(403).json({ success: false, error: 'API key lacks reservations:import permission' });
  }

  try {
    const restaurantId = auth.restaurant_id;

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
          // DD.1 — chain .select('id') so a 0-row match (deleted mid-flight)
          // reports 500 instead of telling the external booking platform
          // we cancelled their booking when we didn't.
          const { data: cancelData, error: cancelErr } = await supabaseAdmin
            .from('reservations')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select('id');

          if (cancelErr || !cancelData || cancelData.length === 0) {
            logger.error(`[ExternalBooking] cancel update failed/no-rows`, { id: existing.id, err: cancelErr?.message });
            return res.status(500).json({ success: false, error: 'Failed to cancel reservation' });
          }

          logger.info(`[ExternalBooking] Cancelled existing reservation ${existing.id} from ${source}`);
          return res.status(200).json({
            success: true,
            action: 'cancelled',
            reservation_id: existing.id,
          });
        }

        // Update fields — same .select('id') guard as the cancel branch.
        const { data: updData, error: updErr } = await supabaseAdmin
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
          .eq('id', existing.id)
          .select('id');

        if (updErr || !updData || updData.length === 0) {
          logger.error(`[ExternalBooking] update failed/no-rows`, { id: existing.id, err: updErr?.message });
          return res.status(500).json({ success: false, error: 'Failed to update reservation' });
        }

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
        // NOT NULL: without it every import failed, even with a valid key.
        reservation_id: generateSecureReservationId(),
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
