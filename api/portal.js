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
const { Resend } = require('resend');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('Portal');

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
    logger.error('[Portal] Error creating reservation:', createError);
    return res.status(500).json({
      success: false,
      message: 'Could not create reservation. Please try again.'
    });
  }

  // Track usage for metered billing
  trackUsage(restaurant_id, 'portal_booking');

  // Send confirmation email (fire-and-forget)
  if (customer_email) {
    sendConfirmationEmail({
      customerEmail: customer_email.trim(),
      customerName: customer_name.trim(),
      restaurantName: restaurant.restaurant_name,
      reservationId,
      partySize,
      date,
      time,
      specialRequests: special_requests,
    }).catch(err => logger.error('[Portal] Email send failed:', err.message));
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

/**
 * Send reservation confirmation email via Resend
 */
async function sendConfirmationEmail({ customerEmail, customerName, restaurantName, reservationId, partySize, date, time, specialRequests }) {
  if (!process.env.RESEND_API_KEY) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  await resend.emails.send({
    from: 'Seatable <bookings@seatable.io>',
    to: customerEmail,
    subject: `Reservation Confirmed - ${restaurantName}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
            Seatable<span style="color: #9F1239;">.</span>
          </h1>
        </div>

        <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 8px 0;">
            Your reservation is confirmed!
          </h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">
            Hi ${customerName}, here are your booking details:
          </p>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Restaurant</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${restaurantName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Date</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Time</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${time}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Party Size</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${partySize} ${partySize === 1 ? 'guest' : 'guests'}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #78716C; font-size: 14px;">Confirmation ID</td>
              <td style="padding: 12px 0; color: #9F1239; font-weight: 700; text-align: right; font-family: monospace;">${reservationId}</td>
            </tr>
          </table>

          ${specialRequests ? `
          <div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #E7E5E4;">
            <p style="color: #78716C; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Special Requests</p>
            <p style="color: #1C1917; margin: 0; font-size: 14px;">${specialRequests}</p>
          </div>
          ` : ''}
        </div>

        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Need to modify or cancel? Contact the restaurant directly.
        </p>

        <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E7E5E4;">
          <p style="color: #A8A29E; font-size: 12px; margin: 0;">
            Powered by Seatable - AI Restaurant Management
          </p>
        </div>
      </div>
    `,
  });
}
