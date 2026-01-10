/**
 * Meta WhatsApp Cloud API Webhook
 *
 * Custom WhatsApp AI agent for restaurant reservations.
 * Receives messages from Meta's WhatsApp Business Platform and responds using Claude AI.
 *
 * Webhook URL: https://restaurant-ai-mcp.vercel.app/api/whatsapp-webhook
 *
 * Required environment variables:
 * - WHATSAPP_VERIFY_TOKEN: Token for webhook verification
 * - WHATSAPP_ACCESS_TOKEN: Meta Graph API access token
 * - WHATSAPP_PHONE_NUMBER_ID: Phone number ID from Meta Business
 * - ANTHROPIC_API_KEY: Claude AI API key
 */

const Anthropic = require('@anthropic-ai/sdk');
const {
  getOrCreateSession,
  setSessionRestaurant,
  getSessionByPhone,
  normalizePhoneNumber
} = require('./_lib/whatsapp-sessions');
const { getRestaurantByName, getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { getMultiTenantClient } = require('./_lib/multi-tenant-supabase');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// WhatsApp API base URL
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

/**
 * Send a WhatsApp message via Meta Cloud API
 */
async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('[WhatsApp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
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
      console.error('[WhatsApp] Send error:', data);
      return { success: false, error: data.error?.message || 'Failed to send' };
    }

    console.log(`[WhatsApp] Message sent to ${to}: ${message.substring(0, 50)}...`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error('[WhatsApp] Send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current date/time in restaurant timezone
 */
function getCurrentDateTime() {
  const now = new Date();
  return {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0].substring(0, 5),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    formatted: now.toLocaleString('en-US', {
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
 * Define tools for Claude to use
 */
const RESERVATION_TOOLS = [
  {
    name: 'identify_restaurant',
    description: 'Identify which restaurant the customer wants to book at. Use this first to determine the restaurant.',
    input_schema: {
      type: 'object',
      properties: {
        restaurant_name: {
          type: 'string',
          description: 'The name of the restaurant the customer mentioned'
        }
      },
      required: ['restaurant_name']
    }
  },
  {
    name: 'check_availability',
    description: 'Check if a specific date, time, and party size is available for reservation',
    input_schema: {
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
  },
  {
    name: 'create_reservation',
    description: 'Create a new reservation after confirming all details with the customer',
    input_schema: {
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
  },
  {
    name: 'get_current_datetime',
    description: 'Get the current date and time. Use this when the customer says "today", "tomorrow", or needs to know current time.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

/**
 * Execute a tool call
 */
async function executeTool(toolName, toolInput, session) {
  console.log(`[WhatsApp] Executing tool: ${toolName}`, toolInput);

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

        // Get reservations for that date
        const { data: reservations, error } = await client
          .from('reservations')
          .select('*')
          .eq('date', date)
          .in('status', ['confirmed', 'seated']);

        if (error) {
          console.error('[WhatsApp] Availability check error:', error);
          return { success: false, error: 'Could not check availability' };
        }

        // Get restaurant capacity
        const { data: tables } = await client
          .from('tables')
          .select('capacity, status')
          .eq('status', 'Available');

        const totalCapacity = tables?.reduce((sum, t) => sum + t.capacity, 0) || 40;

        // Simple availability check
        const bookedAtTime = reservations?.filter(r => r.time === time) || [];
        const bookedSeats = bookedAtTime.reduce((sum, r) => sum + (r.party_size || 0), 0);
        const available = (totalCapacity - bookedSeats) >= party_size;

        return {
          success: true,
          available,
          message: available
            ? `Yes, we have availability for ${party_size} guests on ${date} at ${time}`
            : `Sorry, ${time} is fully booked for ${party_size} guests`,
          details: {
            requested_date: date,
            requested_time: time,
            party_size,
            available_capacity: totalCapacity - bookedSeats
          }
        };
      } catch (err) {
        console.error('[WhatsApp] Availability error:', err);
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
          console.error('[WhatsApp] Create reservation error:', error);
          return { success: false, error: 'Could not create reservation' };
        }

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
          }
        };
      } catch (err) {
        console.error('[WhatsApp] Create error:', err);
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
 * Process a message with Claude AI
 */
async function processWithClaude(userMessage, session, conversationHistory = []) {
  const currentDateTime = getCurrentDateTime();

  // Build system prompt
  let systemPrompt = `You are a friendly AI assistant helping customers make restaurant reservations via WhatsApp.

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

  // Build messages array
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  try {
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: RESERVATION_TOOLS,
      messages
    });

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      // Get ALL tool_use blocks from the response
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

      if (toolUseBlocks.length === 0) break;

      // Execute ALL tools and collect results
      const toolResults = [];
      for (const toolUseBlock of toolUseBlocks) {
        const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input, session);

        // If restaurant was identified, update session reference
        if (toolUseBlock.name === 'identify_restaurant' && toolResult.found && toolResult.restaurant) {
          session = await getSessionByPhone(session?.sender_phone);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult)
        });
      }

      // Continue conversation with ALL tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: toolResults
      });

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools: RESERVATION_TOOLS,
        messages
      });
    }

    // Extract text response
    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.text || 'I apologize, I had trouble processing that. Could you try again?';

  } catch (error) {
    console.error('[WhatsApp] Claude error:', error);
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
    console.log('[WhatsApp] Verification request:', {
      mode,
      receivedToken: token?.substring(0, 10) + '...',
      expectedTokenSet: !!expectedToken,
      expectedTokenLength: expectedToken?.length,
      tokensMatch: token === expectedToken
    });

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[WhatsApp] Webhook verified successfully');
      return res.status(200).send(challenge);
    }

    console.error('[WhatsApp] Verification failed - mode:', mode, 'tokenMatch:', token === expectedToken);
    return res.status(403).json({ error: 'Verification failed' });
  }

  // Message handling (POST request from Meta)
  if (req.method === 'POST') {
    try {
      const body = req.body;

      // Log incoming webhook
      console.log('[WhatsApp] Webhook received:', JSON.stringify(body, null, 2));

      // Extract message data
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Check if this is a message event
      if (value?.messages) {
        const message = value.messages[0];
        const from = message.from; // Sender's WhatsApp number
        const messageType = message.type;
        const messageText = message.text?.body || '';

        console.log(`[WhatsApp] Message from ${from}: ${messageText}`);

        // Only handle text messages for now
        if (messageType !== 'text') {
          await sendWhatsAppMessage(from, 'I can only process text messages at the moment. Please type your request.');
          return res.status(200).json({ status: 'ok' });
        }

        // Get or create session for this phone number
        const session = await getOrCreateSession(from, `wa-${Date.now()}`);

        if (!session) {
          console.error('[WhatsApp] Failed to create session');
          await sendWhatsAppMessage(from, 'Sorry, I had trouble starting our conversation. Please try again.');
          return res.status(200).json({ status: 'ok' });
        }

        // Process message with Claude
        console.log(`[WhatsApp] Processing message with Claude for session: ${session.id}`);
        let response;
        try {
          response = await processWithClaude(messageText, session);
          console.log(`[WhatsApp] Claude response received: ${response?.substring(0, 100)}...`);
        } catch (claudeError) {
          console.error('[WhatsApp] Claude processing error:', claudeError);
          response = 'Sorry, I had trouble processing your message. Please try again.';
        }

        // Send response back via WhatsApp
        console.log(`[WhatsApp] Sending response to ${from}`);
        const sendResult = await sendWhatsAppMessage(from, response);
        console.log(`[WhatsApp] Send result:`, JSON.stringify(sendResult));

        return res.status(200).json({ status: 'ok' });
      }

      // Acknowledge other webhook events (status updates, etc.)
      return res.status(200).json({ status: 'ok' });

    } catch (error) {
      console.error('[WhatsApp] Webhook error:', error);
      return res.status(200).json({ status: 'error', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
