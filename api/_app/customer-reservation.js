/**
 * Customer Reservation Portal API
 *
 * Public endpoint — no JWT required.
 * Customers look up, modify, or cancel their own reservations
 * by providing their complete reservation ID and matching phone number.
 *
 * Security: reservation_id is hard to guess (includes random chars).
 * All reservation details and actions require BOTH reservation_id AND customer_phone to match.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('CustomerReservation');

// Fields safe to return to the customer. restaurant_id is included so we can
// follow-up with a restaurant_config lookup to enrich the response with the
// restaurant_name — the customer portal header (CustomerPortal.tsx) needs it
// for white-label branding. We do NOT echo restaurant_id back to the client.
const CUSTOMER_FIELDS =
  'reservation_id, customer_name, customer_email, customer_phone, date, time, party_size, special_requests, status, restaurant_id';

// M-02: Per-reservation-ID rate limit for phone verification attempts.
// After 5 failed phone matches for the same reservation_id, block for 15 minutes.
const phoneVerifyAttempts = new Map();
const PHONE_VERIFY_MAX_ATTEMPTS = 5;
const PHONE_VERIFY_BLOCK_MS = 15 * 60 * 1000; // 15 minutes

function checkPhoneVerifyRateLimit(reservationId) {
  const entry = phoneVerifyAttempts.get(reservationId);
  if (!entry) return false; // not blocked
  if (Date.now() > entry.blockedUntil) {
    phoneVerifyAttempts.delete(reservationId);
    return false;
  }
  return entry.failures >= PHONE_VERIFY_MAX_ATTEMPTS;
}

function recordPhoneVerifyFailure(reservationId) {
  const entry = phoneVerifyAttempts.get(reservationId) || { failures: 0, blockedUntil: 0, createdAt: Date.now() };
  entry.failures += 1;
  if (entry.failures >= PHONE_VERIFY_MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + PHONE_VERIFY_BLOCK_MS;
  }
  phoneVerifyAttempts.set(reservationId, entry);
}

function clearPhoneVerifyFailures(reservationId) {
  phoneVerifyAttempts.delete(reservationId);
}

// Clean up expired entries every 10 minutes
// Removes blocked entries whose block has expired AND stale entries older than 30 minutes
const PHONE_VERIFY_STALE_MS = 30 * 60 * 1000; // 30 minutes
const phoneVerifyCleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of phoneVerifyAttempts) {
    const isBlockExpired = entry.failures >= PHONE_VERIFY_MAX_ATTEMPTS && now > entry.blockedUntil;
    const isStale = entry.createdAt && (now - entry.createdAt > PHONE_VERIFY_STALE_MS);
    if (isBlockExpired || isStale) {
      phoneVerifyAttempts.delete(id);
    }
  }
}, 10 * 60 * 1000);
// .unref() so Jest workers (and any short-lived require) can exit cleanly.
if (typeof phoneVerifyCleanup.unref === 'function') phoneVerifyCleanup.unref();

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;

  // Rate limit: 30 req/hour per IP (generous for lookup, protects against enumeration)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'customer_portal');
  if (rateLimited) return;

  const { action } = req.query;

  try {
    switch (action) {
      case 'lookup': return await handleLookup(req, res);
      case 'modify': return await handleModify(req, res);
      case 'cancel': return await handleCancel(req, res);
      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    logger.error('Customer reservation error', error);
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
};

/**
 * Look up a reservation only with its complete opaque code and matching phone.
 */
