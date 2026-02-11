/**
 * Meta WhatsApp Cloud API Webhook
 *
 * Custom WhatsApp AI agent for restaurant reservations.
 * Receives messages from Meta's WhatsApp Business Platform and responds using AI.
 *
 * Webhook URL: https://restaurant-ai-mcp.vercel.app/api/whatsapp-webhook
 *
 * Required environment variables:
 * - WHATSAPP_VERIFY_TOKEN: Token for webhook verification
 * - WHATSAPP_ACCESS_TOKEN: Meta Graph API access token
 * - WHATSAPP_PHONE_NUMBER_ID: Phone number ID from Meta Business
 * - OPENROUTER_API_KEY or MOONSHOT_API_KEY: AI provider API key
 */

const crypto = require('crypto');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const {
  getOrCreateSession,
  setSessionRestaurant,
  getSessionByPhone,
  normalizePhoneNumber,
  updateSessionConversationHistory
} = require('./_lib/whatsapp-sessions');
const { getRestaurantByName, getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { getMultiTenantClient } = require('./_lib/multi-tenant-supabase');
const { canAccommodateParty } = require('./_lib/supabase');

// AI provider configuration - supports any OpenAI-compatible API
const AI_CONFIG = {
  apiKey: process.env.OPENROUTER_API_KEY || process.env.MOONSHOT_API_KEY,
  baseUrl: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
  model: process.env.AI_MODEL || 'moonshotai/kimi-k2.5',
};

// WhatsApp API base URL
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

// In-memory message deduplication (prevents Meta retry from reprocessing)
// Map<messageId, timestamp> - entries auto-expire after 5 minutes
const processedMessages = new Map();
function cleanupProcessedMessages() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of processedMessages) {
    if (ts < fiveMinutesAgo) processedMessages.delete(id);
  }
}
// Clean up every 2 minutes
setInterval(cleanupProcessedMessages, 2 * 60 * 1000);

/**
 * Send a WhatsApp message via Meta Cloud API
 */
