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

module.exports = async (req, res) => {
  // CORS for public portal
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit: 30 requests per minute for public endpoints
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const action = req.query.action || (req.body && req.body.action);

  try {
    switch (action) {
      case 'restaurant':
        return await handleGetRestaurant(req, res);
      case 'availability':
        return await handleGetAvailability(req, res);
      case 'reserve':
        return await handleCreateReservation(req, res);
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Use: restaurant, availability, reserve'
        });
    }
  } catch (error) {
    console.error('[Portal] Unhandled error:', error);
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
    .select('id, restaurant_name, restaurant_type, city, country, phone, email, website, business_hours, reservation_settings, average_dining_duration_minutes, slug')
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
      average_dining_duration: data.average_dining_duration_minutes || 90
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
    .select('id, restaurant_name, business_hours, reservation_settings, average_dining_duration_minutes')
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
  const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'lowercase' });
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = new Date(date + 'T12:00:00').getDay();
  const dayKey = dayNames[dayIndex];

  const businessHours = restaurant.business_hours || {};
  const dayHours = businessHours[dayKey];

  // Check if restaurant is open that day
  if (!dayHours || dayHours.closed) {
    return res.status(200).json({
      success: true,
      available: false,
      message: 'Restaurant is closed on this day.',
      slots: []
    });
  }

  const openTime = dayHours.open || '12:00';
  const closeTime = dayHours.close || '22:00';

  // Get existing reservations for this date
  const { data: reservations, error: resError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending', 'Confirmed', 'Pending', 'Seated']);

  if (resError) {
    console.error('[Portal] Error fetching reservations:', resError);
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

  const totalCapacity = tables
    ? tables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    : 60; // fallback

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
    special_requests
  } = req.body || {};

  // Validate required fields
  if (!restaurant_id || !customer_name || !customer_phone || !party_size || !date || !time) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: restaurant_id, customer_name, customer_phone, party_size, date, time'
    });
  }

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
    .select('id, restaurant_name, reservation_settings, business_hours, average_dining_duration_minutes')
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

  const totalCapacity = tables
    ? tables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    : 60;

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
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      customer_email: customer_email ? customer_email.trim() : null,
      party_size: partySize,
      date,
      time,
      special_requests: special_requests || null,
      status: 'confirmed',
      source: 'online_portal'
    })
    .select('id, reservation_id, customer_name, party_size, date, time, status')
    .single();

  if (createError) {
    console.error('[Portal] Error creating reservation:', createError);
    return res.status(500).json({
      success: false,
      message: 'Could not create reservation. Please try again.'
    });
  }

  // Track usage for metered billing
  trackUsage(restaurant_id, 'portal_booking');

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
