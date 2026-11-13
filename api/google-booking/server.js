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
 * Bookings follow the same rules as every other guest channel:
 *   CreateBooking -> public.book_guest_reservation (restaurant lock, hours,
 *                    notice, seats from every channel), like WhatsApp, voice
 *                    and the booking page.
 *   UpdateBooking -> mutate_guest_reservation (api/_lib/reservation-mutations),
 *                    only for bookings Google itself created.
 * Slot times become the restaurant's local wall time before they are stored.
 */

const crypto = require('crypto');
const { supabaseAdmin, bookGuestReservation } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { secureEquals } = require('../_lib/secure-compare');
const { generateSecureReservationId } = require('../_lib/secure-id');
const { modifyGuestReservation, cancelGuestReservation, verifyGuestReservation } = require('../_lib/reservation-mutations');

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

  if (!token || !secureEquals(token, expectedToken)) {
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Refusals that mean "this slot cannot be booked" (book_guest_reservation and
// mutate_guest_reservation use the same codes).
const SLOT_REFUSALS = new Set(['unavailable', 'table_taken', 'outside_hours', 'too_late', 'past_slot', 'too_far', 'party_too_large']);

// The retry key Google gives us, hashed: its charset and length never matter,
// and book_guest_reservation checks the 'google:v1:<sha256>' shape.
function googleBookingKey(idempotencyToken) {
  if (idempotencyToken === undefined || idempotencyToken === null || idempotencyToken === '') return null;
  return `google:v1:${crypto.createHash('sha256').update(String(idempotencyToken)).digest('hex')}`;
}

function googleStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'cancelled') return 'CANCELED';
  if (s === 'confirmed' || s === 'pending' || s === 'seated') return 'CONFIRMED';
  return s.toUpperCase();
}

