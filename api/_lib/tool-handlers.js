/**
 * Shared Tool Handlers - Reusable business logic for voice/chat pipelines
 *
 * These functions extract the core business logic from the ElevenLabs webhook
 * handler into standalone, stateless functions. They can be called by:
 * - ElevenLabs webhook (existing)
 * - OpenAI Realtime voice pipeline (new)
 * - Any future pipeline that needs reservation tool functionality
 *
 * Each function accepts plain JS parameters (not req/res) and returns
 * a result object { success, ...data } or { success: false, error, message }.
 *
 * Conversation logging and usage tracking remain in the caller (pipeline handler),
 * NOT in these shared functions.
 */

const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('ToolHandlers');

// ============================================================================
// WHATSAPP CONFIRMATION AFTER VOICE RESERVATION
// ============================================================================

/**
 * Send a WhatsApp message with Confirm / Cancel buttons after a voice reservation.
 * Fire-and-forget — caller should .catch() the promise.
 */
async function sendVoiceReservationWhatsApp({ phone, restaurantName, restaurantId, reservationId, customerName, partySize, date, time, language }) {
  const { sendInteractiveButtonMessage } = require('../services/whatsapp/message-sender');
  const { formatTime, formatDate } = require('./reservation-validator');

  const lang = language || 'pt-BR';
  const formattedTime = formatTime(time.substring(0, 5));
  const formattedDate = formatDate(date);

  // Try to get Google Maps link from restaurant config
  let mapsLine = '';
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: rc } = await sb.schema('restaurant').from('restaurant_config').select('address, city').eq('id', restaurantId).single();
    if (rc?.address) {
      const q = encodeURIComponent([rc.address, rc.city].filter(Boolean).join(', '));
      mapsLine = `\n📍 https://maps.google.com/?q=${q}`;
    }
  } catch (_) { /* non-fatal */ }

  const bodies = {
    'pt-BR': `✅ *Reserva confirmada!*\n\n📋 ${customerName}\n👥 ${partySize} pessoa${partySize > 1 ? 's' : ''}\n📅 ${formattedDate}\n🕐 ${formattedTime}\n🍽 ${restaurantName}${mapsLine}\n\nCódigo: ${reservationId}`,
    es: `✅ *¡Reserva confirmada!*\n\n📋 ${customerName}\n👥 ${partySize} persona${partySize > 1 ? 's' : ''}\n📅 ${formattedDate}\n🕐 ${formattedTime}\n🍽 ${restaurantName}${mapsLine}\n\nCódigo: ${reservationId}`,
    en: `✅ *Reservation confirmed!*\n\n📋 ${customerName}\n👥 ${partySize} guest${partySize > 1 ? 's' : ''}\n📅 ${formattedDate}\n🕐 ${formattedTime}\n🍽 ${restaurantName}${mapsLine}\n\nCode: ${reservationId}`,
  };

  const confirmLabel = { 'pt-BR': '✅ Confirmar presença', es: '✅ Confirmar asistencia', en: '✅ Confirm attendance' };
  const cancelLabel = { 'pt-BR': '❌ Cancelar reserva', es: '❌ Cancelar reserva', en: '❌ Cancel reservation' };

  const body = bodies[lang] || bodies['pt-BR'];
  const buttons = [
    { id: `confirm_reservation_${reservationId}`, title: (confirmLabel[lang] || confirmLabel['pt-BR']).substring(0, 20) },
    { id: `cancel_reservation_${reservationId}`, title: (cancelLabel[lang] || cancelLabel['pt-BR']).substring(0, 20) },
  ];

  return sendInteractiveButtonMessage(phone, body, buttons);
}

// ============================================================================
// GET CURRENT DATETIME
// ============================================================================

/**
 * Get current date/time information for a given timezone.
 * @param {string} timezone - IANA timezone string (e.g. 'Europe/Madrid'), defaults to 'UTC'
 * @returns {object} Date/time info with relative dates
 */
