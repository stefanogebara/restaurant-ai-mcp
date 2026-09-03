/**
 * Google Reserve Booking Server
 *
 * Implements the Google Actions Center Booking Server API.
 * https://developers.google.com/actions-center/verticals/reservations/e2e/overview
 *
 * Required endpoints:
 *   POST /api/google-booking/server?action=BatchAvailabilityLookup
 *   POST /api/google-booking/server?action=CreateBooking
 *   POST /api/google-booking/server?action=UpdateBooking
 *   GET  /api/google-booking/server?action=HealthCheck
 *
 * Auth: Bearer token matching GOOGLE_BOOKING_SECRET env var
 *
 * Maps to existing Seatable reservation functions (tool-handlers, availability-calculator).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('GoogleBookingServer');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Auth: Bearer token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const expectedToken = process.env.GOOGLE_BOOKING_SECRET;

  if (!expectedToken) {
    return res.status(503).json({ error: 'Google Booking not configured' });
  }

  // HealthCheck is GET, allow without auth for Google probes
  const action = req.query.action;
  if (action === 'HealthCheck') {
    return handleHealthCheck(req, res);
  }

  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  switch (action) {
    case 'BatchAvailabilityLookup':
      return handleBatchAvailabilityLookup(req, res);
    case 'CreateBooking':
      return handleCreateBooking(req, res);
    case 'UpdateBooking':
      return handleUpdateBooking(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
};

// ─── HealthCheck ────────────────────────────────────────────────────────────

async function handleHealthCheck(req, res) {
  try {
    // Quick DB ping
    const { error } = await supabaseAdmin.from('reservations').select('id').limit(1);
    if (error) throw error;

    return res.status(200).json({
      status: 'SERVING',
      version: '1.0.0',
    });
  } catch (error) {
    logger.error('[GoogleBooking] HealthCheck failed:', error.message);
    return res.status(503).json({ status: 'NOT_SERVING' });
  }
}

// ─── BatchAvailabilityLookup ─────────────────────────────────────────────────

async function handleBatchAvailabilityLookup(req, res) {
  const { slot_time_range, merchant_id, party_size } = req.body;

  if (!merchant_id || !party_size) {
    return res.status(400).json({ error: 'merchant_id and party_size required' });
  }

  try {
    // merchant_id maps to restaurant_id in our system
    const restaurantId = merchant_id;

    // Get restaurant config for business hours
    const { data: config } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('business_hours, average_dining_duration_minutes')
      .eq('id', restaurantId)
      .single();

    if (!config) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Parse date range
    const startDate = slot_time_range?.start_date || new Date().toISOString().split('T')[0];
    const endDate = slot_time_range?.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get existing reservations for the date range
    const { data: existingReservations } = await supabaseAdmin
      .from('reservations')
      .select('date, time, party_size')
      .eq('restaurant_id', restaurantId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('status', ['confirmed', 'pending']);

    // Get tables
    const { data: tables } = await supabaseAdmin
      .from('tables')
      .select('id, capacity')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true);

    const totalCapacity = (tables || []).reduce((sum, t) => sum + t.capacity, 0);
    const diningDuration = config.avg_dining_duration_minutes || 90;

    // Generate available time slots
    const slots = generateAvailableSlots(
      startDate,
      endDate,
      config.business_hours,
      existingReservations || [],
      totalCapacity,
      party_size,
      diningDuration
    );

    return res.status(200).json({
      slots: slots.map(slot => ({
        merchant_id: restaurantId,
        service_id: 'dining',
        start_time: slot.start,
        duration_seconds: diningDuration * 60,
        available_spots: slot.spotsAvailable,
        resources: {
          party_size: parseInt(party_size),
        },
      })),
    });

  } catch (error) {
    logger.error('[GoogleBooking] AvailabilityLookup error:', error.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ─── CreateBooking ───────────────────────────────────────────────────────────

async function handleCreateBooking(req, res) {
  const { slot, user_information, idempotency_token } = req.body;

  if (!slot || !user_information) {
    return res.status(400).json({ error: 'slot and user_information required' });
  }

  try {
    const restaurantId = slot.merchant_id;

    // Idempotency check
    if (idempotency_token) {
      const { data: existing } = await supabaseAdmin
        .from('reservations')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('external_id', idempotency_token)
        .eq('source', 'google')
        .maybeSingle();

      if (existing) {
        return res.status(200).json({
          booking: {
            booking_id: existing.id,
            status: 'CONFIRMED',
          },
        });
      }
    }

    // Parse slot time
    const startTime = new Date(slot.start_time);
    const reservationDate = startTime.toISOString().split('T')[0];
    const reservationTime = startTime.toISOString().split('T')[1].substring(0, 5);
    const partySize = slot.resources?.party_size || 2;

    const guestName = [
      user_information.given_name,
      user_information.family_name,
    ].filter(Boolean).join(' ') || 'Google Guest';

    const { data: reservation, error: createError } = await supabaseAdmin
      .from('reservations')
      .insert({
        restaurant_id: restaurantId,
        customer_name: guestName,
        customer_phone: user_information.telephone || null,
        customer_email: user_information.email || null,
        party_size: partySize,
        date: reservationDate,
        time: reservationTime,
        status: 'confirmed',
        source: 'google',
        external_id: idempotency_token || null,
      })
      .select('id')
      .single();

    if (createError) {
      logger.error('[GoogleBooking] CreateBooking error:', createError.message);
      return res.status(500).json({
        booking_failure: {
          cause: 'SLOT_UNAVAILABLE',
          description: 'Unable to create reservation',
        },
      });
    }

    logger.info(`[GoogleBooking] Created booking ${reservation.id} for ${guestName}, party of ${partySize}`);

    return res.status(200).json({
      booking: {
        booking_id: reservation.id,
        status: 'CONFIRMED',
        merchant_id: restaurantId,
        service_id: 'dining',
        start_time: slot.start_time,
        duration_seconds: slot.duration_seconds || 5400,
        party_size: partySize,
        user_information: {
          given_name: user_information.given_name,
          family_name: user_information.family_name,
          telephone: user_information.telephone,
          email: user_information.email,
        },
      },
    });

  } catch (error) {
    logger.error('[GoogleBooking] CreateBooking exception:', error.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ─── UpdateBooking ───────────────────────────────────────────────────────────

async function handleUpdateBooking(req, res) {
  const { booking } = req.body;

  if (!booking?.booking_id) {
    return res.status(400).json({ error: 'booking.booking_id required' });
  }

  try {
    const updates = {};

    if (booking.status === 'CANCELED' || booking.status === 'CANCELLED') {
      updates.status = 'cancelled';
    } else if (booking.status === 'CONFIRMED') {
      updates.status = 'confirmed';
    }

    if (booking.start_time) {
      const startTime = new Date(booking.start_time);
      updates.date = startTime.toISOString().split('T')[0];
      updates.time = startTime.toISOString().split('T')[1].substring(0, 5);
    }

    if (booking.party_size) {
      updates.party_size = booking.party_size;
    }

    updates.updated_at = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('reservations')
      .update(updates)
      .eq('id', booking.booking_id);

    if (updateError) {
      logger.error('[GoogleBooking] UpdateBooking error:', updateError.message);
      return res.status(500).json({ error: 'Update failed' });
    }

    logger.info(`[GoogleBooking] Updated booking ${booking.booking_id}: ${JSON.stringify(updates)}`);

    return res.status(200).json({
      booking: {
        booking_id: booking.booking_id,
        status: updates.status?.toUpperCase() || booking.status,
      },
    });

  } catch (error) {
    logger.error('[GoogleBooking] UpdateBooking exception:', error.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateAvailableSlots(startDate, endDate, businessHours, existingReservations, totalCapacity, partySize, diningDuration) {
  const slots = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Get hours for this day
    const hours = getHoursForDay(businessHours, dayName);
    if (hours) {
      const timeSlots = generateTimeSlotsForDay(hours, 30); // 30-min intervals

      for (const time of timeSlots) {
        // Count overlapping reservations at this time
        const overlapping = existingReservations.filter(r => {
          if (r.date !== dateStr) return false;
          const existingMinutes = timeToMinutes(r.time);
          const slotMinutes = timeToMinutes(time);
          return Math.abs(existingMinutes - slotMinutes) < diningDuration;
        });

        const occupiedSeats = overlapping.reduce((sum, r) => sum + r.party_size, 0);
        const availableSeats = totalCapacity - occupiedSeats;

        if (availableSeats >= parseInt(partySize)) {
          slots.push({
            start: `${dateStr}T${time}:00`,
            spotsAvailable: Math.floor(availableSeats / parseInt(partySize)),
          });
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

function getHoursForDay(businessHours, dayName) {
  if (!businessHours || typeof businessHours !== 'object') return null;

  // Try exact match first, then capitalized
  const hours = businessHours[dayName]
    || businessHours[dayName.charAt(0).toUpperCase() + dayName.slice(1)]
    || businessHours[dayName.substring(0, 3)];

  if (!hours || hours === 'closed' || hours === 'Closed') return null;
  return hours;
}

function generateTimeSlotsForDay(hours, intervalMinutes) {
  const slots = [];

  // Parse hours like "11:00-22:00" or { open: "11:00", close: "22:00" }
  let openTime, closeTime;
  if (typeof hours === 'string') {
    const [open, close] = hours.split('-').map(s => s.trim());
    openTime = open;
    closeTime = close;
  } else if (typeof hours === 'object') {
    openTime = hours.open || hours.start || '11:00';
    closeTime = hours.close || hours.end || '22:00';
  } else {
    return slots;
  }

  let currentMinutes = timeToMinutes(openTime);
  const endMinutes = timeToMinutes(closeTime) - 60; // Stop 1h before close

  while (currentMinutes <= endMinutes) {
    const h = Math.floor(currentMinutes / 60);
    const m = currentMinutes % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    currentMinutes += intervalMinutes;
  }

  return slots;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}
