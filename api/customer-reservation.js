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

// Fields safe to return to the customer
const CUSTOMER_FIELDS =
  'reservation_id, customer_name, customer_email, customer_phone, date, time, party_size, special_requests, status';

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
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    logger.error('Customer reservation error', error);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

/**
 * Look up a reservation by ID or phone number.
 * Returns the most recent non-cancelled reservation when searching by phone.
 */
async function handleLookup(req, res) {
  const { reservation_id, customer_phone } = req.query;

  if (!reservation_id && !customer_phone) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a reservation ID or phone number',
    });
  }

  let query = supabaseAdmin.from('reservations').select(CUSTOMER_FIELDS);

  if (reservation_id) {
    query = query.eq('reservation_id', reservation_id.trim().toUpperCase());
  } else {
    // Phone lookup: return the most recent reservation for this number
    query = query.eq('customer_phone', customer_phone.trim())
      .order('date', { ascending: false })
      .order('time', { ascending: false });
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    logger.info('Reservation lookup — not found', { reservation_id, customer_phone: customer_phone ? '[redacted]' : undefined });
    return res.status(404).json({ success: false, message: 'Reservation not found' });
  }

  return res.status(200).json({ success: true, reservation: data });
}

/**
 * Modify a reservation.
 * Requires reservation_id + customer_phone to match — prevents unauthorized edits.
 */
async function handleModify(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { reservation_id, customer_phone, date, time, party_size, special_requests } = req.body || {};

  if (!reservation_id || !customer_phone) {
    return res.status(400).json({ success: false, message: 'reservation_id and customer_phone are required' });
  }

  // Verify ownership: phone must match the reservation
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, status, customer_phone')
    .eq('reservation_id', reservation_id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, message: 'Reservation not found' });
  }

  if (existing.customer_phone !== customer_phone) {
    return res.status(403).json({ success: false, message: 'Phone number does not match this reservation' });
  }

  if (existing.status === 'Cancelled' || existing.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Cannot modify a cancelled reservation' });
  }

  const updates = {};
  if (date) updates.date = date;
  if (time) updates.time = time;
  if (party_size) updates.party_size = Number(party_size);
  if (special_requests !== undefined) updates.special_requests = special_requests;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No changes provided' });
  }

  const { error } = await supabaseAdmin
    .from('reservations')
    .update(updates)
    .eq('id', existing.id);

  if (error) {
    logger.error('Failed to update reservation', error);
    return res.status(500).json({ success: false, message: 'Failed to update reservation' });
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
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { reservation_id, customer_phone } = req.body || {};

  if (!reservation_id || !customer_phone) {
    return res.status(400).json({ success: false, message: 'reservation_id and customer_phone are required' });
  }

  // Verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, status, customer_phone')
    .eq('reservation_id', reservation_id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, message: 'Reservation not found' });
  }

  if (existing.customer_phone !== customer_phone) {
    return res.status(403).json({ success: false, message: 'Phone number does not match this reservation' });
  }

  if (existing.status === 'Cancelled' || existing.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Reservation is already cancelled' });
  }

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'Cancelled' })
    .eq('id', existing.id);

  if (error) {
    logger.error('Failed to cancel reservation', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel reservation' });
  }

  logger.info('Reservation cancelled by customer', { reservation_id });
  return res.status(200).json({ success: true, message: 'Reservation cancelled successfully' });
}