function getDateTime(timezone = 'UTC') {
  const now = new Date();

  const formatDate = (date) => {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const getDayOfWeek = (date) => {
    return date.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'long'
    });
  };

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return {
    success: true,
    timestamp: now.toISOString(),
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)} ${formatTime(now)}`,
    day_of_week: getDayOfWeek(now),
    timezone: timezone,
    relative_dates: {
      today: formatDate(now),
      tomorrow: formatDate(tomorrow),
      yesterday: formatDate(yesterday),
      next_week: formatDate(nextWeek)
    },
    unix_timestamp: Math.floor(now.getTime() / 1000)
  };
}

// ============================================================================
// CHECK AVAILABILITY
// ============================================================================

/**
 * Check table availability for a given date, time, and party size.
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} restaurant - Restaurant config object (with business_hours, table_configuration, name, etc.)
 * @param {object} params - { date, time, party_size }
 * @returns {object} Availability result
 */
async function checkAvailability(restaurantId, restaurant, { date, time, party_size }) {
  const { getReservations, getTables, canAccommodateParty } = require('./supabase');
  const { checkTimeSlotAvailability, getSuggestedTimes } = require('./availability-calculator');

  if (!date || !time || !party_size) {
    return {
      success: false,
      error: true,
      message: 'Missing required parameters: date, time, and party_size are required'
    };
  }

  try {
    logger.info(`AVAILABILITY CHECK for ${restaurant.name}`, {
      language: restaurant.agent_language || restaurant.language,
      voice_id: restaurant.voice_id
    });

    // Calculate total capacity from table configuration or database
    // Load real tables from DB (snake_case fields)
    const { getAllTables } = require('./db/tables');
    const tablesResult = await getAllTables(restaurantId);
    const dbTables = tablesResult.success ? tablesResult.tables : [];

    // Total seated capacity from active tables
    const totalCapacity = dbTables.reduce((sum, t) => sum + (t.capacity || 0), 0);

    // Currently occupied seats (tables physically in use right now)
    const currentlyOccupiedSeats = dbTables
      .filter(t => t.status === 'Occupied' || t.status === 'Reserved')
      .reduce((sum, t) => sum + (t.capacity || 0), 0);

    logger.debug(`Total capacity: ${totalCapacity} | currently occupied: ${currentlyOccupiedSeats}`);

    // Get business hours for the requested date
    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const businessHours = restaurant.business_hours || {};
    // Support both array [{day, open, close, is_open}] and object {monday: {open, close, is_open}}
    const dayHours = Array.isArray(businessHours)
      ? businessHours.find(d => d.day && d.day.toLowerCase() === dayOfWeek)
      : businessHours[dayOfWeek];

    const openTime = dayHours?.open || dayHours?.open_time || '17:00';
    const closeTime = dayHours?.close || dayHours?.close_time || '22:00';
    const isOpen = !dayHours || dayHours.is_open !== false;

    // Check if restaurant is closed on this day
    if (!isOpen) {
      return {
        success: true,
        available: false,
        message: `Sorry, ${restaurant.restaurant_name || restaurant.name} is closed on ${dayOfWeek}s. Please choose another day.`,
        details: { day: dayOfWeek, is_closed: true }
      };
    }

    // Get reservations for the requested date (confirmed + seated only)
    const reservationsResult = await getReservations(restaurantId, { date, status: null });
    if (!reservationsResult.success) {
      return {
        success: false,
        error: true,
        message: 'Unable to check availability at this time. Please call us directly.'
      };
    }

    // Normalize records — getReservations returns snake_case objects
    const existingReservations = (reservationsResult.data.records || []).filter(r => {
      const s = (r.status || r.fields?.Status || '').toLowerCase();
      return s === 'confirmed' || s === 'seated';
    });

    const partySize = parseInt(party_size);

    // Effective capacity = total minus what's physically occupied right now
    const effectiveCapacity = Math.max(0, totalCapacity - currentlyOccupiedSeats);

    logger.debug(`Effective capacity for reservations: ${effectiveCapacity} (${totalCapacity} total - ${currentlyOccupiedSeats} occupied)`);

    // If ALL tables are occupied right now, we have ZERO availability
    if (effectiveCapacity === 0) {
      logger.info('All tables currently occupied - no availability');
      return {
        success: true,
        available: false,
        message: `Sorry, we are fully booked right now. All ${totalCapacity} seats are currently occupied. Please try calling us to check for walk-in availability or cancellations.`,
        details: {
          total_capacity: totalCapacity,
          currently_occupied: currentlyOccupiedSeats,
          available_seats: 0,
          requested_party_size: partySize
        },
        alternative_times: []
      };
    }

    const availabilityCheck = checkTimeSlotAvailability(
      time,
      partySize,
      existingReservations,
      effectiveCapacity
    );

    // Check if we can accommodate this party size using flexible table combinations
    // Pass date + time so already-booked tables are excluded from the check
    const checkDuration = restaurant?.average_dining_duration_minutes || restaurant?.avg_dining_duration_minutes || 90;
    const accommodationCheck = await canAccommodateParty(restaurantId, partySize, { date, time, durationMinutes: checkDuration });

    if (availabilityCheck.available && accommodationCheck.can_accommodate) {
      const result = {
        success: true,
        available: true,
        message: `Yes, we have space for ${partySize} guests on ${date} at ${time}. Would you like to make a reservation?`,
        details: {
          estimated_duration: `${availabilityCheck.estimatedDuration} minutes`,
          can_accommodate: true
        }
      };
      logger.info('check_availability response:', result);
      return result;
    }

    const suggestions = getSuggestedTimes(
      time,
      partySize,
      existingReservations,
      effectiveCapacity,
      openTime,
      closeTime
    );

    let message = `Sorry, we're fully booked for ${partySize} guests at ${time}.`;
    if (!accommodationCheck.can_accommodate) {
      const maxCap = accommodationCheck.max_capacity;
      message = maxCap
        ? `Sorry, the largest party we can seat is ${maxCap} guests. We cannot accommodate a party of ${partySize}.`
        : `Sorry, we cannot accommodate a party of ${partySize} at the moment.`;
    }

    const result = {
      success: true,
      available: false,
      message,
      details: {
        requested_time: time,
        party_size: partySize
      },
      alternative_times: suggestions.length > 0 ? suggestions.map(s => ({
        time: s.time,
        message: `${s.time} is available`
      })) : []
    };
    logger.info('check_availability response:', result);
    return result;
  } catch (error) {
    logger.error('check_availability error:', error);
    return {
      success: false,
      error: true,
      message: 'Unable to check availability at this time. Please call us directly.'
    };
  }
}

