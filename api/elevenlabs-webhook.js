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

const crypto = require('crypto');
const { getRestaurantByPhone, getRestaurantById, getRestaurantByAgentId } = require('./_lib/restaurant-loader');
const conversationLogger = require('./services/conversationLogger');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');
const { trackUsage } = require('./_lib/usage-tracking');

// Multi-tenant imports for WhatsApp routing (session lookup in main routing logic)
const { getRestaurantClient } = require('./_lib/multi-tenant-supabase');
const { supabaseAdmin } = require('./_lib/supabase');
const { getSessionByPhone } = require('./_lib/whatsapp-sessions');
const { createSecureLogger } = require('./_lib/secure-logger');
const { sendConfirmationVoiceNote } = require('./services/whatsapp/voice-note-trigger');

const logger = createSecureLogger('ElevenLabs');

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

  // Verify request authenticity via one of:
  // 1. ElevenLabs HMAC signature (conversation events)
  // 2. Bearer token matching CRON_SECRET (tool calls from ElevenLabs agents)
  const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const signature = req.headers['x-elevenlabs-signature'];
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();

  let authenticated = false;

  // Path 1: HMAC signature (standard ElevenLabs webhooks)
  if (signature && webhookSecret) {
    try {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSig);
      if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        authenticated = true;
      }
    } catch (sigError) {
      logger.warn('HMAC signature verification failed:', sigError.message);
    }
  }

  // Path 2: Bearer token (ElevenLabs agent tool calls)
  if (!authenticated && authHeader && cronSecret && authHeader === cronSecret) {
    authenticated = true;
  }

  // Path 3 REMOVED (SEC-CRIT-01): Previously allowed unauthenticated access
  // via restaurant_id + action query params. ElevenLabs agents must use
  // HMAC signature (Path 1) or Bearer token (Path 2) instead.

  if (!authenticated) {
    logger.error('Webhook auth failed — no valid signature or token');
    return res.status(403).json({ error: 'Authentication failed' });
  }

  // Log incoming request for debugging
  logger.info(' Incoming request:', {
    method: req.method,
    url: req.url,
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
      'get_wait_time',
      'get_customer_info'
    ];

    // SEC-CRIT-02: get_customer_info moved to actionsRequiringRestaurant
    // to prevent cross-tenant data leaks

    // Actions that handle their own restaurant identification (multi-tenant mode)
    const multiTenantActions = ['identify_restaurant'];

    let restaurant = null;

    // Only look up restaurant if action requires it
    if (action && actionsRequiringRestaurant.includes(action)) {
      // Try multiple methods to identify which restaurant is being called
      const calledNumber = req.headers['x-called-number'] || req.query.phone || req.body?.phone;
      const restaurantId = req.query.restaurant_id || req.body?.restaurant_id;
      const agentId = req.headers['x-agent-id'] || req.query.agent_id || req.body?.agent_id;
      const senderPhone = req.headers['x-caller-number'] || req.body?.sender_phone || req.body?.caller_phone;

      // Method 0: Multi-tenant session lookup (for WhatsApp)
      if (MULTI_TENANT_MODE && senderPhone) {
        try {
          logger.debug(`Multi-tenant mode: Checking session for ${senderPhone}`);
          const session = await getSessionByPhone(senderPhone);

          if (session && session.restaurant_confirmed && session.restaurant) {
            logger.info(`Found session with restaurant: ${session.restaurant.restaurant_name}`);
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
          logger.error(`Multi-tenant session lookup error:`, { message: error.message });
        }
      }

      // Method 1: Look up by phone number (preferred - single-tenant mode)
      if (!restaurant && calledNumber) {
        try {
          logger.debug(`Looking up restaurant by phone: ${calledNumber}`);
          restaurant = await getRestaurantByPhone(calledNumber);
          logger.info(`Loaded restaurant: ${restaurant.name} (${restaurant.language})`);
        } catch (error) {
          logger.warn(`Restaurant not found for phone ${calledNumber}:`, { message: error.message });
        }
      }

      // Method 2: Look up by ElevenLabs agent ID (per-restaurant agents)
      if (!restaurant && agentId) {
        try {
          logger.debug(`Looking up restaurant by agent_id: ${agentId}`);
          restaurant = await getRestaurantByAgentId(agentId);
          logger.info(`Loaded restaurant by agent_id: ${restaurant.name}`);
        } catch (error) {
          logger.warn(`Restaurant not found for agent_id ${agentId}:`, { message: error.message });
        }
      }

      // Method 3: Look up by restaurant ID (fallback)
      if (!restaurant && restaurantId) {
        try {
          logger.debug(`Looking up restaurant by ID: ${restaurantId}`);
          restaurant = await getRestaurantById(restaurantId);
          logger.info(`Loaded restaurant: ${restaurant.name}`);
        } catch (error) {
          logger.warn(`Restaurant not found for ID ${restaurantId}:`, { message: error.message });
        }
      }

      // If no restaurant found, check if we should ask user in multi-tenant mode
      if (!restaurant) {
        if (MULTI_TENANT_MODE) {
          logger.info(' Multi-tenant mode: No restaurant in session - ask user to identify');
          return res.status(200).json({
            success: false,
            error: 'No restaurant selected',
            message: 'Please tell me which restaurant you would like to make a reservation at.',
            requires_restaurant_identification: true
          });
        } else {
          logger.info(' ⚠️ No restaurant identified - please provide phone number or restaurant_id');
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

      // Update conversation log with restaurant_info_id if we have both
      if (conversationId && restaurant && restaurant.id) {
        await conversationLogger.updateConversation(conversationId, {
          restaurant_info_id: restaurant.id
        }).catch(err => logger.warn('Failed to update conversation with restaurant_id:', { message: err.message }));
      }
    }

    if (!action) {
      logger.info(' No action specified');
      const availableActions = [
        'check_availability',
        'create_reservation',
        'lookup_reservation',
        'modify_reservation',
        'cancel_reservation',
        'get_wait_time',
        'get_current_datetime',
        'get_customer_info'
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

    logger.info(`Processing action: ${action}`);

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

      case 'get_customer_info':
        return await handleGetCustomerInfo(req, res);

      default:
        logger.warn(`Unknown action: ${action}`);
        const defaultAvailableActions = [
          'check_availability',
          'create_reservation',
          'lookup_reservation',
          'modify_reservation',
          'cancel_reservation',
          'get_wait_time',
          'get_current_datetime',
          'get_customer_info'
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
    logger.error(' Unhandled error:', error);
    // ALWAYS return valid JSON, even on error
    return res.status(200).json({
      success: false,
      error: true,
      message: 'An error occurred processing your request. Please try again or call us directly.',
      error_details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Handler functions - delegate business logic to shared tool-handlers module
const toolHandlers = require('./_lib/tool-handlers');

async function handleGetDateTime(req, res) {
  const timezone = req.multiTenantRestaurant?.timezone || req.query.timezone || req.body?.timezone || 'America/Sao_Paulo';
  const response = toolHandlers.getDateTime(timezone);
  logger.info(' get_current_datetime response:', response);
  return res.status(200).json(response);
}

async function handleCheckAvailability(req, res) {
  const conversationId = req.conversation_id;
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

  // Get restaurant from session, request, body, or query string restaurant_id (voice agent)
  // ElevenLabs webhook tools put fixed params (restaurant_id) in the query string even for POST
  const restaurantIdFromQuery = req.query.restaurant_id || req.query.restaurantId;
  let restaurant = req.restaurant || {};
  if (!restaurant.id && (data.restaurant_id || restaurantIdFromQuery)) {
    restaurant = { id: data.restaurant_id || restaurantIdFromQuery };
  }
  const result = await toolHandlers.checkAvailability(restaurant.id, restaurant, { date, time, party_size });
  logger.info(' check_availability response:', result);
  return res.status(200).json(result);
}

async function handleCreateReservation(req, res) {
  const conversationId = req.conversation_id;
  const startTime = Date.now();

  const data = req.method === 'POST' ? req.body : req.query;
  // Accept both "phone" (voice agent) and "customer_phone" (WhatsApp) field names
  const { date, time, party_size, customer_name, customer_email, special_requests } = data;
  const customer_phone = data.customer_phone || data.phone;

  // Get restaurant from session, request, body, or query string restaurant_id (voice agent)
  const _createRestaurantIdFromQuery = req.query.restaurant_id || req.query.restaurantId;
  let restaurant = req.multiTenantRestaurant || req.restaurant || {};
  if (!restaurant.id && (data.restaurant_id || _createRestaurantIdFromQuery)) {
    restaurant = { id: data.restaurant_id || _createRestaurantIdFromQuery, restaurant_name: 'the restaurant' };
  }
  const restaurantName = restaurant.restaurant_name || restaurant.name || 'the restaurant';

  // Log tool call start
  if (conversationId) {
    await conversationLogger.logToolCall(conversationId, {
      tool_name: 'create_reservation',
      parameters: { ...data, restaurant_name: restaurantName },
      success: null,
      timestamp: new Date().toISOString()
    });
  }

  // Pre-execution validation (Observer pattern — catch errors before they hit the DB)
  const partyNum = parseInt(party_size, 10);
  if (partyNum > 20 || partyNum < 1 || isNaN(partyNum)) {
    const msg = `Party size ${party_size} is not valid. Please ask the customer to confirm the number of guests (1-20).`;
    logger.warn(`[Interceptor] Blocked create_reservation: invalid party_size=${party_size}`);
    return res.status(200).json({ success: false, error: msg, message: msg });
  }

  if (!date || !time) {
    const msg = 'Please confirm the date and time before creating a reservation.';
    logger.warn('[Interceptor] Blocked create_reservation: missing date or time');
    return res.status(200).json({ success: false, error: msg, message: msg });
  }

  try {
    const result = await toolHandlers.createReservation(restaurant.id || restaurant.id, restaurant, {
      date, time, party_size, customer_name, customer_phone, customer_email, special_requests
    });

    const duration = Math.floor((Date.now() - startTime) / 1000);

    if (result.success && result.reservation_id) {
      // Log success
      if (conversationId) {
        await conversationLogger.logToolCall(conversationId, {
          tool_name: 'create_reservation',
          parameters: { ...data, restaurant_name: restaurantName },
          success: true,
          result: { reservation_id: result.reservation_id }
        });

        await conversationLogger.endConversation(conversationId, {
          outcome: 'reservation_created',
          reservation_id: result.reservation_id,
          restaurant_name: restaurantName,
          customer_name,
          party_size,
          requested_date: date,
          requested_time: time,
          successful_booking: true,
          duration_seconds: duration,
          summary: `Reservation at ${restaurantName} for ${customer_name}, party of ${party_size} on ${date} at ${time}`
        });

        // Track AI call usage for metered billing
        if (restaurant?.id) {
          trackUsage(restaurant.id, 'ai_call_completed');
        }
      }

      // Fire-and-forget: send confirmations to customer via all channels
      if (customer_phone && restaurant?.id) {
        const confirmDetails = {
          reservationId: result.reservation_id,
          customerName: customer_name,
          customerPhone: customer_phone,
          customerEmail: customer_email,
          partySize: party_size,
          date,
          time,
          restaurantName,
        };

        // 1. WhatsApp template confirmation
        const { isWhatsAppConfigured, sendReservationConfirmation } = require('./_lib/whatsapp-sender');
        if (isWhatsAppConfigured()) {
          sendReservationConfirmation(customer_phone, confirmDetails)
            .catch(err => logger.warn('WhatsApp confirmation failed (non-blocking)', { error: err.message }));
        }

        // 2. Email confirmation
        const { sendReservationConfirmationEmail } = require('./_lib/email');
        if (customer_email) {
          sendReservationConfirmationEmail(customer_email, confirmDetails)
            .catch(err => logger.warn('Email confirmation failed (non-blocking)', { error: err.message }));
        }

        // 3. Voice note confirmation (legacy)
        sendConfirmationVoiceNote({
          restaurantId: restaurant.id,
          customerPhone: customer_phone,
          customerName: customer_name,
          partySize: party_size,
          date,
          time,
          restaurantName,
          voiceId: restaurant.voice_id,
          language: restaurant.language,
        }).catch(err => logger.warn('Voice note confirmation failed (non-blocking)', { error: err.message }));
      }
    } else {
      // Log failure
      if (conversationId) {
        await conversationLogger.logToolCall(conversationId, {
          tool_name: 'create_reservation',
          parameters: data,
          success: false,
          error_message: result.message
        });
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error('CreateReservation Error:', error);
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
  const conversationId = req.conversation_id;
  const data = req.method === 'POST' ? req.body : req.query;
  // Accept both "name" and "customer_name" field names
  const { phone, reservation_id } = data;
  const name = data.name || data.customer_name;
  // Get restaurant from session, request, body, or query string restaurant_id (voice agent)
  const _qRid = req.query.restaurant_id || req.query.restaurantId;
  let restaurant = req.restaurant || {};
  if (!restaurant.id && (data.restaurant_id || _qRid)) {
    restaurant = { id: data.restaurant_id || _qRid };
  }

  // Log tool call
  if (conversationId) {
    await conversationLogger.logToolCall(conversationId, {
      tool_name: 'lookup_reservation',
      parameters: { phone, name, reservation_id },
      success: null
    });
  }

  const result = await toolHandlers.lookupReservation(restaurant.id, { phone, name, reservation_id });

  // Log result
  if (conversationId) {
    await conversationLogger.logToolCall(conversationId, {
      tool_name: 'lookup_reservation',
      parameters: { phone, name, reservation_id },
      success: result.success,
      result: result.found ? { found: true, reservation_id: result.reservations?.[0]?.reservation_id } : { found: false }
    });
  }

  return res.status(200).json(result);
}

async function handleModifyReservation(req, res) {
  const data = req.method === 'POST' ? req.body : req.query;
  const { reservation_id, new_date, new_time, new_party_size } = data;
  let restaurant = req.restaurant || {};
  if (!restaurant.id && data.restaurant_id) {
    restaurant = { id: data.restaurant_id };
  }

  // Also support date/time/party_size (without new_ prefix) for backwards compatibility
  const result = await toolHandlers.modifyReservation(restaurant.id, {
    reservation_id,
    new_date: new_date || data.date,
    new_time: new_time || data.time,
    new_party_size: new_party_size || data.party_size
  });

  return res.status(200).json(result);
}

async function handleCancelReservation(req, res) {
  const data = req.method === 'POST' ? req.body : req.query;
  const reservation_id = data.reservation_id || data.id;
  let restaurant = req.restaurant || {};
  if (!restaurant.id && data.restaurant_id) {
    restaurant = { id: data.restaurant_id };
  }

  const result = await toolHandlers.cancelReservation(restaurant.id, { reservation_id });
  return res.status(200).json(result);
}

async function handleGetWaitTime(req, res) {
  const restaurant = req.restaurant;
  const result = await toolHandlers.getWaitTime(restaurant.id);
  return res.status(200).json(result);
}

/**
 * Handle customer info lookup by phone number.
 * Scoped to the current restaurant to prevent cross-tenant data leaks (SEC-CRIT-02).
 */
async function handleGetCustomerInfo(req, res) {
  const restaurant = req.restaurant;
  const data = req.method === 'POST' ? req.body : req.query;
  const phone = data.phone;

  if (!phone) {
    return res.status(200).json({ known: false, message: 'No phone provided' });
  }

  try {
    // Normalize: strip whitespace, dashes, parens, plus sign
    const stripped = phone.replace(/[\s\-\(\)\+]/g, '');
    const variants = [
      phone,
      stripped,
      '+' + stripped,
      '+55' + stripped,
      stripped.slice(-11),
      stripped.slice(-10),
    ].filter(Boolean);

    // Deduplicate variants
    const uniqueVariants = [...new Set(variants)];

    let reservations = [];
    for (const variant of uniqueVariants) {
      const { data: rows } = await supabaseAdmin
        .from('reservations')
        .select('customer_name, customer_phone, date, time, status')
        .eq('restaurant_id', restaurant.id)
        .eq('customer_phone', variant)
        .order('date', { ascending: false })
        .limit(5);

      if (rows && rows.length > 0) {
        reservations = rows;
        break;
      }
    }

    if (reservations.length === 0) {
      logger.info('get_customer_info: No reservations found for phone', { phone });
      return res.status(200).json({ known: false });
    }

    const name = reservations[0].customer_name;
    const result = {
      known: true,
      customer_name: name,
      phone,
      reservation_count: reservations.length,
      recent_reservations: reservations.slice(0, 3).map(r => ({
        date: r.date,
        time: r.time,
        status: r.status
      }))
    };

    logger.info('get_customer_info: Customer found', { name, count: reservations.length });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('get_customer_info error:', error);
    return res.status(200).json({ known: false, message: 'Error looking up customer' });
  }
}

/**
 * Handle restaurant identification for multi-tenant WhatsApp routing
 * This action is called first to identify which restaurant the customer wants to book at
 */
async function handleIdentifyRestaurant(req, res) {
  const data = req.method === 'POST' ? req.body : req.query;
  const { restaurant_name, sender_phone, conversation_id } = data;

  // Voice agent tool calls don't have sender_phone or conversation_id
  // Fall back to direct DB search without session management
  if (!sender_phone && !conversation_id) {
    try {
      if (!restaurant_name) {
        return res.status(200).json({ success: false, error: 'Missing restaurant_name' });
      }
      // Direct fuzzy search on restaurant_config (main DB)
      const searchName = restaurant_name.trim().toLowerCase();
      const { data: restaurants } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, restaurant_name')
        .eq('is_active', true)
        .eq('onboarding_completed', true);

      // Fuzzy match with STT-aware scoring
      let bestMatch = null;
      let bestScore = 0;

      if (restaurants) {
        // Strip accents, spaces, punctuation, & for comparison
        const strip = (s) => {
          let r = '';
          for (const c of (s || '').toLowerCase()) {
            if (c >= 'a' && c <= 'z') r += c;
            else if (c >= '0' && c <= '9') r += c;
          }
          return r;
        };
        const sStrip = strip(searchName);

        for (const r of restaurants) {
          const rName = (r.restaurant_name || '').toLowerCase();
          const rStrip = strip(r.restaurant_name);
          let score = 0;

          // Exact
          if (rStrip === sStrip) { score = 100; }
          // Contains
          else if (rStrip.includes(sStrip) || sStrip.includes(rStrip)) { score = 85; }
          else {
            // Count matching characters in order (LCS-like)
            let j = 0;
            let matched = 0;
            for (const c of sStrip) {
              const idx = rStrip.indexOf(c, j);
              if (idx >= 0) { matched++; j = idx + 1; }
            }
            const sim = matched / Math.max(sStrip.length, rStrip.length);
            if (sim > 0.65) { score = Math.round(sim * 80); }
          }

          // Word overlap fallback
          if (score === 0) {
            const words = searchName.toLowerCase().split(/[\s&,]+/);
            for (const w of words) {
              if (w.length > 3 && rName.includes(w)) { score = 45; break; }
            }
          }

          if (score > bestScore) { bestScore = score; bestMatch = r; }
        }
        if (bestScore < 40) bestMatch = null;
        logger.info('Restaurant search:', { query: searchName, match: bestMatch?.restaurant_name, score: bestScore });
      }
      if (bestMatch) {
        return res.status(200).json({
          success: true,
          restaurant_identified: true,
          restaurant_name: bestMatch.restaurant_name,
          restaurant_id: bestMatch.id,
          message: `Found ${bestMatch.restaurant_name}. You can now check availability and make reservations.`
        });
      }
      return res.status(200).json({
        success: true,
        restaurant_identified: false,
        message: `No restaurant matching "${restaurant_name}" found in Seatable.`
      });
    } catch (err) {
      logger.error('Direct restaurant lookup error:', err.message);
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  const result = await toolHandlers.identifyRestaurant(restaurant_name, sender_phone, conversation_id);
  return res.status(200).json(result);
}
