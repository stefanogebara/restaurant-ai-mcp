/**
 * ElevenLabs Webhook Handler
 *
 * This is a wrapper endpoint specifically designed for ElevenLabs Conversational AI
 * to ensure proper response formatting and error handling.
 *
 * ElevenLabs expects:
 * - Content-Type: application/json
 * - Valid JSON response (never empty)
 * - HTTP 200 status for success
 * - Proper CORS headers
 */

module.exports = async (req, res) => {
  // Set CORS headers for ElevenLabs
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    console.log('[ElevenLabs] OPTIONS preflight request');
    return res.status(200).json({ success: true, message: 'CORS preflight OK' });
  }

  // Log incoming request for debugging
  console.log('[ElevenLabs] Incoming request:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query
  });

  try {
    // Extract the action from query or body
    const action = req.query.action || req.body?.action;

    if (!action) {
      console.log('[ElevenLabs] No action specified');
      return res.status(200).json({
        success: false,
        error: 'No action specified',
        message: 'Please specify an action parameter',
        available_actions: [
          'check_availability',
          'create_reservation',
          'lookup_reservation',
          'modify_reservation',
          'cancel_reservation',
          'get_wait_time',
          'get_current_datetime'
        ]
      });
    }

    console.log(`[ElevenLabs] Processing action: ${action}`);

    // Route to appropriate handler based on action
    switch (action) {
      case 'get_current_datetime':
        return await handleGetDateTime(req, res);

      case 'check_availability':
        return await handleCheckAvailability(req, res);

      case 'create_reservation':
        return await handleCreateReservation(req, res);

      case 'lookup_reservation':
        return await handleLookupReservation(req, res);

      case 'modify_reservation':
        return await handleModifyReservation(req, res);

      case 'cancel_reservation':
        return await handleCancelReservation(req, res);

      case 'get_wait_time':
        return await handleGetWaitTime(req, res);

      default:
        console.log(`[ElevenLabs] Unknown action: ${action}`);
        return res.status(200).json({
          success: false,
          error: 'Unknown action',
          message: `Action '${action}' is not supported`,
          available_actions: [
            'check_availability',
            'create_reservation',
            'lookup_reservation',
            'modify_reservation',
            'cancel_reservation',
            'get_wait_time',
            'get_current_datetime'
          ]
        });
    }
  } catch (error) {
    console.error('[ElevenLabs] Unhandled error:', error);
    // ALWAYS return valid JSON, even on error
    return res.status(200).json({
      success: false,
      error: true,
      message: 'An error occurred processing your request. Please try again or call us directly.',
      error_details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Handler functions

async function handleGetDateTime(req, res) {
  const timezone = 'Europe/Amsterdam';
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

  const response = {
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

  console.log('[ElevenLabs] get_current_datetime response:', response);
  return res.status(200).json(response);
}

async function handleCheckAvailability(req, res) {
  const { getReservations, getRestaurantInfo, getAllTables } = require('./_lib/airtable');
  const { checkTimeSlotAvailability, getSuggestedTimes } = require('./_lib/availability-calculator');

  const data = req.method === 'POST' ? req.body : req.query;
  const { date, time, party_size } = data;

  if (!date || !time || !party_size) {
    return res.status(200).json({
      success: false,
      error: true,
      message: 'Missing required parameters: date, time, and party_size are required'
    });
  }

  try {
    const { getTables } = require('./_lib/airtable');

    // Get restaurant info AND real-time table status
    console.log('[ElevenLabs] ===== AVAILABILITY CHECK v3.0 - FRESH DATA =====');
    const [restaurantResult, rawTablesResult] = await Promise.all([
      getRestaurantInfo(),
      getTables() // Get RAW tables data directly
    ]);

    if (!restaurantResult.success) {
      return res.status(200).json({
        success: false,
        error: true,
        message: 'Unable to check availability at this time. Please call us directly.'
      });
    }

    const restaurant = restaurantResult.data.records[0];
    if (!restaurant) {
      return res.status(200).json({
        success: false,
        error: true,
        message: 'Restaurant configuration not found'
      });
    }

    const totalCapacity = restaurant.fields.Capacity || 60;
    const openTime = restaurant.fields['Opening Time'] || '17:00';
    const closeTime = restaurant.fields['Closing Time'] || '22:00';

    // Calculate REAL-TIME occupied seats from Tables table - DIRECTLY FROM AIRTABLE
    let currentlyOccupiedSeats = 0;
    const allTables = rawTablesResult.success ? (rawTablesResult.data.records || []) : [];

    console.log(`[ElevenLabs] Found ${allTables.length} total tables in Airtable`);

    allTables.forEach(table => {
      const status = table.fields.Status || 'Available';
      const capacity = table.fields.Capacity || 0;
      const tableNum = table.fields['Table Number'];
      const isActive = table.fields['Is Active'];

      console.log(`[ElevenLabs] Table ${tableNum}: ${status}, ${capacity} seats, Active: ${isActive}`);

      // Count ONLY active tables that are Occupied or Reserved
      if (isActive && (status === 'Occupied' || status === 'Reserved')) {
        currentlyOccupiedSeats += capacity;
        console.log(`[ElevenLabs] ++ Added ${capacity} occupied seats from Table ${tableNum}`);
      }
    });

    console.log(`[ElevenLabs] TOTAL currently occupied/reserved: ${currentlyOccupiedSeats} seats out of ${totalCapacity} total capacity`);

    // Get reservations for the requested date/time
    const filter = `AND(IS_SAME({Date}, '${date}', 'day'), OR({Status} = 'Confirmed', {Status} = 'Seated'))`;
    const reservationsResult = await getReservations(filter);

    if (!reservationsResult.success) {
      return res.status(200).json({
        success: false,
        error: true,
        message: 'Unable to check availability at this time. Please call us directly.'
      });
    }

    const existingReservations = reservationsResult.data.records || [];
    const partySize = parseInt(party_size);

    // Use the EFFECTIVE capacity (total - currently occupied)
    const effectiveCapacity = Math.max(0, totalCapacity - currentlyOccupiedSeats);

    console.log(`[ElevenLabs] Effective capacity for reservations: ${effectiveCapacity} (${totalCapacity} total - ${currentlyOccupiedSeats} occupied)`);

    // If ALL tables are occupied right now, we have ZERO availability
    if (effectiveCapacity === 0) {
      console.log('[ElevenLabs] All tables currently occupied - no availability');
      return res.status(200).json({
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
      });
    }

    const availabilityCheck = checkTimeSlotAvailability(
      time,
      partySize,
      existingReservations,
      effectiveCapacity
    );

    if (availabilityCheck.available) {
      const response = {
        success: true,
        available: true,
        message: `Yes, we have availability for ${partySize} guests on ${date} at ${time}`,
        details: {
          estimated_duration: `${availabilityCheck.estimatedDuration} minutes`,
          occupied_seats: availabilityCheck.occupiedSeats + currentlyOccupiedSeats,
          available_seats: effectiveCapacity - availabilityCheck.occupiedSeats
        }
      };
      console.log('[ElevenLabs] check_availability response:', response);
      return res.status(200).json(response);
    } else {
      const suggestions = getSuggestedTimes(
        time,
        partySize,
        existingReservations,
        effectiveCapacity,
        openTime,
        closeTime
      );

      const response = {
        success: true,
        available: false,
        message: `Sorry, ${time} is fully booked. ${availabilityCheck.reason}. We have ${availabilityCheck.availableSeats} seats available at that time, but your party needs ${partySize} seats.`,
        details: {
          requested_time: time,
          party_size: partySize,
          available_seats_at_time: availabilityCheck.availableSeats,
          occupied_seats: availabilityCheck.occupiedSeats + currentlyOccupiedSeats
        },
        alternative_times: suggestions.length > 0 ? suggestions.map(s => ({
          time: s.time,
          available_seats: s.availableSeats,
          message: `${s.time} has ${s.availableSeats} seats available`
        })) : []
      };
      console.log('[ElevenLabs] check_availability response:', response);
      return res.status(200).json(response);
    }
  } catch (error) {
    console.error('[ElevenLabs] check_availability error:', error);
    return res.status(200).json({
      success: false,
      error: true,
      message: 'Unable to check availability at this time. Please call us directly.'
    });
  }
}

async function handleCreateReservation(req, res) {
  // Delegate to the reservations endpoint
  const reservationsHandler = require('./reservations');
  return reservationsHandler(req, res);
}

async function handleLookupReservation(req, res) {
  const { getReservations } = require('./_lib/airtable');

  const data = req.method === 'POST' ? req.body : req.query;
  const { phone, name } = data;

  if (!phone && !name) {
    return res.status(200).json({
      success: false,
      error: true,
      message: 'Please provide either a phone number or name to lookup your reservation'
    });
  }

  try {
    let filter;
    if (phone) {
      filter = `SEARCH("${phone}", {Phone})`;
    } else {
      filter = `SEARCH("${name}", {Customer Name})`;
    }

    const result = await getReservations(filter);

    if (!result.success) {
      return res.status(200).json({
        success: false,
        error: true,
        message: 'Unable to lookup reservation at this time. Please call us directly.'
      });
    }

    if (result.data.records.length === 0) {
      return res.status(200).json({
        success: true,
        found: false,
        message: 'No reservation found with that information'
      });
    }

    const reservations = result.data.records.map(r => ({
      id: r.id,
      customer_name: r.fields['Customer Name'],
      phone: r.fields.Phone,
      email: r.fields.Email,
      party_size: r.fields['Party Size'],
      date: r.fields.Date,
      time: r.fields.Time,
      status: r.fields.Status,
      special_requests: r.fields['Special Requests']
    }));

    const response = {
      success: true,
      found: true,
      count: reservations.length,
      reservations
    };
    console.log('[ElevenLabs] lookup_reservation response:', response);
    return res.status(200).json(response);
  } catch (error) {
    console.error('[ElevenLabs] lookup_reservation error:', error);
    return res.status(200).json({
      success: false,
      error: true,
      message: 'Unable to lookup reservation at this time. Please call us directly.'
    });
  }
}

async function handleModifyReservation(req, res) {
  const reservationsHandler = require('./reservations');
  return reservationsHandler(req, res);
}

async function handleCancelReservation(req, res) {
  const cancelHandler = require('./cancel-reservation');
  return cancelHandler(req, res);
}

async function handleGetWaitTime(req, res) {
  const waitTimeHandler = require('./get-wait-time');
  return waitTimeHandler(req, res);
}