// ============================================================================
// CREATE RESERVATION
// ============================================================================

/**
 * Create a new reservation. Delegates to the reservations module for the actual
 * DB insert (which includes ML scoring, SMS, customer history, etc.).
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} restaurant - Restaurant config object
 * @param {object} params - { date, time, party_size, customer_name, customer_phone, customer_email, special_requests }
 * @returns {object} Reservation result
 */
async function createReservation(restaurantId, restaurant, params) {
  const { validateReservation, buildVoiceConfirmation } = require('./reservation-validator');
  const { checkTimeSlotAvailability } = require('./availability-calculator');
  const {
    getReservations,
    canAccommodateParty,
    createReservation: dbCreateReservation,
    generateReservationId
  } = require('./supabase');

  const { date, time, party_size, customer_name, customer_phone, customer_email, special_requests } = params;
  const restaurantName = restaurant.restaurant_name || restaurant.name || 'the restaurant';

  logger.info(`CreateReservation: Processing for ${restaurantName}:`, { date, time, party_size, customer_name });

  // Validate required fields
  if (!date || !time || !party_size || !customer_name || !customer_phone) {
    return {
      success: false,
      error: 'missing_fields',
      message: `I need a few more details to complete your reservation at ${restaurantName}. Please provide the date, time, party size, your name, and phone number.`
    };
  }

  try {
    // Validate reservation against restaurant configuration
    const validation = validateReservation({ date, time, party_size }, restaurant);

    if (!validation.valid) {
      logger.info(`CreateReservation: Validation failed:`, validation.errors);
      return {
        success: false,
        error: validation.errors[0].code,
        message: validation.message,
        restaurant_name: restaurantName
      };
    }

    // Check availability before creating
    const reservationsResult = await getReservations(restaurantId, { date });
    let existingReservations = reservationsResult.success ? (reservationsResult.data.records || []) : [];
    existingReservations = existingReservations.filter(r => {
      const s = (r.status || r.fields?.Status || '').toLowerCase();
      return s === 'confirmed' || s === 'seated';
    });

    // Check if we can accommodate — pass date/time so booked tables are excluded
    const durationMinutes = restaurant.average_dining_duration_minutes || restaurant.avg_dining_duration_minutes || 90;
    const accommodationCheck = await canAccommodateParty(
      restaurantId,
      parseInt(party_size),
      { date, time, durationMinutes }
    );
    if (!accommodationCheck.can_accommodate) {
      const maxCap = accommodationCheck.max_capacity;
      const capacityMsg = maxCap
        ? `The largest party we can seat is ${maxCap} guests.`
        : `We cannot accommodate a party of ${party_size}.`;
      return {
        success: false,
        error: 'no_availability',
        message: `Sorry, ${restaurantName} cannot accommodate a party of ${party_size}. ${capacityMsg} Would you like to book for a smaller group, or would you prefer to call us directly?`,
        restaurant_name: restaurantName
      };
    }

    // Create the reservation via Supabase directly
    const reservationId = generateReservationId();
    const { getLocalDate } = require('./timezone');
    const timezone = restaurant.timezone || 'UTC';

    const fields = {
      reservation_id: reservationId,
      date: date,
      time: time,
      party_size: parseInt(party_size),
      customer_name: customer_name,
      customer_phone: customer_phone,
      customer_email: customer_email || '',
      special_requests: special_requests || '',
      status: 'confirmed',
      notes: 'Created via AI Voice System',
      // Link the specific tables that will be used — enables real-time floor plan sync
      table_ids: accommodationCheck.table_ids || []
    };

    const createResult = await dbCreateReservation(restaurantId, fields);

    if (!createResult.success) {
      logger.error('CreateReservation: DB insert failed:', createResult);
      return {
        success: false,
        error: true,
        message: 'I apologize, but something went wrong. Please try again or call us directly.',
        restaurant_name: restaurantName
      };
    }

    // Fire-and-forget: send WhatsApp confirmation with Confirm/Cancel buttons
    const normalizedPhone = customer_phone.startsWith('+') ? customer_phone : `+${customer_phone}`;
    sendVoiceReservationWhatsApp({
      phone: normalizedPhone,
      restaurantName,
      restaurantId,
      reservationId,
      customerName: customer_name,
      partySize: party_size,
      date,
      time,
      language: restaurant.language || restaurant.agent_language || 'pt-BR'
    }).catch(err => logger.warn('WhatsApp confirmation failed (non-fatal):', err.message));

    // Build voice-friendly confirmation (no confirmation code — sent via WhatsApp)
    const confirmationMessage = buildVoiceConfirmation(
      { customer_name, party_size, date, time, special_requests },
      restaurant,
      reservationId
    );

    return {
      success: true,
      reservation_id: reservationId,
      restaurant_name: restaurantName,
      message: confirmationMessage
    };
  } catch (error) {
    logger.error('CreateReservation Error:', error);
    return {
      success: false,
      error: true,
      message: 'I apologize, but something went wrong. Please try again or call us directly.'
    };
  }
}