async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error(' Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: message }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(' Send error:', data);
      return { success: false, error: data.error?.message || 'Failed to send' };
    }

    logger.info(` Message sent to ${to}: ${message.substring(0, 50)}...`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error(' Send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp template message via Meta Cloud API
 * Used for business-initiated messages (outside 24-hour window)
 * Templates must be pre-approved in Meta Business Manager
 *
 * @param {string} to - Recipient phone number
 * @param {string} templateName - Name of approved template (e.g., 'reservation_confirmed')
 * @param {string} languageCode - Template language (e.g., 'en', 'es')
 * @param {Array} bodyParameters - Array of strings for {{1}}, {{2}}, etc. placeholders
 * @returns {object} Result with success status
 */
async function sendTemplateMessage(to, templateName, languageCode = 'en', bodyParameters = []) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error(' Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    // Build template components
    const components = [];

    if (bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParameters.map(param => ({
          type: 'text',
          text: String(param)
        }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components
      }
    };

    logger.info(` Sending template '${templateName}' to ${to}:`, JSON.stringify(payload, null, 2));

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(' Template send error:', data);
      return { success: false, error: data.error?.message || 'Failed to send template' };
    }

    logger.info(` Template '${templateName}' sent to ${to}, messageId: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error(' Template send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current date/time in restaurant timezone
 */
function getCurrentDateTime(language = 'en') {
  const now = new Date();
  const localeMap = { en: 'en-US', es: 'es-ES', pt: 'pt-BR' };
  const locale = localeMap[language] || 'en-US';
  return {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0].substring(0, 5),
    dayOfWeek: now.toLocaleDateString(locale, { weekday: 'long' }),
    formatted: now.toLocaleString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  };
}

/**
 * Define tools in OpenAI function-calling format
 */
const RESERVATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'identify_restaurant',
      description: 'Identify which restaurant the customer wants to book at. Use this first to determine the restaurant.',
      parameters: {
        type: 'object',
        properties: {
          restaurant_name: {
            type: 'string',
            description: 'The name of the restaurant the customer mentioned'
          }
        },
        required: ['restaurant_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check if a specific date, time, and party size is available for reservation',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format'
          },
          time: {
            type: 'string',
            description: 'Time in HH:MM format (24-hour)'
          },
          party_size: {
            type: 'integer',
            description: 'Number of guests'
          }
        },
        required: ['date', 'time', 'party_size']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_reservation',
      description: 'Create a new reservation after confirming all details with the customer',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format'
          },
          time: {
            type: 'string',
            description: 'Time in HH:MM format (24-hour)'
          },
          party_size: {
            type: 'integer',
            description: 'Number of guests'
          },
          customer_name: {
            type: 'string',
            description: 'Full name of the customer'
          },
          customer_phone: {
            type: 'string',
            description: 'Phone number of the customer'
          },
          special_requests: {
            type: 'string',
            description: 'Any special requests or notes'
          }
        },
        required: ['date', 'time', 'party_size', 'customer_name', 'customer_phone']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description: 'Get the current date and time. Use this when the customer says "today", "tomorrow", or needs to know current time.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

/**
 * Execute a tool call
 */
async function executeTool(toolName, toolInput, session) {
  logger.info(` Executing tool: ${toolName}`, toolInput);

  switch (toolName) {
    case 'identify_restaurant': {
      const result = await getRestaurantByName(toolInput.restaurant_name);

      if (result.match && result.confidence >= 0.6) {
        // Update session with restaurant
        if (session?.id) {
          await setSessionRestaurant(session.id, result.match.id);
        }

        return {
          success: true,
          found: true,
          restaurant: {
            id: result.match.id,
            name: result.match.restaurant_name,
            language: result.match.language || 'en'
          },
          confidence: result.confidence
        };
      }

      // Return available restaurants if not found
      const restaurants = await getAllActiveRestaurants();
      return {
        success: true,
        found: false,
        message: `Could not find "${toolInput.restaurant_name}"`,
        available_restaurants: restaurants.slice(0, 5).map(r => ({
          name: r.restaurant_name,
          id: r.id
        }))
      };
    }

    case 'check_availability': {
      // Need restaurant context from session
      if (!session?.restaurant) {
        return {
          success: false,
          error: 'No restaurant selected. Please identify the restaurant first.'
        };
      }

      try {
        // Call the multi-tenant availability check - pass full restaurant object
        const client = getMultiTenantClient(session.restaurant);
        if (!client) {
          return { success: false, error: 'Could not connect to restaurant database' };
        }

        const { date, time, party_size } = toolInput;

        // Get reservations for that date/time
        const { data: reservations, error } = await client
          .from('reservations')
          .select('*')
          .eq('date', date)
          .in('status', ['confirmed', 'seated']);

        if (error) {
          logger.error(' Availability check error:', error);
          return { success: false, error: 'Could not check availability' };
        }

        // Check if party can be accommodated using table-aware logic
        // This respects is_fixed flag and adjacent_tables configuration
        const accommodationResult = await canAccommodateParty(party_size);

        if (!accommodationResult.success) {
          return { success: false, error: 'Could not check table availability' };
        }

        // Check for time conflicts with existing reservations
        const bookedAtTime = reservations?.filter(r => r.time === time) || [];
        const bookedSeats = bookedAtTime.reduce((sum, r) => sum + (r.party_size || 0), 0);

        // Get total capacity to check overall availability
        const { data: allTables } = await client
          .from('tables')
          .select('capacity')
          .eq('is_active', true);
        const totalCapacity = allTables?.reduce((sum, t) => sum + t.capacity, 0) || 30;
        const remainingCapacity = totalCapacity - bookedSeats;

        // Both conditions must be met:
        // 1. Tables can physically accommodate the party (proper combinations)
        // 2. There's enough remaining capacity at the requested time
        const canFit = accommodationResult.can_accommodate && remainingCapacity >= party_size;

        // Build response message with table info
        let message;
        if (canFit) {
          if (accommodationResult.method === 'combination') {
            message = `Yes, we have availability for ${party_size} guests on ${date} at ${time}. We can seat you at Tables ${accommodationResult.tables.join(' + ')} (${accommodationResult.total_capacity} seats combined).`;
          } else {
            message = `Yes, we have availability for ${party_size} guests on ${date} at ${time}. We have a table that seats ${accommodationResult.total_capacity}.`;
          }
        } else if (!accommodationResult.can_accommodate) {
          message = `Sorry, we cannot accommodate a party of ${party_size} guests. ${accommodationResult.reason || 'Our largest available seating option is smaller.'}`;
        } else {
          message = `Sorry, ${time} is fully booked for ${party_size} guests. We don't have enough available capacity at that time.`;
        }

        return {
          success: true,
          available: canFit,
          message,
          details: {
            requested_date: date,
            requested_time: time,
            party_size,
            can_physically_accommodate: accommodationResult.can_accommodate,
            seating_method: accommodationResult.method,
            assigned_tables: accommodationResult.tables,
            table_capacity: accommodationResult.total_capacity,
            remaining_capacity_at_time: remainingCapacity
          }
        };
      } catch (err) {
        logger.error(' Availability error:', err);
        return { success: false, error: 'Error checking availability' };
      }
    }

    case 'create_reservation': {
      if (!session?.restaurant) {
        return {
          success: false,
          error: 'No restaurant selected. Please identify the restaurant first.'
        };
      }

      try {
        // Pass full restaurant object with credentials
        const client = getMultiTenantClient(session.restaurant);
        if (!client) {
          return { success: false, error: 'Could not connect to restaurant database' };
        }

        const { date, time, party_size, customer_name, customer_phone, special_requests } = toolInput;

        // Generate reservation ID
        const reservationId = `RES-${date.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

        const { data, error } = await client
          .from('reservations')
          .insert({
            reservation_id: reservationId,
            date,
            time,
            party_size,
            customer_name,
            customer_phone,
            special_requests: special_requests || '',
            status: 'confirmed',
            source: 'whatsapp_ai',
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          logger.error(' Create reservation error:', error);
          return { success: false, error: 'Could not create reservation' };
        }

        // Send template confirmation message
        // This provides formal confirmation and works outside the 24-hour window
        // Template 'reservation_confirmed' must be approved in Meta Business Manager
        const formattedDate = new Date(date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const formattedTime = new Date(`2000-01-01 ${time}`).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        const templateResult = await sendTemplateMessage(
          customer_phone,
          'reservation_confirmed',
          'en',
          [
            customer_name,
            session.restaurant.restaurant_name,
            formattedDate,
            formattedTime,
            party_size.toString()
          ]
        );
        logger.info(' Template confirmation result:', templateResult);

        return {
          success: true,
          message: `Reservation confirmed!`,
          reservation: {
            id: reservationId,
            restaurant: session.restaurant.restaurant_name,
            date,
            time,
            party_size,
            customer_name
          },
          // Include phone for potential template use
          customer_phone: customer_phone
        };
      } catch (err) {
        logger.error(' Create error:', err);
        return { success: false, error: 'Error creating reservation' };
      }
    }

    case 'get_current_datetime': {
      return getCurrentDateTime();
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Call the OpenAI-compatible chat completions endpoint
 */
async function callChatCompletions(messages, tools) {
  // 30-second timeout to avoid Vercel function timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    logger.info(` AI call: model=${AI_CONFIG.model}, baseUrl=${AI_CONFIG.baseUrl}, keySet=${!!AI_CONFIG.apiKey}`);

    const response = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        max_tokens: 1024,
        messages,
        tools,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AI API error ${response.status}: ${errorBody}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('AI API timeout after 30s');
    }
    throw error;
  }
}

/**
 * Process a message with AI (OpenAI-compatible API)
 */
async function processWithAI(userMessage, session, conversationHistory = []) {
  const language = session?.restaurant?.language || 'en';
  const currentDateTime = getCurrentDateTime(language);

  // Language instruction based on restaurant setting
  let languageInstruction = '';
  if (language === 'pt') {
    languageInstruction = '\nIMPORTANT: Always respond in Brazilian Portuguese (pt-BR). Use natural, friendly Brazilian Portuguese with "voce" form. Never switch to English unless the customer writes in English.\n';
  } else if (language === 'es') {
    languageInstruction = '\nIMPORTANT: Always respond in Spanish. Use the formal "usted" form. Never switch to English unless the customer writes in English.\n';
  }

  // Build system prompt
  let systemPrompt = `You are a friendly AI assistant helping customers make restaurant reservations via WhatsApp.
${languageInstruction}
Current date and time: ${currentDateTime.formatted}
Today is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}

`;

  if (session?.restaurant) {
    systemPrompt += `
The customer is booking at: ${session.restaurant.restaurant_name}
Restaurant ID: ${session.restaurant.id}

You can now help them check availability and make reservations.
`;
  } else {
    systemPrompt += `
The customer has not yet specified a restaurant.
First, ask them which restaurant they'd like to book at, or use the identify_restaurant tool if they mention one.
`;
  }

  systemPrompt += `
Guidelines:
- Be conversational and helpful
- When they mention "today", use ${currentDateTime.date}
- When they mention "tomorrow", calculate the next day
- Always confirm details before creating a reservation
- Keep responses concise for WhatsApp (under 500 characters when possible)
- If they give a time like "7pm", convert to 24-hour format (19:00)
`;

  // Build messages array with system prompt as first message
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  try {
    let data = await callChatCompletions(messages, RESERVATION_TOOLS);
    let choice = data.choices?.[0];

    // Handle tool use loop
    while (choice?.finish_reason === 'tool_calls') {
      const toolCalls = choice.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      // Append the assistant message (contains tool_calls)
      messages.push(choice.message);

      // Execute each tool and append results
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolInput = JSON.parse(toolCall.function.arguments);
        const toolResult = await executeTool(toolName, toolInput, session);

        // If restaurant was identified, update session reference
        if (toolName === 'identify_restaurant' && toolResult.found && toolResult.restaurant) {
          session = await getSessionByPhone(session?.sender_phone);
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Continue conversation
      data = await callChatCompletions(messages, RESERVATION_TOOLS);
      choice = data.choices?.[0];
    }

    // Extract text response
    return choice?.message?.content || 'I apologize, I had trouble processing that. Could you try again?';

  } catch (error) {
    logger.error(' AI error:', error);
    return 'I apologize, something went wrong. Please try again or contact the restaurant directly.';
  }
}

/**
 * Main webhook handler
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
    logger.info(' Verification request:', {
      mode,
      receivedToken: token?.substring(0, 10) + '...',
      expectedTokenSet: !!expectedToken,
      expectedTokenLength: expectedToken?.length,
      tokensMatch: token === expectedToken
    });

    if (mode === 'subscribe' && token === expectedToken) {
      logger.info(' Webhook verified successfully');
      return res.status(200).send(challenge);
    }

    logger.error(' Verification failed - mode:', mode, 'tokenMatch:', token === expectedToken);
    return res.status(403).json({ error: 'Verification failed' });
  }

  // Message handling (POST request from Meta)
  if (req.method === 'POST') {
    // Verify Meta webhook signature (X-Hub-Signature-256)
    const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'];
      if (!signature) {
        logger.error('Missing X-Hub-Signature-256 header');
        return res.status(403).json({ error: 'Missing signature' });
      }
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        logger.error('Invalid Meta webhook signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    try {
      const body = req.body;

      // Log incoming webhook (abbreviated to avoid log bloat)
      logger.info(' Webhook POST received, AI config:', {
        model: AI_CONFIG.model,
        baseUrl: AI_CONFIG.baseUrl,
        apiKeySet: !!AI_CONFIG.apiKey,
        apiKeyPrefix: AI_CONFIG.apiKey?.substring(0, 8) || 'NONE',
      });

      // Extract message data
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Debug: log what type of webhook event this is
      logger.info(' Webhook event type:', {
        hasEntry: !!entry,
        hasChanges: !!changes,
        field: changes?.field,
        hasMessages: !!value?.messages,
        hasStatuses: !!value?.statuses,
        messageCount: value?.messages?.length || 0,
      });

      // Check if this is a message event
      if (value?.messages) {
        const message = value.messages[0];
        const from = message.from; // Sender's WhatsApp number
        const messageType = message.type;
        const messageText = message.text?.body || '';

        logger.info(` Message from ${from}: ${messageText}`);

        // Only handle text messages for now
        if (messageType !== 'text') {
          await sendWhatsAppMessage(from, 'I can only process text messages at the moment. Please type your request.');
          return res.status(200).json({ status: 'ok' });
        }

        // Handle template response keywords (EN: MODIFY, CANCEL, CONFIRM, BOOK, HELP)
        // Also supports Portuguese (MODIFICAR, CANCELAR, CONFIRMAR, RESERVAR, AJUDA)
        // and Spanish (MODIFICAR, CANCELAR, CONFIRMAR, RESERVAR, AYUDA)
        const normalizedText = messageText.trim().toUpperCase();
        if (normalizedText === 'MODIFY' || normalizedText === 'MODIFICAR') {
          await sendWhatsAppMessage(from,
            normalizedText === 'MODIFICAR'
              ? 'Para modificar a sua reserva, por favor diga-me:\n' +
                '- O seu nome\n' +
                '- O que gostaria de alterar (data, hora ou numero de pessoas)\n\n' +
                'Por exemplo: "Sou o Joao Silva e gostaria de mudar a minha reserva para as 20h"'
              : 'To modify your reservation, please tell me:\n' +
                '- Your name\n' +
                '- What you\'d like to change (date, time, or party size)\n\n' +
                'For example: "I\'m John Smith and I\'d like to change my reservation to 8pm"'
          );
          return res.status(200).json({ status: 'ok' });
        }

        if (normalizedText === 'CANCEL' || normalizedText === 'CANCELAR') {
          await sendWhatsAppMessage(from,
            normalizedText === 'CANCELAR'
              ? 'Para cancelar a sua reserva, por favor confirme com:\n' +
                '- O seu nome\n' +
                '- A data da sua reserva\n\n' +
                'Por exemplo: "Por favor cancele a minha reserva. Sou o Joao Silva, reserva para 15 de Janeiro"'
              : 'To cancel your reservation, please confirm by providing:\n' +
                '- Your name\n' +
                '- The date of your reservation\n\n' +
                'For example: "Please cancel my reservation. I\'m John Smith, reservation was for January 15"'
          );
          return res.status(200).json({ status: 'ok' });
        }

        if (normalizedText === 'CONFIRM' || normalizedText === 'CONFIRMAR') {
          await sendWhatsAppMessage(from,
            normalizedText === 'CONFIRMAR'
              ? 'Otimo! A sua reserva foi confirmada. Esperamos ve-lo em breve!\n\n' +
                'Responda AJUDA se precisar de assistencia.'
              : 'Great! Your reservation has been confirmed. We look forward to seeing you!\n\n' +
                'Reply HELP if you need any assistance.'
          );
          return res.status(200).json({ status: 'ok' });
        }

        if (normalizedText === 'BOOK' || normalizedText === 'RESERVAR') {
          await sendWhatsAppMessage(from,
            normalizedText === 'RESERVAR'
              ? 'Terei todo o gosto em ajuda-lo a fazer uma nova reserva!\n\n' +
                'Por favor diga-me:\n' +
                '- Qual restaurante?\n' +
                '- Data e hora?\n' +
                '- Numero de pessoas?'
              : 'I\'d be happy to help you make a new reservation!\n\n' +
                'Please tell me:\n' +
                '- Which restaurant?\n' +
                '- Date and time?\n' +
                '- Number of guests?'
          );
          return res.status(200).json({ status: 'ok' });
        }

        if (normalizedText === 'HELP' || normalizedText === 'AJUDA' || normalizedText === 'AYUDA') {
          await sendWhatsAppMessage(from,
            (normalizedText === 'AJUDA')
              ? 'Posso ajuda-lo com:\n' +
                '- Fazer uma nova reserva\n' +
                '- Modificar uma reserva existente\n' +
                '- Cancelar uma reserva\n\n' +
                'Diga-me o que precisa!'
              : 'I can help you with:\n' +
                '- Making a new reservation\n' +
                '- Modifying an existing reservation\n' +
                '- Canceling a reservation\n\n' +
                'Just tell me what you need!'
          );
          return res.status(200).json({ status: 'ok' });
        }

        // Deduplicate: Meta retries on timeout, ignore messages we've already seen
        const messageId = message.id;
        if (messageId && processedMessages.has(messageId)) {
          logger.info(` Duplicate message ${messageId}, skipping`);
          return res.status(200).json({ status: 'ok' });
        }
        if (messageId) {
          processedMessages.set(messageId, Date.now());
        }

        // Get or create session for this phone number
        logger.info(' [STEP 1] Getting/creating session...');
        const sessionStart = Date.now();
        let session;
        try {
          session = await Promise.race([
            getOrCreateSession(from, `wa-${Date.now()}`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Session timeout after 8s')), 8000))
          ]);
        } catch (sessionErr) {
          logger.error(` [STEP 1] Session failed in ${Date.now() - sessionStart}ms:`, sessionErr.message);
          session = null;
        }
        logger.info(` [STEP 1] Session done in ${Date.now() - sessionStart}ms, session=${!!session}`);

        if (!session) {
          logger.error(' Failed to create session');
          await sendWhatsAppMessage(from, 'Sorry, I had trouble starting our conversation. Please try again.');
          return res.status(200).json({ status: 'ok' });
        }

        // Auto-assign restaurant if only one exists and session has no restaurant
        if (!session.restaurant) {
          try {
            logger.info(' [STEP 2] Getting active restaurants...');
            const restStart = Date.now();
            const activeRestaurants = await Promise.race([
              getAllActiveRestaurants(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Restaurant lookup timeout after 8s')), 8000))
            ]);
            logger.info(` [STEP 2] Restaurants done in ${Date.now() - restStart}ms, count=${activeRestaurants.length}`);
            if (activeRestaurants.length === 1) {
              logger.info(` Auto-assigning single restaurant: ${activeRestaurants[0].restaurant_name}`);
              const updated = await setSessionRestaurant(session.id, activeRestaurants[0].id);
              if (updated) {
                session = updated;
              }
            }
          } catch (autoErr) {
            logger.error(' Auto-assign error (non-fatal):', autoErr.message);
          }
        }

        // Load conversation history from session
        const conversationHistory = session.conversation_history || [];
        logger.info(` Loaded ${conversationHistory.length} history messages for session: ${session.id}`);

        // Process message with AI
        logger.info(' [STEP 3] Processing message with AI...');
        const aiStart = Date.now();
        let response;
        try {
          response = await processWithAI(messageText, session, conversationHistory);
          logger.info(` [STEP 3] AI done in ${Date.now() - aiStart}ms: ${response?.substring(0, 100)}...`);
        } catch (aiError) {
          logger.error(` [STEP 3] AI error after ${Date.now() - aiStart}ms:`, aiError);
          response = 'Sorry, I had trouble processing your message. Please try again.';
        }

        // Save updated conversation history (append user message + assistant response)
        try {
          const updatedHistory = [
            ...conversationHistory,
            { role: 'user', content: messageText },
            { role: 'assistant', content: response }
          ];
          await updateSessionConversationHistory(session.id, updatedHistory);
        } catch (historyErr) {
          logger.error(' Failed to save conversation history (non-fatal):', historyErr.message);
        }

        // Send response back via WhatsApp
        logger.info(` Sending response to ${from}`);
        const sendResult = await sendWhatsAppMessage(from, response);
        logger.info(` Send result:`, JSON.stringify(sendResult));

        return res.status(200).json({ status: 'ok' });
      }

      // Acknowledge other webhook events (status updates, etc.)
      return res.status(200).json({ status: 'ok' });

    } catch (error) {
      logger.error(' Webhook error:', error);
      return res.status(200).json({ status: 'error', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
