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

const LOOKUP_MAX_DAYS = 31;
const LOOKUP_STEP_MINUTES = 30;

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isCalendarDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

/**
 * Offers only the slots the booking would accept now. Every candidate start
 * (each 30 minutes of each restaurant-local day in the range) is checked by
 * public.check_guest_slots, which applies guest_slot_status: the same hours,
 * notice, day and party limits and seats from every channel (confirmed,
 * pending and seated) that book_guest_reservation applies. Until 15/11/2026
 * this endpoint had its own rule: weekday and "today" in UTC, split service
 * periods ignored, a last seating 60 minutes before close, seated parties not
 * counted, no day or party limit; the booking refused 246 of 336 offered slots
 * for one test restaurant (scripts/auditoria-reservas/r8-google-disponibilidade.cjs).
 */
async function handleBatchAvailabilityLookup(req, res) {
  const { slot_time_range, merchant_id, party_size } = req.body || {};
  const partySize = typeof party_size === 'string' && /^\d{1,3}$/.test(party_size) ? Number(party_size) : party_size;

  if (!merchant_id || !Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
    return res.status(400).json({ error: 'merchant_id and party_size (1-100) required' });
  }

  try {
    // merchant_id maps to restaurant_id in our system
    const restaurantId = merchant_id;
    const { data: config } = typeof restaurantId === 'string' && UUID.test(restaurantId)
      ? await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, timezone, average_dining_duration_minutes, reservation_settings')
        .eq('id', restaurantId)
        .eq('is_active', true)
        .maybeSingle()
      : { data: null };

    if (!config || !config.timezone) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Dates are the restaurant's local calendar days, from its own "today"
    // (not the server's UTC date), cut to the restaurant's booking window.
    const { utcToLocalDate } = require('../_lib/timezone');
    const { restaurantBookingLimits } = require('../_lib/reservation-validator');
    const today = utcToLocalDate(new Date(), config.timezone);
    const limits = restaurantBookingLimits(config);
    const requestedStart = isCalendarDate(slot_time_range?.start_date) ? slot_time_range.start_date : today;
    const startDate = requestedStart < today ? today : requestedStart;
    let endDate = isCalendarDate(slot_time_range?.end_date) ? slot_time_range.end_date : addDays(startDate, 7);
    if (endDate > addDays(startDate, LOOKUP_MAX_DAYS - 1)) endDate = addDays(startDate, LOOKUP_MAX_DAYS - 1);
    if (limits.advanceBookingDays !== null && endDate > addDays(today, limits.advanceBookingDays)) {
      endDate = addDays(today, limits.advanceBookingDays);
    }

    const starts = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      for (let minutes = 0; minutes < 24 * 60; minutes += LOOKUP_STEP_MINUTES) {
        starts.push(`${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
      }
    }

    const durationMinutes = Math.max(30, Math.min(Number(config.average_dining_duration_minutes) || 90, 360));
    if (!starts.length) return res.status(200).json({ slots: [] });

    const { data, error } = await supabaseAdmin.rpc('check_guest_slots', {
      p_restaurant_id: restaurantId,
      p_party_size: partySize,
      p_starts: starts,
    });
    if (error || !data || typeof data.status !== 'string') {
      logger.error('[GoogleBooking] AvailabilityLookup check failed:', error?.message);
      return res.status(500).json({ error: 'Internal error' });
    }
    if (data.status === 'restaurant_unavailable') {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    if (data.status !== 'ok' || !Array.isArray(data.slots)) {
      return res.status(500).json({ error: 'Internal error' });
    }

    return res.status(200).json({
      slots: data.slots
        .filter(slot => slot.status === 'ok')
        .map(slot => ({
          merchant_id: restaurantId,
          service_id: 'dining',
          // Restaurant wall time without an offset: CreateBooking reads it back as local.
          start_time: `${slot.date}T${slot.time}:00`,
          duration_seconds: durationMinutes * 60,
          available_spots: Math.floor(Number(slot.seats_available) / partySize),
          resources: { party_size: partySize },
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
const SLOT_REFUSALS = new Set(['unavailable', 'table_taken', 'outside_hours', 'too_late', 'past_slot', 'too_soon', 'too_far', 'party_too_large']);

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

module.exports.localSlot = localSlot;
module.exports.googleBookingKey = googleBookingKey;