// ============================================================================
// LOOKUP RESERVATION
// ============================================================================

/**
 * Look up an existing reservation by phone, name, or reservation ID.
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} params - { phone, name, reservation_id }
 * @returns {object} Lookup result with reservation details
 */
async function lookupReservation(restaurantId, { phone, name, reservation_id }) {
  const { findReservation } = require('./supabase');

  if (!phone && !name && !reservation_id) {
    return {
      success: false,
      error: true,
      message: 'Please provide either a phone number, name, or reservation ID to lookup your reservation'
    };
  }

  try {
    // Normalize phone: strip spaces, dashes, parens. Try with and without country code.
    const normalizePhone = (p) => p ? p.replace(/[\s\-\(\)]/g, '') : undefined;
    const phoneNorm = normalizePhone(phone);

    // Try multiple lookup strategies: reservation_id > phone > name > phone variants
    let result = await findReservation(restaurantId, {
      reservation_id: reservation_id || undefined,
      customer_phone: !reservation_id ? phoneNorm : undefined,
      customer_name: !reservation_id && !phoneNorm ? name : undefined
    });

    // If phone lookup failed, try with +country code variants
    if (!result.success && phoneNorm && !reservation_id) {
      const variants = [
        phoneNorm.startsWith('+') ? phoneNorm.slice(1) : '+' + phoneNorm,
        phoneNorm.startsWith('+55') ? phoneNorm.slice(3) : '+55' + phoneNorm,
        phoneNorm.length > 10 ? phoneNorm.slice(-11) : phoneNorm, // last 11 digits
      ];
      for (const variant of variants) {
        result = await findReservation(restaurantId, { customer_phone: variant });
        if (result.success) break;
      }
    }

    // If phone lookup still failed, try by name as fallback
    if (!result.success && name && !reservation_id) {
      result = await findReservation(restaurantId, { customer_name: name });
    }

    if (!result.success) {
      return {
        success: true,
        found: false,
        message: 'No reservation found with that information'
      };
    }

    const r = result.reservation;
    const reservations = [{
      id: r.record_id,
      reservation_id: r.reservation_id,
      customer_name: r.customer_name,
      phone: r.customer_phone,
      email: r.customer_email,
      party_size: r.party_size,
      date: r.reservation_time ? r.reservation_time.split(' ')[0] : undefined,
      time: r.reservation_time ? r.reservation_time.split(' ')[1] : undefined,
      status: r.status,
      special_requests: r.special_requests
    }];

    const response = {
      success: true,
      found: true,
      count: reservations.length,
      reservations
    };
    logger.info('lookup_reservation response:', response);
    return response;
  } catch (error) {
    logger.error('lookup_reservation error:', error);
    return {
      success: false,
      error: true,
      message: 'Unable to lookup reservation at this time. Please call us directly.'
    };
  }
}