async function handleLookup(req, res) {
  const { reservation_id, customer_phone, restaurant_id } = req.query;
  res.setHeader('Cache-Control', 'private, no-store');

  if (typeof reservation_id !== 'string' || !reservation_id.trim() || reservation_id.length > 128 ||
      typeof customer_phone !== 'string' || !customer_phone.trim() || customer_phone.length > 64) {
    return res.status(400).json({
      success: false,
      error: 'Reservation ID and phone number are required',
    });
  }

  // Trim paste whitespace only. Code case, underscores and hyphens are opaque.
  const code = reservation_id.trim();
  const phone = customer_phone.trim();
  let query = supabaseAdmin.from('reservations').select(CUSTOMER_FIELDS)
    .eq('reservation_id', code)
    .eq('customer_phone', phone);
  if (restaurant_id) query = query.eq('restaurant_id', restaurant_id);

  const { data, error } = await query.limit(1).single();

  if (error || !data || data.reservation_id !== code || data.customer_phone !== phone) {
    logger.info('Reservation lookup — supplied credentials did not match');
    return res.status(404).json({ success: false, error: 'Reservation not found' });
  }

  // Enrich with the restaurant_name for the white-label customer portal header.
  // Strip the FK out of the response before returning — clients don't need it
  // and exposing it would weaken the existing tenancy boundary on phone lookups.
  let restaurant_name = null;
  if (data.restaurant_id) {
    try {
      const { data: restaurant } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('restaurant_name')
        .eq('id', data.restaurant_id)
        .single();
      if (restaurant?.restaurant_name) restaurant_name = restaurant.restaurant_name;
    } catch (lookupErr) {
      // Non-fatal — fall through with restaurant_name = null. Header will render
      // the generic seatable logo. Worth logging for telemetry.
      logger.warn('Restaurant name lookup failed', { restaurant_id: data.restaurant_id, error: lookupErr?.message });
    }
  }
  const { restaurant_id: _stripped, ...reservation } = data;
  return res.status(200).json({ success: true, reservation: { ...reservation, restaurant_name } });
}

// Guest changes go through the shared guarded transition (mutate_guest_reservation
// via _lib/reservation-mutations): ownership by full code + phone digits, business
// hours, capacity, the existing table assignment and the reservation status are
// checked there, in one transaction under the restaurant lock. This endpoint used
// to write the row directly and skipped all of that (audit 2026-11-11, F1).
const GENERIC_NOT_FOUND = 'Reservation not found or phone number does not match';
const REFUSAL_STATUS = {
  invalid_input: 400, invalid_date: 400, invalid_time: 400, invalid_party_size: 400, invalid_status: 400,
  past_slot: 409, outside_hours: 409, too_late: 409, too_far: 409, party_too_large: 409, unavailable: 409,
  restaurant_unavailable: 409, timezone_unavailable: 503, mutation_unavailable: 503,
};
const CHANGEABLE = ['confirmed', 'pending', 'Confirmed', 'Pending'];
const MAX_SPECIAL_REQUESTS = 1000;