async function restaurantTimezone(restaurantId) {
  if (typeof restaurantId !== 'string' || !UUID.test(restaurantId)) return null;
  const { data } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, timezone')
    .eq('id', restaurantId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.timezone || null;
}

async function handleCreateBooking(req, res) {
  const { slot, user_information, idempotency_token } = req.body || {};

  if (!slot || !user_information) {
    return res.status(400).json({ error: 'slot and user_information required' });
  }

  try {
    const restaurantId = slot.merchant_id;
    const timezone = await restaurantTimezone(restaurantId);
    if (!timezone) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const start = localSlot(slot, timezone);
    if (!start) {
      return res.status(400).json({ error: 'slot.start_sec or slot.start_time required' });
    }
    const partySize = slot.resources?.party_size ?? 2;
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
      return res.status(400).json({ error: 'slot.resources.party_size must be 1-100' });
    }

    const guestName = [
      user_information.given_name,
      user_information.family_name,
    ].filter(Boolean).join(' ') || 'Google Guest';
    const externalId = googleBookingKey(idempotency_token);

    // Locked admission: hours, notice, party size and seats from every channel,
    // checked in the same transaction as the insert. A retry of the same
    // idempotency_token returns the booking it made.
    const booked = await bookGuestReservation(restaurantId, {
      reservation_id: generateSecureReservationId(),
      source: 'google',
      date: start.date,
      time: start.time,
      party_size: partySize,
      customer_name: guestName,
      customer_phone: user_information.telephone || null,
      customer_email: user_information.email || null,
    }, externalId ? { externalId } : {});

    const bookingBody = (bookingId, status) => ({
      booking: {
        booking_id: bookingId,
        status,
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

    if (booked.status === 'created' || booked.status === 'existing') {
      logger.info(`[GoogleBooking] ${booked.status} booking ${booked.data.id}, party of ${partySize}`);
      return res.status(200).json(bookingBody(booked.data.id, 'CONFIRMED'));
    }
    if (booked.status === 'cancelled_intent') {
      return res.status(200).json(bookingBody(booked.data.id, 'CANCELED'));
    }
    if (SLOT_REFUSALS.has(booked.status)) {
      return res.status(200).json({
        booking_failure: { cause: 'SLOT_UNAVAILABLE', description: `Slot not bookable (${booked.status})` },
      });
    }
    if (booked.status === 'restaurant_unavailable') {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    if (booked.status === 'invalid_input') {
      return res.status(400).json({ error: 'Invalid booking details: a guest name and telephone are required' });
    }
    logger.error('[GoogleBooking] CreateBooking failed:', { status: booked.status, error: booked.error?.message });
    return res.status(500).json({ error: 'Internal error' });

  } catch (error) {
    logger.error('[GoogleBooking] CreateBooking exception:', error.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ─── UpdateBooking ───────────────────────────────────────────────────────────

async function handleUpdateBooking(req, res) {
  const { booking } = req.body || {};

  if (!booking?.booking_id) {
    return res.status(400).json({ error: 'booking.booking_id required' });
  }

  try {
    // Only a booking Google created can be changed from Google; a WhatsApp,
    // voice or host booking id is "not found" here.
    const { data: existing } = UUID.test(String(booking.booking_id))
      ? await supabaseAdmin
        .from('reservations')
        .select('id, restaurant_id, reservation_id, customer_phone')
        .eq('id', booking.booking_id)
        .eq('source', 'google')
        .maybeSingle()
      : { data: null };
    if (!existing || (booking.merchant_id && booking.merchant_id !== existing.restaurant_id)) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // The shared guest-change rule: restaurant lock, hours, notice, seats and
    // the booking's tables, the same one WhatsApp, voice and the portal use.
    const target = {
      restaurantId: existing.restaurant_id,
      reservationId: existing.reservation_id,
      customerPhone: existing.customer_phone,
    };
    let result;
    if (booking.status === 'CANCELED' || booking.status === 'CANCELLED') {
      result = await cancelGuestReservation(target);
    } else {
      const changes = {};
      if (booking.start_sec !== undefined || booking.start_time !== undefined) {
        const timezone = await restaurantTimezone(existing.restaurant_id);
        const start = timezone && localSlot(booking, timezone);
        if (!start) {
          return res.status(400).json({ error: 'booking.start_sec or booking.start_time is invalid' });
        }
        changes.newDate = start.date;
        changes.newTime = start.time;
      }
      if (booking.party_size !== undefined) changes.newPartySize = booking.party_size;
      result = Object.keys(changes).length
        ? await modifyGuestReservation({ ...target, ...changes })
        : await verifyGuestReservation(target);
    }

    if (!result.success) {
      const code = result.error?.code;
      if (SLOT_REFUSALS.has(code)) {
        return res.status(200).json({
          booking_failure: { cause: 'SLOT_UNAVAILABLE', description: `Slot not bookable (${code})` },
        });
      }
      if (code === 'invalid_status') {
        return res.status(200).json({
          booking_failure: { cause: 'CAUSE_UNSPECIFIED', description: 'This booking can no longer be changed' },
        });
      }
      if (['invalid_date', 'invalid_time', 'invalid_party_size', 'invalid_input'].includes(code)) {
        return res.status(400).json({ error: result.error.message });
      }
      if (code === 'verification_failed') {
        return res.status(404).json({ error: 'Booking not found' });
      }
      logger.error('[GoogleBooking] UpdateBooking failed:', { code });
      return res.status(500).json({ error: 'Update failed' });
    }

    logger.info(`[GoogleBooking] Updated booking ${existing.id} (changed: ${result.changed})`);
    return res.status(200).json({
      booking: {
        booking_id: existing.id,
        status: googleStatus(result.reservation.status),
        party_size: result.reservation.party_size,
      },
    });

  } catch (error) {
    logger.error('[GoogleBooking] UpdateBooking exception:', error.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The restaurant's local date and time for a Google slot. Google sends an
 * instant (start_sec, which proto3 JSON may send as a string, or start_time
 * with an offset); our availability answer publishes a wall time without an
 * offset, which is already local. Reservations store local wall times: reading
 * the instant in UTC stored 19:00 in São Paulo as 22:00.
 * @returns {{ date: string, time: string } | null}
 */
function localSlot({ start_sec: startSec, start_time: startTime } = {}, timezone) {
  let instant = null;
  const seconds = typeof startSec === 'string' && /^\d{1,12}$/.test(startSec) ? Number(startSec) : startSec;
  if (Number.isSafeInteger(seconds) && seconds > 0) {
    instant = new Date(seconds * 1000);
  } else if (typeof startTime === 'string') {
    const wall = /^(\d{4}-\d{2}-\d{2})T(([01]\d|2[0-3]):[0-5]\d)(:[0-5]\d(\.\d+)?)?$/.exec(startTime);
    if (wall) {
      const day = new Date(`${wall[1]}T00:00:00Z`);
      return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === wall[1]
        ? { date: wall[1], time: wall[2] } : null;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(startTime)) {
      instant = new Date(startTime);
    }
  }
  if (!instant || !Number.isFinite(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

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

module.exports.localSlot = localSlot;
module.exports.googleBookingKey = googleBookingKey;