// ============================================================================
// MODIFY RESERVATION
// ============================================================================

/**
 * Modify an existing reservation.
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} params - { reservation_id, new_date, new_time, new_party_size }
 * @returns {object} Modification result
 */
async function modifyReservation(restaurantId, { reservation_id, new_date, new_time, new_party_size }) {
  const { updateReservation, findReservation } = require('./supabase');
  const { getLocalDate } = require('./timezone');

  if (!reservation_id) {
    return {
      success: false,
      error: true,
      message: 'I need your confirmation number to modify your reservation.'
    };
  }

  try {
    // Find the reservation first to verify it exists
    const lookupResult = await findReservation(restaurantId, { reservation_id });
    if (!lookupResult.success) {
      return {
        success: false,
        error: true,
        message: 'I couldn\'t find a reservation with that confirmation number. Could you double-check and try again?'
      };
    }

    const updateFields = {};
    if (new_date) updateFields.date = new_date;
    if (new_time) updateFields.time = new_time;
    if (new_party_size) updateFields.party_size = parseInt(new_party_size);

    const result = await updateReservation(restaurantId, reservation_id, updateFields);

    if (!result.success) {
      return {
        success: false,
        error: true,
        message: 'I couldn\'t update your reservation. Please try again or call us directly.'
      };
    }

    const changes = [];
    if (new_date) changes.push(`date to ${new_date}`);
    if (new_time) changes.push(`time to ${new_time}`);
    if (new_party_size) changes.push(`party size to ${new_party_size}`);

    const changesList = changes.length > 0 ? ` I've updated your ${changes.join(', ')}.` : '';
    return {
      success: true,
      message: `Your reservation has been successfully modified!${changesList} Your confirmation number is still ${reservation_id}.`
    };
  } catch (error) {
    logger.error('modify_reservation error:', error);
    return {
      success: false,
      error: true,
      message: 'I couldn\'t update your reservation. Please try again or call us directly.'
    };
  }
}

// ============================================================================
// CANCEL RESERVATION
// ============================================================================

/**
 * Cancel an existing reservation.
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} params - { reservation_id }
 * @returns {object} Cancellation result
 */