// Validate the proof fields, then find the tenant that owns this code. The code
// is unique across restaurants (reservations_reservation_id_key); the phone is
// checked by the transition itself, never here.
async function resolveGuestRequest(req, res) {
  const { reservation_id, customer_phone } = req.body || {};
  if (typeof reservation_id !== 'string' || !reservation_id.trim() ||
      typeof customer_phone !== 'string' || !customer_phone.trim()) {
    res.status(400).json({ success: false, error: 'reservation_id and customer_phone are required' });
    return null;
  }
  const code = reservation_id.trim();
  const phone = customer_phone.trim();
  if (phone.replace(/\D/g, '').length < 10) {
    res.status(400).json({ success: false, error: 'Invalid phone number. Must contain at least 10 digits.' });
    return null;
  }
  // M-02: Check per-reservation rate limit before DB query
  if (checkPhoneVerifyRateLimit(code)) {
    logger.info('Phone verify rate limited', { reservation_id: code });
    res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('restaurant_id')
    .eq('reservation_id', code)
    .maybeSingle();
  if (error) {
    logger.error('Reservation tenant lookup failed', error);
    res.status(503).json({ success: false, error: 'Could not verify that reservation. Please try again.' });
    return null;
  }
  if (!data?.restaurant_id) {
    // Record a failure even when reservation doesn't exist to avoid timing leaks
    recordPhoneVerifyFailure(code);
    res.status(404).json({ success: false, error: GENERIC_NOT_FOUND });
    return null;
  }
  return { code, phone, restaurantId: data.restaurant_id };
}

function refuse(res, code, error) {
  if (error?.code === 'verification_failed') {
    // M-02: same response for "not found" and "phone mismatch".
    recordPhoneVerifyFailure(code);
    return res.status(404).json({ success: false, error: GENERIC_NOT_FOUND });
  }
  const status = REFUSAL_STATUS[error?.code] || 503;
  return res.status(status).json({ success: false, error: error?.message || 'Could not complete the reservation request.', code: error?.code });
}

/**
 * Modify a reservation.
 * Requires reservation_id + customer_phone to match — prevents unauthorized edits.
 */
async function handleModify(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { date, time, party_size, special_requests } = req.body || {};
  const given = value => value !== undefined && value !== null && value !== '';
  const slot = {};
  if (given(date)) slot.newDate = String(date);
  if (given(time)) {
    const t = String(time);
    slot.newTime = /^\d{2}:\d{2}:00$/.test(t) ? t.slice(0, 5) : t;
  }
  if (given(party_size)) {
    const size = Number(party_size);
    // Retain this channel's existing party limit; the transition allows 100.
    if (!Number.isSafeInteger(size) || size < 1 || size > 50) {
      return res.status(400).json({ success: false, error: 'Invalid party_size (must be 1–50)' });
    }
    slot.newPartySize = size;
  }
  let notes;
  if (special_requests !== undefined && special_requests !== null) {
    if (typeof special_requests !== 'string' || special_requests.length > MAX_SPECIAL_REQUESTS) {
      return res.status(400).json({ success: false, error: `Special requests must be text of at most ${MAX_SPECIAL_REQUESTS} characters.` });
    }
    notes = special_requests;
  }
  if (!Object.keys(slot).length && notes === undefined) {
    return res.status(400).json({ success: false, error: 'No changes provided' });
  }

  const guest = await resolveGuestRequest(req, res);
  if (!guest) return undefined;
  const service = require('./_lib/reservation-mutations');
  const proof = { restaurantId: guest.restaurantId, reservationId: guest.code, customerPhone: guest.phone };
  const result = Object.keys(slot).length
    ? await service.modifyGuestReservation({ ...proof, ...slot })
    : await service.verifyGuestReservation(proof);
  if (!result.success) return refuse(res, guest.code, result.error);
  clearPhoneVerifyFailures(guest.code);
  const reservation = result.reservation;
  // A slot change was already refused by the transition for any other status;
  // a notes-only request was only verified, so check the status here.
  if (!Object.keys(slot).length && !['confirmed', 'pending'].includes(String(reservation.status).toLowerCase())) {
    return refuse(res, guest.code, { code: 'invalid_status', message: 'This reservation can no longer be changed through this channel.' });
  }

  let notesChanged = false;
  if (notes !== undefined && notes !== (reservation.special_requests ?? '')) {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({ special_requests: notes })
      .eq('id', reservation.id)
      .eq('restaurant_id', guest.restaurantId)
      .in('status', CHANGEABLE)
      .select('id');
    if (error || !data || data.length === 0) {
      logger.warn('Special requests update failed after a verified change', { reservation_id: guest.code });
      return res.status(409).json({ success: false, changed: result.changed,
        error: result.changed
          ? 'The date, time and party size were saved, but the special requests were not. Please check the reservation.'
          : 'The special requests could not be saved. Please check the reservation and try again.' });
    }
    notesChanged = true;
  }

  logger.info('Reservation modified by customer', { reservation_id: guest.code, changed: result.changed || notesChanged });
  return res.status(200).json({ success: true, changed: result.changed || notesChanged, message: 'Reservation updated successfully' });
}

/**
 * Cancel a reservation.
 * Requires reservation_id + customer_phone to match.
 */
async function handleCancel(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const guest = await resolveGuestRequest(req, res);
  if (!guest) return undefined;
  const { cancelGuestReservation } = require('./_lib/reservation-mutations');
  const result = await cancelGuestReservation({
    restaurantId: guest.restaurantId, reservationId: guest.code, customerPhone: guest.phone,
  });
  if (!result.success) return refuse(res, guest.code, result.error);
  clearPhoneVerifyFailures(guest.code);
  if (!result.changed) {
    // A repeated cancel (lost response) changes nothing and is not billed twice.
    return res.status(400).json({ success: false, error: 'Reservation is already cancelled' });
  }

  // Track cancellation for metered billing — Stripe reporter nets these
  // against reservation_created so we don't charge for bookings that
  // never happened. Only a cancellation the transition committed counts.
  try {
    const { trackUsage } = require('./_lib/usage-tracking');
    // AGUARDADO: sem await o incremento morria no freeze da lambda e o
    // restaurante era cobrado por uma reserva cancelada.
    await trackUsage(guest.restaurantId, 'reservation_cancelled');
  } catch (e) {
    logger.warn('trackUsage(reservation_cancelled) failed:', e.message);
  }

  logger.info('Reservation cancelled by customer', { reservation_id: guest.code });
  return res.status(200).json({ success: true, message: 'Reservation cancelled successfully' });
}
