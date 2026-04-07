/**
 * Public Portal API
 *
 * Public (no auth) endpoints for customer-facing booking portal.
 * URL pattern: /api/portal?action=...
 *
 * Actions:
 *   GET  ?action=restaurant&slug=X           - Look up restaurant by slug
 *   GET  ?action=availability&restaurant_id=X&date=Y&party_size=Z - Available time slots
 *   POST ?action=reserve                     - Create a reservation
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { checkTimeSlotAvailability, getSuggestedTimes, getDiningDuration } = require('./_lib/availability-calculator');
const { generateSecureReservationId } = require('./_lib/secure-id');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { trackUsage } = require('./_lib/usage-tracking');
const { sendReservationConfirmationEmail, sendNewBookingAlertEmail } = require('./_lib/email');
const { sendNewBookingAlertWhatsApp, sendReservationConfirmation, isWhatsAppConfigured } = require('./_lib/whatsapp-sender');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { sanitizeStringXSS } = require('./_lib/validation');
const { validateReservation: validateReservationRules } = require('./_lib/reservation-validator');
const logger = createSecureLogger('Portal');

module.exports = async (req, res) => {
  // CORS for public portal
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit: 30 requests per minute for public endpoints
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  // Body size validation: reject payloads > 1MB to prevent abuse
  if (req.body) {
    const bodySize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    if (bodySize > 1_048_576) {
      logger.warn('[Portal] Rejected oversized body:', { size: bodySize });
      return res.status(413).json({
        success: false,
        error: 'Request body too large. Maximum size is 1MB.'
      });
    }
  }

  const action = req.query.action || (req.body && req.body.action);

  try {
    switch (action) {
      case 'restaurant':
        return await handleGetRestaurant(req, res);
      case 'availability':
        return await handleGetAvailability(req, res);
      case 'reserve':
        return await handleCreateReservation(req, res);
      case 'reservation':
        return await handleGetReservation(req, res);
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Use: restaurant, availability, reserve, reservation'
        });
    }
  } catch (error) {
    logger.error('[Portal] Unhandled error:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};

// ============================================================
// GET ?action=restaurant&slug=X
// Look up restaurant public info by slug
// ============================================================
async function handleGetRestaurant(req, res) {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({
      success: false,
      message: 'Missing required parameter: slug'
    });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, restaurant_type, city, country, phone, email, website, business_hours, reservation_settings, average_dining_duration_minutes, slug, deposit_config')
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .single();

  if (error || !data) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  // Return only public-safe fields
  const businessHours = data.business_hours || {};
  const reservationSettings = data.reservation_settings || {};

  return res.status(200).json({
    success: true,
    data: {
      id: data.id,
      name: data.restaurant_name,
      type: data.restaurant_type,
      city: data.city,
      country: data.country,
      phone: data.phone,
      email: data.email,
      website: data.website,
      slug: data.slug,
      business_hours: businessHours,
      max_party_size: reservationSettings.max_party_size || 12,
      min_party_size: reservationSettings.min_party_size || 1,
      advance_booking_days: reservationSettings.advance_booking_days || 30,
      average_dining_duration: data.average_dining_duration_minutes || 90,
      cancellation_policy: reservationSettings.cancellation_policy || null,
      deposit_config: data.deposit_config || { enabled: false }
    }
  });
}

// ============================================================
// GET ?action=reservation&id=RES-XXXX
// Look up a single reservation by confirmation ID (public, no auth)
// Only returns non-sensitive fields for the confirmation page
// ============================================================
async function handleGetReservation(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing required parameter: id' });
  }

  // Basic sanity check on format to avoid full-table scans on junk input
  if (typeof id !== 'string' || id.length > 60) {
    return res.status(400).json({ success: false, error: 'Invalid reservation ID' });
  }

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('id, reservation_id, restaurant_id, customer_name, party_size, date, time, status')
    .eq('reservation_id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ success: false, error: 'Reservation not found' });
  }

  // Fetch restaurant name for display
  const { data: rest } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name')
    .eq('id', data.restaurant_id)
    .single();

  return res.status(200).json({
    success: true,
    reservation: {
      id: data.reservation_id,
      name: data.customer_name,
      party_size: data.party_size,
      date: data.date,
      time: data.time,
      status: data.status,
      restaurant_name: rest ? rest.restaurant_name : 'Restaurant'
    }
  });
}

// ============================================================
// GET ?action=availability&restaurant_id=X&date=Y&party_size=Z
// Get available time slots for a given date
// ============================================================
async function handleGetAvailability(req, res) {
  const { restaurant_id, date, party_size } = req.query;

  if (!restaurant_id || !date || !party_size) {
    return res.status(400).json({
      success: false,
      message: 'Missing required parameters: restaurant_id, date, party_size'
    });
  }

  const partySize = parseInt(party_size, 10);
  if (isNaN(partySize) || partySize < 1 || partySize > 20) {
    return res.status(400).json({
      success: false,
      message: 'Invalid party_size. Must be between 1 and 20.'
    });
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date format. Use YYYY-MM-DD.'
    });
  }

  // Get restaurant info
  const { data: restaurant, error: restError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, business_hours, reservation_settings, average_dining_duration_minutes, table_configuration')
    .eq('id', restaurant_id)
    .eq('is_active', true)
    .single();

  if (restError || !restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  // Determine day of week for business hours
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = new Date(date + 'T12:00:00').getDay();
  const dayKey = dayNames[dayIndex];

  const businessHours = restaurant.business_hours || {};
  const dayHours = businessHours[dayKey];

  // Check if restaurant is open that day
  // Business hours use { is_open, open_time, close_time } format
  if (!dayHours || dayHours.is_open === false || dayHours.closed) {
    return res.status(200).json({
      success: true,
      available: false,
      message: 'Restaurant is closed on this day.',
      slots: []
    });
  }

  const openTime = dayHours.open_time || dayHours.open || '12:00';
  const closeTime = dayHours.close_time || dayHours.close || '22:00';

  // Get existing reservations for this date
  const { data: reservations, error: resError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending', 'Confirmed', 'Pending', 'Seated']);

  if (resError) {
    logger.error('[Portal] Error fetching reservations:', resError);
    return res.status(500).json({
      success: false,
      message: 'Could not check availability.'
    });
  }

  // Get restaurant capacity from tables
  const { data: tables, error: tablesError } = await supabaseAdmin
    .from('tables')
    .select('capacity')
    .eq('restaurant_id', restaurant_id)
    .eq('is_active', true);

  let totalCapacity = (tables && tables.length > 0)
    ? tables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    : 0;

  // Fallback: derive capacity from table_configuration in restaurant_config
  if (totalCapacity === 0 && restaurant.table_configuration) {
    const config = Array.isArray(restaurant.table_configuration)
      ? restaurant.table_configuration
      : [];
    totalCapacity = config.reduce((sum, area) => {
      const areaTables = Array.isArray(area.tables) ? area.tables : [];
      return sum + areaTables.reduce((s, t) => s + (t.capacity || 0), 0);
    }, 0);
  }

  // Final fallback
  if (totalCapacity === 0) totalCapacity = 60;

  // Convert reservations to the format expected by availability calculator
  const formattedReservations = (reservations || []).map(r => ({
    fields: {
      'Time': r.time,
      'Party Size': r.party_size,
      'Status': r.status
    }
  }));

  // Generate time slots at 30-minute intervals during operating hours
  const slots = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const diningDuration = getDiningDuration(partySize);

  // Last seating: close time minus dining duration
  const lastSeatingMinutes = closeMinutes - diningDuration;

  for (let m = openMinutes; m <= lastSeatingMinutes; m += 30) {
    const hours = String(Math.floor(m / 60)).padStart(2, '0');
    const mins = String(m % 60).padStart(2, '0');
    const timeStr = `${hours}:${mins}`;

    const check = checkTimeSlotAvailability(
      timeStr,
      partySize,
      formattedReservations,
      totalCapacity
    );

    slots.push({
      time: timeStr,
      available: check.available,
      available_seats: check.availableSeats
    });
  }

  return res.status(200).json({
    success: true,
    restaurant_name: restaurant.restaurant_name,
    date,
    party_size: partySize,
    operating_hours: { open: openTime, close: closeTime },
    slots
  });
}

// ============================================================
// POST ?action=reserve
// Create a public reservation
// ============================================================
async function handleCreateReservation(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'POST method required for reservations'
    });
  }

  const {
    restaurant_id,
    customer_name,
    customer_phone,
    customer_email,
    party_size,
    date,
    time,
    special_requests,
    deposit_payment_intent_id,
    deposit_amount
  } = req.body || {};

  // Validate required fields
  if (!restaurant_id || !customer_name || !customer_phone || !party_size || !date || !time) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: restaurant_id, customer_name, customer_phone, party_size, date, time'
    });
  }

  // Validate phone number: at least 10 digits after stripping non-numeric chars
  const phoneDigits = String(customer_phone).replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Invalid phone number. Must contain at least 10 digits.'
    });
  }

  // Sanitize customer name (XSS prevention + max length)
  const sanitizedName = sanitizeStringXSS(customer_name, { maxLength: 200 });

  const partySize = parseInt(party_size, 10);
  if (isNaN(partySize) || partySize < 1 || partySize > 20) {
    return res.status(400).json({
      success: false,
      message: 'Invalid party_size. Must be between 1 and 20.'
    });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date format. Use YYYY-MM-DD.'
    });
  }

  // Validate time format
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid time format. Use HH:MM.'
    });
  }

  // Don't allow past dates
  const today = new Date().toISOString().split('T')[0];
  if (date < today) {
    return res.status(400).json({
      success: false,
      message: 'Cannot book for a past date.'
    });
  }

  // Verify restaurant exists and is active
  const { data: restaurant, error: restError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, email, whatsapp_enabled, whatsapp_phone_number, agent_language, reservation_settings, business_hours, timezone, average_dining_duration_minutes, table_configuration')
    .eq('id', restaurant_id)
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .single();

  if (restError || !restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  // Check party size limits
  const settings = restaurant.reservation_settings || {};
  const maxParty = settings.max_party_size || 12;
  if (partySize > maxParty) {
    return res.status(400).json({
      success: false,
      message: `Maximum party size is ${maxParty}. Please call us for larger groups.`
    });
  }

  // Validate against business hours
  const validation = validateReservationRules(
    { date, time, party_size: partySize },
    {
      business_hours: restaurant.business_hours,
      timezone: restaurant.timezone,
      max_party_size: settings.max_party_size,
      max_advance_days: settings.advance_booking_days,
    }
  );

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message
    });
  }

  // Re-check availability before creating
  const { data: existingRes } = await supabaseAdmin
    .from('reservations')
    .select('time, party_size, status')
    .eq('restaurant_id', restaurant_id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending', 'Confirmed', 'Pending', 'Seated']);

  const { data: tables } = await supabaseAdmin
    .from('tables')
    .select('capacity')
    .eq('restaurant_id', restaurant_id)
    .eq('is_active', true);

  let totalCapacity = (tables && tables.length > 0)
    ? tables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    : 0;

  if (totalCapacity === 0 && restaurant.table_configuration) {
    const config = Array.isArray(restaurant.table_configuration) ? restaurant.table_configuration : [];
    totalCapacity = config.reduce((sum, area) => {
      return sum + (Array.isArray(area.tables) ? area.tables : []).reduce((s, t) => s + (t.capacity || 0), 0);
    }, 0);
  }

  if (totalCapacity === 0) totalCapacity = 60;

  const formatted = (existingRes || []).map(r => ({
    fields: { 'Time': r.time, 'Party Size': r.party_size, 'Status': r.status }
  }));

  const availCheck = checkTimeSlotAvailability(time, partySize, formatted, totalCapacity);
  if (!availCheck.available) {
    return res.status(409).json({
      success: false,
      message: `Sorry, ${time} is no longer available for ${partySize} guests. ${availCheck.reason}`,
      available_seats: availCheck.availableSeats
    });
  }

  // Create the reservation
  const reservationId = generateSecureReservationId();

  const { data: newRes, error: createError } = await supabaseAdmin
    .from('reservations')
    .insert({
      restaurant_id,
      reservation_id: reservationId,
      customer_name: sanitizedName,
      customer_phone: customer_phone.trim(),
      customer_email: customer_email ? customer_email.trim() : null,
      party_size: partySize,
      date,
      time,
      special_requests: special_requests || null,
      status: 'confirmed',
      source: 'online_portal',
      deposit_payment_intent_id: deposit_payment_intent_id || null,
      deposit_amount: deposit_amount ? parseFloat(deposit_amount) : null
    })
    .select('id, reservation_id, customer_name, party_size, date, time, status')
    .single();

  if (createError) {
    logger.error('[Portal] Error creating reservation:', createError);
    return res.status(500).json({
      success: false,
      message: 'Could not create reservation. Please try again.'
    });
  }

  // Track usage for metered billing
  trackUsage(restaurant_id, 'portal_booking');

  // Send confirmation email to customer (fire-and-forget)
  if (customer_email) {
    sendReservationConfirmationEmail({
      customerEmail: customer_email.trim(),
      customerName: sanitizedName,
      restaurantName: restaurant.restaurant_name,
      reservationId,
      partySize,
      date,
      time,
      specialRequests: special_requests,
      cancellationPolicy: (restaurant.reservation_settings || {}).cancellation_policy,
      language: restaurant.language || 'en',
    }).catch(err => logger.error('[Portal] Customer email failed:', err.message));
  }

  // Send new booking alert to restaurant owner (fire-and-forget)
  if (restaurant.email) {
    sendNewBookingAlertEmail({
      ownerEmail: restaurant.email,
      restaurantName: restaurant.restaurant_name,
      customerName: sanitizedName,
      customerPhone: customer_phone.trim(),
      customerEmail: customer_email ? customer_email.trim() : null,
      reservationId,
      partySize,
      date,
      time,
      specialRequests: special_requests,
    }).catch(err => logger.error('[Portal] Owner alert email failed:', err.message));
  }

  // Send WhatsApp alert to restaurant owner (fire-and-forget)
  if (restaurant.whatsapp_enabled && restaurant.whatsapp_phone_number && isWhatsAppConfigured()) {
    sendNewBookingAlertWhatsApp(restaurant.whatsapp_phone_number, {
      reservationId,
      customerName: sanitizedName,
      customerPhone: customer_phone.trim(),
      partySize,
      date,
      time,
    }).catch(err => logger.error('[Portal] Owner WhatsApp alert failed:', err.message));
  }

  // Send WhatsApp confirmation to customer (fire-and-forget)
  if (restaurant.whatsapp_enabled && isWhatsAppConfigured() && customer_phone) {
    sendReservationConfirmation(customer_phone.trim(), {
      customerName: sanitizedName,
      restaurantName: restaurant.restaurant_name,
      language: restaurant.agent_language || 'en',
      reservationId,
      date,
      time,
      partySize,
    }).catch(err => logger.warn('[Portal] Customer WhatsApp confirmation failed (non-fatal):', err.message));
  }

  return res.status(201).json({
    success: true,
    message: `Reservation confirmed for ${partySize} guests on ${date} at ${time}`,
    reservation: {
      id: newRes.reservation_id,
      name: newRes.customer_name,
      party_size: newRes.party_size,
      date: newRes.date,
      time: newRes.time,
      status: newRes.status,
      restaurant_name: restaurant.restaurant_name
    }
  });
}