async function cancelReservation(restaurantId, { reservation_id }) {
  const { cancelReservation: dbCancelReservation, findReservation } = require('./supabase');

  if (!reservation_id) {
    return {
      success: false,
      error: true,
      message: 'I need your confirmation number to cancel your reservation.'
    };
  }

  try {
    // Try cancel with the given ID first
    let result = await dbCancelReservation(restaurantId, reservation_id);

    // If it failed and the ID looks like a UUID (not RES-xxx), look up by UUID directly
    if (!result.success && !reservation_id.startsWith('RES-')) {
      logger.info('Cancel failed with non-RES ID, trying UUID lookup', { id: reservation_id });
      const supabaseAdmin = require('./supabase').supabaseAdmin;
      const { data: row } = await supabaseAdmin
        .from('reservations')
        .select('reservation_id')
        .eq('id', reservation_id)
        .eq('restaurant_id', restaurantId)
        .single();
      if (row?.reservation_id) {
        result = await dbCancelReservation(restaurantId, row.reservation_id);
      }
    }

    if (!result.success) {
      return {
        success: false,
        error: true,
        message: 'I couldn\'t cancel your reservation. Please try again or call us directly.'
      };
    }

    return {
      success: true,
      message: `Your reservation has been cancelled. We're sorry we won't see you this time, but we hope you'll visit us in the future!`
    };
  } catch (error) {
    logger.error('cancel_reservation error:', error);
    return {
      success: false,
      error: true,
      message: 'I couldn\'t cancel your reservation. Please try again or call us directly.'
    };
  }
}

// ============================================================================
// GET WAIT TIME
// ============================================================================

/**
 * Get current estimated wait time for a restaurant.
 * @param {string} restaurantId - Restaurant UUID
 * @returns {object} Wait time estimate
 */
async function getWaitTime(restaurantId) {
  const { getReservations, getRestaurantInfo } = require('./supabase');

  try {
    // Get restaurant info for capacity
    const restaurantResult = await getRestaurantInfo(restaurantId);
    if (!restaurantResult.success) {
      return {
        success: false,
        error: true,
        message: 'Unable to calculate wait time at this time. Please call us directly.'
      };
    }

    const restaurant = restaurantResult.data.records[0];
    if (!restaurant) {
      return {
        success: false,
        error: true,
        message: 'Restaurant configuration not found'
      };
    }

    const capacity = restaurant.capacity || restaurant.fields?.Capacity || 60;

    // Get today's reservations
    const today = new Date().toISOString().split('T')[0];
    const reservationsResult = await getReservations(restaurantId, { date: today });

    if (!reservationsResult.success) {
      return {
        success: false,
        error: true,
        message: 'Unable to calculate wait time at this time. Please call us directly.'
      };
    }

    // Calculate current occupancy
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const nowTime = currentHour * 60 + currentMinute;

    let upcomingReservations = 0;
    reservationsResult.data.records.forEach(record => {
      const timeStr = record.time || record.fields?.Time || '';
      if (!timeStr) return;

      const [hour, minute] = timeStr.split(':').map(Number);
      if (isNaN(hour) || isNaN(minute)) return;

      const resTime = hour * 60 + minute;
      const timeDiff = resTime - nowTime;

      // Count reservations within next 2 hours
      if (timeDiff >= 0 && timeDiff <= 120) {
        upcomingReservations++;
      }
    });

    // Calculate occupancy and wait time
    const occupancy = upcomingReservations / capacity;
    let waitMinutes = 10;

    if (occupancy > 0.8) {
      waitMinutes = 30 + Math.floor(Math.random() * 15);
    } else if (occupancy > 0.6) {
      waitMinutes = 20 + Math.floor(Math.random() * 10);
    } else if (occupancy > 0.4) {
      waitMinutes = 15 + Math.floor(Math.random() * 5);
    }

    // Add extra time during peak hours (6 PM - 8 PM)
    const isPeakHour = (currentHour >= 18 && currentHour <= 20);
    if (isPeakHour) {
      waitMinutes += 10;
    }

    return {
      success: true,
      estimated_wait_minutes: waitMinutes,
      message: `Current estimated wait time is ${waitMinutes} minutes`,
      is_peak_hour: isPeakHour,
      occupancy_percentage: Math.round(occupancy * 100)
    };
  } catch (error) {
    logger.error('get_wait_time error:', error);
    return {
      success: false,
      error: true,
      message: 'Unable to calculate wait time at this time. Please call us directly.'
    };
  }
}

// ============================================================================
// IDENTIFY RESTAURANT
// ============================================================================

/**
 * Identify which restaurant the customer wants to book at (multi-tenant mode).
 * @param {string} restaurant_name - Name the customer provided
 * @param {string} sender_phone - Customer's phone number
 * @param {string} conversation_id - Current conversation ID
 * @returns {object} Restaurant identification result
 */
