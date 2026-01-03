/**
 * ElevenLabs Webhook Handler - Multi-Restaurant Support
 *
 * This is a wrapper endpoint specifically designed for ElevenLabs Conversational AI
 * with support for multiple restaurants, each with their own configuration.
 *
 * ElevenLabs expects:
 * - Content-Type: application/json
 * - Valid JSON response (never empty)
 * - HTTP 200 status for success
 * - Proper CORS headers
 *
 * Restaurant Routing:
 * - Uses X-Called-Number header or phone query param to identify restaurant
 * - Loads restaurant-specific voice, greeting, hours, and table configuration
 * - Each restaurant can have different language, voice, and settings
 */

const { getRestaurantByPhone, getRestaurantById } = require('./_lib/restaurant-loader');
const conversationLogger = require('./services/conversationLogger');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');

// Multi-tenant imports for WhatsApp routing
const { getRestaurantByName, getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { getRestaurantClient } = require('./_lib/multi-tenant-supabase');
const { getOrCreateSession, setSessionRestaurant, getSessionByPhone } = require('./_lib/whatsapp-sessions');

// Check if multi-tenant mode is enabled
const MULTI_TENANT_MODE = process.env.MULTI_TENANT_MODE === 'true';

module.exports = async (req, res) => {
  // Set CORS headers for ElevenLabs webhook (external service)
  setWebhookCors(req, res);
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) {
    return;
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
    // Extract the action from query or body FIRST
    const action = req.query.action || req.body?.action;

    // ===== CONVERSATION LOGGING =====
    // Extract conversation metadata from ElevenLabs webhook
    const conversationId = req.body?.conversation_id || req.headers['x-conversation-id'];
    const callerPhone = req.headers['x-caller-number'] || req.body?.caller_phone;
    const calledPhone = req.headers['x-called-number'] || req.body?.called_phone;

    // Start conversation logging if this is the first action
    if (conversationId && action && !req.body?.conversation_started) {
      await conversationLogger.startConversation({
        conversation_id: conversationId,
        caller_phone: callerPhone,
        called_phone: calledPhone,
        language: req.body?.language || 'en',
        agent_version: 'v1.0'
      });
      // Mark as started to prevent duplicate logs
      req.body = req.body || {};
      req.body.conversation_started = true;
    }

    // Store conversation ID in request for use in handlers
    req.conversation_id = conversationId;

    // ===== RESTAURANT ROUTING =====
    // Some actions (like get_current_datetime, identify_restaurant) don't need restaurant context upfront
    const actionsRequiringRestaurant = [
      'check_availability',
      'create_reservation',
      'lookup_reservation',
      'modify_reservation',
      'cancel_reservation',
      'get_wait_time'
    ];

    // Actions that handle their own restaurant identification (multi-tenant mode)
    const multiTenantActions = ['identify_restaurant'];

    let restaurant = null;

    // Only look up restaurant if action requires it
    if (action && actionsRequiringRestaurant.includes(action)) {
      // Try multiple methods to identify which restaurant is being called
      const calledNumber = req.headers['x-called-number'] || req.query.phone || req.body?.phone;
      const restaurantId = req.query.restaurant_id || req.body?.restaurant_id;
      const senderPhone = req.headers['x-caller-number'] || req.body?.sender_phone || req.body?.caller_phone;

      // Method 0: Multi-tenant session lookup (for WhatsApp)
      if (MULTI_TENANT_MODE && senderPhone) {
        try {
          console.log(`[ElevenLabs] Multi-tenant mode: Checking session for ${senderPhone}`);
          const session = await getSessionByPhone(senderPhone);

          if (session && session.restaurant_confirmed && session.restaurant) {
            console.log(`[ElevenLabs] ✅ Found session with restaurant: ${session.restaurant.restaurant_name}`);
            // Use the multi-tenant client for this restaurant
            req.multiTenantClient = getRestaurantClient(session.restaurant);
            req.multiTenantRestaurant = session.restaurant;
            req.session = session;

            // Create a compatible restaurant object for existing handlers
            restaurant = {
              id: session.restaurant.id,
              name: session.restaurant.restaurant_name,
              language: session.restaurant.language || 'en',
              voice_id: session.restaurant.voice_id,
              // These will need to be loaded from the restaurant's own database
              business_hours: {},
              table_configuration: []
            };
          }
        } catch (error) {
          console.error(`[ElevenLabs] Multi-tenant session lookup error:`, error.message);
        }
      }

      // Method 1: Look up by phone number (preferred - single-tenant mode)
      if (!restaurant && calledNumber) {
        try {
          console.log(`[ElevenLabs] Looking up restaurant by phone: ${calledNumber}`);
          restaurant = await getRestaurantByPhone(calledNumber);
          console.log(`[ElevenLabs] ✅ Loaded restaurant: ${restaurant.name} (${restaurant.language})`);
        } catch (error) {
          console.error(`[ElevenLabs] ❌ Restaurant not found for phone ${calledNumber}:`, error.message);
        }
      }

      // Method 2: Look up by restaurant ID (fallback)
      if (!restaurant && restaurantId) {
        try {
          console.log(`[ElevenLabs] Looking up restaurant by ID: ${restaurantId}`);
          restaurant = await getRestaurantById(restaurantId);
          console.log(`[ElevenLabs] ✅ Loaded restaurant: ${restaurant.name}`);
        } catch (error) {
          console.error(`[ElevenLabs] ❌ Restaurant not found for ID ${restaurantId}:`, error.message);
        }
      }

      // If no restaurant found, check if we should ask user in multi-tenant mode
      if (!restaurant) {
        if (MULTI_TENANT_MODE) {
          console.log('[ElevenLabs] Multi-tenant mode: No restaurant in session - ask user to identify');
          return res.status(200).json({
            success: false,
            error: 'No restaurant selected',
            message: 'Please tell me which restaurant you would like to make a reservation at.',
            requires_restaurant_identification: true
          });
        } else {
          console.log('[ElevenLabs] ⚠️ No restaurant identified - please provide phone number or restaurant_id');
          return res.status(200).json({
            success: false,
            error: 'Restaurant not identified',
            message: 'Unable to determine which restaurant you are calling. Please check your configuration.',
            help: 'Provide either X-Called-Number header, phone query param, or restaurant_id'
          });
        }
      }

      // Store restaurant in request for use in handlers
      req.restaurant = restaurant;
    }

    if (!action) {
      console.log('[ElevenLabs] No action specified');
      const availableActions = [
        'check_availability',
        'create_reservation',
        'lookup_reservation',
        'modify_reservation',
        'cancel_reservation',
        'get_wait_time',
        'get_current_datetime'
      ];
      // Add multi-tenant actions if enabled
      if (MULTI_TENANT_MODE) {
        availableActions.unshift('identify_restaurant');
      }
      return res.status(200).json({
        success: false,
        error: 'No action specified',
        message: 'Please specify an action parameter',
        available_actions: availableActions,
        multi_tenant_mode: MULTI_TENANT_MODE
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

      case 'identify_restaurant':
        return await handleIdentifyRestaurant(req, res);

      default:
        console.log(`[ElevenLabs] Unknown action: ${action}`);
        const defaultAvailableActions = [
          'check_availability',
          'create_reservation',
          'lookup_reservation',
          'modify_reservation',
          'cancel_reservation',
          'get_wait_time',
          'get_current_datetime'
        ];
        if (MULTI_TENANT_MODE) {
          defaultAvailableActions.unshift('identify_restaurant');
        }
        return res.status(200).json({
          success: false,
          error: 'Unknown action',
          message: `Action '${action}' is not supported`,
          available_actions: defaultAvailableActions
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
  // Get timezone from query, body, or default to Europe/Madrid (Spain)
  // Restaurants can specify their timezone via query param: ?timezone=America/New_York
  const timezone = req.query.timezone || req.body?.timezone || 'Europe/Madrid';
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
  const conversationId = req.conversation_id;

  const { getReservations, getAllTables, canAccommodateParty } = require('./_lib/supabase');
  const { checkTimeSlotAvailability, getSuggestedTimes } = require('./_lib/availability-calculator');

  const data = req.method === 'POST' ? req.body : req.query;
  const { date, time, party_size } = data;

  // Log tool call
  if (conversationId) {
    await conversationLogger.logToolCall(conversationId, {
      tool_name: 'check_availability',
      parameters: { date, time, party_size },
      success: null
    });
  }

  if (!date || !time || !party_size) {
    return res.status(200).json({
      success: false,
      error: true,
      message: 'Missing required parameters: date, time, and party_size are required'
    });
  }

  try {
    // ===== USE RESTAURANT-SPECIFIC CONFIGURATION =====
    const restaurant = req.restaurant; // Loaded by webhook router

    console.log(`[ElevenLabs] ===== AVAILABILITY CHECK for ${restaurant.name} =====`);
    console.log(`[ElevenLabs] Language: ${restaurant.language}`);
    console.log(`[ElevenLabs] Voice: ${restaurant.voice_id}`);

    // Calculate total capacity from table configuration
    let totalCapacity = 0;
    if (restaurant.table_configuration && Array.isArray(restaurant.table_configuration)) {
      restaurant.table_configuration.forEach(area => {
        if (area.tables && Array.isArray(area.tables)) {
          area.tables.forEach(table => {
            totalCapacity += table.capacity || 0;
          });
        }
      });
    }

    console.log(`[ElevenLabs] Total capacity: ${totalCapacity} seats`);

    // Get business hours for the requested date
    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayHours = restaurant.business_hours?.[dayOfWeek];

    const openTime = dayHours?.open_time || '17:00';
    const closeTime = dayHours?.close_time || '22:00';
    const isOpen = dayHours?.is_open !== false;

    // Check if restaurant is closed on this day
    if (!isOpen) {
      const restaurantName = restaurant.name;
      return res.status(200).json({
        success: true,
        available: false,
        message: `Sorry, ${restaurantName} is closed on ${dayOfWeek}s. Please choose another day.`,
        details: {
          day: dayOfWeek,
          is_closed: true
        }
      });
    }

    // Get real-time table status from Supabase
    const { getTables } = require('./_lib/supabase');
    const rawTablesResult = await getTables();

    // Calculate REAL-TIME occupied seats from Tables table
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

    // Check if we can accommodate this party size using flexible table combinations
    const accommodationCheck = await canAccommodateParty(partySize);

    if (availabilityCheck.available && accommodationCheck.can_accommodate) {
      // Customer-friendly response - don't expose table details
      const response = {
        success: true,
        available: true,
        message: `Yes, we have space for ${partySize} guests on ${date} at ${time}. Would you like to make a reservation?`,
        details: {
          estimated_duration: `${availabilityCheck.estimatedDuration} minutes`,
          can_accommodate: true
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

      // Customer-friendly response - don't mention tables or seats
      let message = `Sorry, we're fully booked for ${partySize} guests at ${time}.`;
      if (!accommodationCheck.can_accommodate) {
        message = `Sorry, we cannot accommodate a party of ${partySize} at the moment.`;
      }

      const response = {
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
  const conversationId = req.conversation_id;
  const startTime = Date.now();
  const { validateReservation, buildVoiceConfirmation } = require('./_lib/reservation-validator');

  try {
    const data = req.method === 'POST' ? req.body : req.query;
    const { date, time, party_size, customer_name, customer_phone, customer_email, special_requests } = data;

    // Get restaurant from session (multi-tenant) or request
    const restaurant = req.multiTenantRestaurant || req.restaurant || {};
    const restaurantName = restaurant.restaurant_name || 'the restaurant';

    console.log(`[CreateReservation] Processing for ${restaurantName}:`, { date, time, party_size, customer_name });

    // Log tool call start
    if (conversationId) {
      await conversationLogger.logToolCall(conversationId, {
        tool_name: 'create_reservation',
        parameters: { ...data, restaurant_name: restaurantName },
        success: null,
        timestamp: new Date().toISOString()
      });
    }

    // Validate required fields
    if (!date || !time || !party_size || !customer_name || !customer_phone) {
      return res.status(200).json({
        success: false,
        error: 'missing_fields',
        message: `I need a few more details to complete your reservation at ${restaurantName}. Please provide the date, time, party size, your name, and phone number.`
      });
    }

    // Validate reservation against restaurant configuration
    const validation = validateReservation({ date, time, party_size }, restaurant);

    if (!validation.valid) {
      console.log(`[CreateReservation] Validation failed:`, validation.errors);
      return res.status(200).json({
        success: false,
        error: validation.errors[0].code,
        message: validation.message,
        restaurant_name: restaurantName
      });
    }

    // Check availability before creating
    const { checkTimeSlotAvailability } = require('./_lib/availability-calculator');
    const { getReservations, canAccommodateParty } = require('./_lib/supabase');

    // Get existing reservations for the date
    const filter = `AND(IS_SAME({Date}, '${date}', 'day'), OR({Status} = 'Confirmed', {Status} = 'Seated'))`;
    const reservationsResult = await getReservations(filter);
    const existingReservations = reservationsResult.success ? (reservationsResult.data.records || []) : [];

    // Check if we can accommodate
    const accommodationCheck = await canAccommodateParty(parseInt(party_size));
    if (!accommodationCheck.can_accommodate) {
      return res.status(200).json({
        success: false,
        error: 'no_availability',
        message: `Sorry, ${restaurantName} cannot accommodate a party of ${party_size} at ${time} on that date. Would you like to try a different time or date?`,
        restaurant_name: restaurantName
      });
    }

    // Create the reservation
    req.query.action = 'create';
    const reservationsHandler = require('./reservations');

    // Intercept response to add restaurant name and enhanced confirmation
    const originalJson = res.json.bind(res);
    res.json = async function(responseData) {
      const success = responseData.message && responseData.message.includes('confirmed');
      const duration = Math.floor((Date.now() - startTime) / 1000);

      // Extract reservation ID from message if present
      const reservationIdMatch = responseData.message?.match(/RES-[A-Za-z0-9-]+/);
      const reservationId = reservationIdMatch ? reservationIdMatch[0] : null;

      if (success && reservationId) {
        // Build enhanced confirmation with restaurant name
        const confirmationMessage = buildVoiceConfirmation(
          { customer_name, party_size, date, time, special_requests },
          restaurant,
          reservationId
        );

        // Log success
        if (conversationId) {
          await conversationLogger.logToolCall(conversationId, {
            tool_name: 'create_reservation',
            parameters: { ...data, restaurant_name: restaurantName },
            success: true,
            result: { reservation_id: reservationId }
          });

          await conversationLogger.endConversation(conversationId, {
            outcome: 'reservation_created',
            reservation_id: reservationId,
            restaurant_name: restaurantName,
            customer_name,
            party_size,
            requested_date: date,
            requested_time: time,
            successful_booking: true,
            duration_seconds: duration,
            summary: `Reservation at ${restaurantName} for ${customer_name}, party of ${party_size} on ${date} at ${time}`
          });
        }

        return originalJson({
          success: true,
          reservation_id: reservationId,
          restaurant_name: restaurantName,
          message: confirmationMessage
        });
      }

      // Log failure
      if (conversationId) {
        await conversationLogger.logToolCall(conversationId, {
          tool_name: 'create_reservation',
          parameters: data,
          success: false,
          error_message: responseData.message
        });
      }

      return originalJson({
        ...responseData,
        restaurant_name: restaurantName
      });
    };

    return reservationsHandler(req, res);

  } catch (error) {
    console.error('[CreateReservation] Error:', error);
    if (conversationId) {
      await conversationLogger.logToolCall(conversationId, {
        tool_name: 'create_reservation',
        parameters: req.body,
        success: false,
        error_message: error.message
      });
    }
    return res.status(200).json({
      success: false,
      error: true,
      message: 'I apologize, but something went wrong. Please try again or call us directly.'
    });
  }
}

async function handleLookupReservation(req, res) {
  const { getReservations } = require('./_lib/supabase');

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
  // Set the action expected by the reservations handler
  req.query.action = 'modify';
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

/**
 * Handle restaurant identification for multi-tenant WhatsApp routing
 * This action is called first to identify which restaurant the customer wants to book at
 */
async function handleIdentifyRestaurant(req, res) {
  const data = req.method === 'POST' ? req.body : req.query;
  const {
    restaurant_name,
    sender_phone,
    conversation_id
  } = data;

  console.log('[ElevenLabs] identify_restaurant called:', { restaurant_name, sender_phone, conversation_id });

  // Validate multi-tenant mode is enabled
  if (!MULTI_TENANT_MODE) {
    return res.status(200).json({
      success: false,
      error: 'Multi-tenant mode not enabled',
      message: 'Restaurant identification is not available in single-tenant mode.'
    });
  }

  try {
    // Get or create session for this sender
    const session = await getOrCreateSession(sender_phone, conversation_id);

    if (!session) {
      return res.status(200).json({
        success: false,
        error: 'Session error',
        message: 'Unable to create conversation session. Please try again.'
      });
    }

    // If session already has a confirmed restaurant, return it
    if (session.restaurant_confirmed && session.restaurant) {
      console.log(`[ElevenLabs] Session already has restaurant: ${session.restaurant.restaurant_name}`);
      return res.status(200).json({
        success: true,
        restaurant_identified: true,
        restaurant_name: session.restaurant.restaurant_name,
        restaurant_id: session.restaurant.id,
        message: `Continuing with ${session.restaurant.restaurant_name}. How can I help you with your reservation?`
      });
    }

    // If no restaurant name provided, ask for it
    if (!restaurant_name) {
      const allRestaurants = await getAllActiveRestaurants();
      const restaurantList = allRestaurants.map(r => r.restaurant_name).join(', ');

      return res.status(200).json({
        success: false,
        restaurant_identified: false,
        needs_restaurant_name: true,
        message: `Which restaurant would you like to make a reservation at? Available restaurants: ${restaurantList || 'Please contact support to configure restaurants.'}`,
        available_restaurants: allRestaurants.map(r => r.restaurant_name)
      });
    }

    // Try to match the restaurant name
    const matchResult = await getRestaurantByName(restaurant_name);

    // High confidence match (exact or very similar)
    if (matchResult.match && matchResult.confidence >= 0.8) {
      // Set the session restaurant
      const updatedSession = await setSessionRestaurant(session.id, matchResult.match.id);

      console.log(`[ElevenLabs] Restaurant identified: ${matchResult.match.restaurant_name} (confidence: ${matchResult.confidence})`);

      return res.status(200).json({
        success: true,
        restaurant_identified: true,
        restaurant_name: matchResult.match.restaurant_name,
        restaurant_id: matchResult.match.id,
        confidence: matchResult.confidence,
        message: `Great! I'll help you with your reservation at ${matchResult.match.restaurant_name}. What date and time would you like to book?`
      });
    }

    // Medium confidence - confirm with user
    if (matchResult.match && matchResult.confidence >= 0.5) {
      return res.status(200).json({
        success: false,
        restaurant_identified: false,
        needs_confirmation: true,
        suggested_restaurant: matchResult.match.restaurant_name,
        confidence: matchResult.confidence,
        message: `Did you mean ${matchResult.match.restaurant_name}? Please confirm or tell me the correct restaurant name.`
      });
    }

    // Multiple possible matches - ask user to choose
    if (matchResult.needsDisambiguation && matchResult.matches) {
      const options = matchResult.matches.map(m => m.restaurant_name).slice(0, 5);

      return res.status(200).json({
        success: false,
        restaurant_identified: false,
        needs_clarification: true,
        possible_matches: options,
        message: `I found several restaurants matching "${restaurant_name}": ${options.join(', ')}. Which one did you mean?`
      });
    }

    // No match found
    const allRestaurants = await getAllActiveRestaurants();
    const restaurantList = allRestaurants.map(r => r.restaurant_name).slice(0, 10).join(', ');

    return res.status(200).json({
      success: false,
      restaurant_identified: false,
      not_found: true,
      message: `I couldn't find a restaurant called "${restaurant_name}". Available restaurants: ${restaurantList || 'No restaurants configured.'}`,
      available_restaurants: allRestaurants.map(r => r.restaurant_name)
    });

  } catch (error) {
    console.error('[ElevenLabs] identify_restaurant error:', error);
    return res.status(200).json({
      success: false,
      error: true,
      message: 'Unable to identify restaurant at this time. Please try again or call us directly.'
    });
  }
}
