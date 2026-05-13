/**
 * Customer Reservation Portal API
 *
 * Public endpoint — no JWT required.
 * Customers look up, modify, or cancel their own reservations
 * by providing their reservation ID and/or phone number.
 *
 * Security: reservation_id is hard to guess (includes random chars).
 * modify + cancel require BOTH reservation_id AND customer_phone to match.
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
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of phoneVerifyAttempts) {
    const isBlockExpired = entry.failures >= PHONE_VERIFY_MAX_ATTEMPTS && now > entry.blockedUntil;
    const isStale = entry.createdAt && (now - entry.createdAt > PHONE_VERIFY_STALE_MS);
    if (isBlockExpired || isStale) {
      phoneVerifyAttempts.delete(id);
    }
  }
}, 10 * 60 * 1000);

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
 * Look up a reservation by ID or phone number.
 * Returns the most recent non-cancelled reservation when searching by phone.
 */
async function handleLookup(req, res) {
  const { reservation_id, customer_phone, restaurant_id } = req.query;

  if (!reservation_id && !customer_phone) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a reservation ID or phone number',
    });
  }

  let query = supabaseAdmin.from('reservations').select(CUSTOMER_FIELDS);

  if (reservation_id) {
    // L-05: reservation_id lookup is not scoped by restaurant_id. This is acceptable
    // because reservation_ids (RES-YYYYMMDD-XXXX) are unguessable and include random
    // characters. Adding restaurant_id scoping here would require the customer to know
    // their restaurant_id, which they typically don't. The format provides sufficient
    // entropy to prevent enumeration attacks.
    if (restaurant_id) {
      query = query.eq('restaurant_id', restaurant_id);
    }
    query = query.eq('reservation_id', reservation_id.trim());
  } else {
    // Phone lookup: scope to restaurant_id if provided, otherwise cross-tenant
    // (customer only gets their own most recent reservation, not others')
    query = query.eq('customer_phone', customer_phone.trim());
    if (restaurant_id) {
      query = query.eq('restaurant_id', restaurant_id);
    }
    query = query.order('date', { ascending: false })
      .order('time', { ascending: false });
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    logger.info('Reservation lookup — not found', { reservation_id, customer_phone: customer_phone ? '[redacted]' : undefined });
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

/**
 * Modify a reservation.
 * Requires reservation_id + customer_phone to match — prevents unauthorized edits.
 */
async function handleModify(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { reservation_id, customer_phone, date, time, party_size, special_requests } = req.body || {};

  if (!reservation_id || !customer_phone) {
    return res.status(400).json({ success: false, error: 'reservation_id and customer_phone are required' });
  }

  // Validate phone number: at least 10 digits after stripping non-numeric chars
  const phoneDigitsModify = String(customer_phone).replace(/\D/g, '');
  if (phoneDigitsModify.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid phone number. Must contain at least 10 digits.' });
  }

  // M-02: Check per-reservation rate limit before DB query
  if (checkPhoneVerifyRateLimit(reservation_id)) {
    logger.info('Phone verify rate limited', { reservation_id });
    return res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
  }

  // Verify ownership: phone must match the reservation
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, status, customer_phone')
    .eq('reservation_id', reservation_id)
    .single();

  // M-02: Return same generic error for both "not found" and "phone mismatch"
  // to prevent reservation ID enumeration via differing error messages.
  const GENERIC_NOT_FOUND = 'Reservation not found or phone number does not match';

  if (fetchError || !existing) {
    // Record a failure even when reservation doesn't exist to avoid timing leaks
    recordPhoneVerifyFailure(reservation_id);
    return res.status(404).json({ success: false, error: GENERIC_NOT_FOUND });
  }

  if (existing.customer_phone !== customer_phone) {
    recordPhoneVerifyFailure(reservation_id);
    return res.status(404).json({ success: false, error: GENERIC_NOT_FOUND });
  }

  // Phone matched — clear any accumulated failures
  clearPhoneVerifyFailures(reservation_id);

  if (existing.status === 'Cancelled' || existing.status === 'cancelled') {
    return res.status(400).json({ success: false, error: 'Cannot modify a cancelled reservation' });
  }

  const updates = {};
  if (date) updates.date = date;
  if (time) updates.time = time;
  if (party_size) updates.party_size = Number(party_size);
  if (special_requests !== undefined) updates.special_requests = special_requests;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No changes provided' });
  }

  const { error } = await supabaseAdmin
    .from('reservations')
    .update(updates)
    .eq('id', existing.id);

  if (error) {
    logger.error('Failed to update reservation', error);
    return res.status(500).json({ success: false, error: 'Failed to update reservation' });
  }

  logger.info('Reservation modified by customer', { reservation_id });
  return res.status(200).json({ success: true, message: 'Reservation updated successfully' });
}

/**
 * Cancel a reservation.
 * Requires reservation_id + customer_phone to match.
 */
async function handleCancel(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { reservation_id, customer_phone } = req.body || {};

  if (!reservation_id || !customer_phone) {
    return res.status(400).json({ success: false, error: 'reservation_id and customer_phone are required' });
  }

  // Validate phone number: at least 10 digits after stripping non-numeric chars
  const phoneDigitsCancel = String(customer_phone).replace(/\D/g, '');
  if (phoneDigitsCancel.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid phone number. Must contain at least 10 digits.' });
  }

  // M-02: Check per-reservation rate limit before DB query
  if (checkPhoneVerifyRateLimit(reservation_id)) {
    logger.info('Phone verify rate limited', { reservation_id });
    return res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
  }

  // Verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, status, customer_phone')
    .eq('reservation_id', reservation_id)
    .single();

  // M-02: Return same generic error for both "not found" and "phone mismatch"
  const GENERIC_NOT_FOUND = 'Reservation not found or phone number does not match';

  if (fetchError || !existing) {
    recordPhoneVerifyFailure(reservation_id);
    return res.status(404).json({ success: false, error: GENERIC_NOT_FOUND });
  }

  if (existing.customer_phone !== customer_phone) {
    recordPhoneVerifyFailure(reservation_id);
    return res.status(404).json({ success: false, error: GENERIC_NOT_FOUND });
  }

  // Phone matched — clear any accumulated failures
  clearPhoneVerifyFailures(reservation_id);

  if (existing.status === 'Cancelled' || existing.status === 'cancelled') {
    return res.status(400).json({ success: false, error: 'Reservation is already cancelled' });
  }

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'Cancelled' })
    .eq('id', existing.id);

  if (error) {
    logger.error('Failed to cancel reservation', error);
    return res.status(500).json({ success: false, error: 'Failed to cancel reservation' });
  }

  logger.info('Reservation cancelled by customer', { reservation_id });
  return res.status(200).json({ success: true, message: 'Reservation cancelled successfully' });
}