async function identifyRestaurant(restaurant_name, sender_phone, conversation_id) {
  const { getRestaurantByName, getAllActiveRestaurants } = require('./restaurant-registry');
  const { getOrCreateSession, setSessionRestaurant, getSessionByPhone } = require('./whatsapp-sessions');

  const MULTI_TENANT_MODE = process.env.MULTI_TENANT_MODE === 'true';

  logger.info('identify_restaurant called:', { restaurant_name, sender_phone, conversation_id });

  if (!MULTI_TENANT_MODE) {
    return {
      success: false,
      error: 'Multi-tenant mode not enabled',
      message: 'Restaurant identification is not available in single-tenant mode.'
    };
  }

  try {
    // Get or create session for this sender
    const session = await getOrCreateSession(sender_phone, conversation_id);

    if (!session) {
      return {
        success: false,
        error: 'Session error',
        message: 'Unable to create conversation session. Please try again.'
      };
    }

    // If session already has a confirmed restaurant, return it
    if (session.restaurant_confirmed && session.restaurant) {
      logger.info(`Session already has restaurant: ${session.restaurant.restaurant_name}`);
      return {
        success: true,
        restaurant_identified: true,
        restaurant_name: session.restaurant.restaurant_name,
        restaurant_id: session.restaurant.id,
        message: `Continuing with ${session.restaurant.restaurant_name}. How can I help you with your reservation?`
      };
    }

    // If no restaurant name provided, ask for it
    if (!restaurant_name) {
      const allRestaurants = await getAllActiveRestaurants();
      const restaurantList = allRestaurants.map(r => r.restaurant_name).join(', ');

      return {
        success: false,
        restaurant_identified: false,
        needs_restaurant_name: true,
        message: `Which restaurant would you like to make a reservation at? Available restaurants: ${restaurantList || 'Please contact support to configure restaurants.'}`,
        available_restaurants: allRestaurants.map(r => r.restaurant_name)
      };
    }

    // Try to match the restaurant name
    const matchResult = await getRestaurantByName(restaurant_name);

    // High confidence match
    if (matchResult.match && matchResult.confidence >= 0.8) {
      const updatedSession = await setSessionRestaurant(session.id, matchResult.match.id);

      logger.info(`Restaurant identified: ${matchResult.match.restaurant_name} (confidence: ${matchResult.confidence})`);

      return {
        success: true,
        restaurant_identified: true,
        restaurant_name: matchResult.match.restaurant_name,
        restaurant_id: matchResult.match.id,
        confidence: matchResult.confidence,
        message: `Great! I'll help you with your reservation at ${matchResult.match.restaurant_name}. What date and time would you like to book?`
      };
    }

    // Medium confidence - confirm with user
    if (matchResult.match && matchResult.confidence >= 0.5) {
      return {
        success: false,
        restaurant_identified: false,
        needs_confirmation: true,
        suggested_restaurant: matchResult.match.restaurant_name,
        confidence: matchResult.confidence,
        message: `Did you mean ${matchResult.match.restaurant_name}? Please confirm or tell me the correct restaurant name.`
      };
    }

    // Multiple possible matches
    if (matchResult.needsDisambiguation && matchResult.matches) {
      const options = matchResult.matches.map(m => m.restaurant_name).slice(0, 5);

      return {
        success: false,
        restaurant_identified: false,
        needs_clarification: true,
        possible_matches: options,
        message: `I found several restaurants matching "${restaurant_name}": ${options.join(', ')}. Which one did you mean?`
      };
    }

    // No match found
    const allRestaurants = await getAllActiveRestaurants();
    const restaurantList = allRestaurants.map(r => r.restaurant_name).slice(0, 10).join(', ');

    return {
      success: false,
      restaurant_identified: false,
      not_found: true,
      message: `I couldn't find a restaurant called "${restaurant_name}". Available restaurants: ${restaurantList || 'No restaurants configured.'}`,
      available_restaurants: allRestaurants.map(r => r.restaurant_name)
    };
  } catch (error) {
    logger.error('identify_restaurant error:', error);
    return {
      success: false,
      error: true,
      message: 'Unable to identify restaurant at this time. Please try again or call us directly.'
    };
  }
}

module.exports = {
  getDateTime,
  checkAvailability,
  createReservation,
  lookupReservation,
  modifyReservation,
  cancelReservation,
  getWaitTime,
  identifyRestaurant
};
