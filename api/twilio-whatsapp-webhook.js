/**
 * Twilio WhatsApp Webhook Handler
 *
 * Handles WhatsApp messages via Twilio's Messaging API.
 * This is an alternative to the direct Meta WhatsApp Cloud API.
 *
 * Webhook URL: https://restaurant-ai-mcp.vercel.app/api/twilio-whatsapp-webhook
 *
 * Required environment variables:
 * - TWILIO_ACCOUNT_SID: Twilio Account SID
 * - TWILIO_AUTH_TOKEN: Twilio Auth Token
 * - TWILIO_WHATSAPP_NUMBER: Your Twilio WhatsApp number (e.g., +14155238886)
 * - ANTHROPIC_API_KEY: Claude AI API key
 *
 * Twilio Console Setup:
 * 1. Go to Messaging > Senders > WhatsApp Senders
 * 2. Register your WhatsApp Business number
 * 3. Set webhook URL to this endpoint
 */

const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');
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

/**
 * Send a WhatsApp message via Twilio
 */
async function sendWhatsAppMessage(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !twilioWhatsAppNumber) {
    console.error('[Twilio] Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_NUMBER');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const client = twilio(accountSid, authToken);

    // Ensure WhatsApp prefix format
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:')
      ? twilioWhatsAppNumber
      : `whatsapp:${twilioWhatsAppNumber}`;

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber
    });

    console.log(`[Twilio] Message sent to ${to}: ${message.substring(0, 50)}...`);
    return { success: true, messageId: result.sid };
  } catch (error) {
    console.error('[Twilio] Send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp template message via Twilio
 * Note: Twilio uses Content Templates for this
 */
async function sendTemplateMessage(to, contentSid, contentVariables = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !twilioWhatsAppNumber) {
    console.error('[Twilio] Missing Twilio configuration');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const client = twilio(accountSid, authToken);

    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:')
      ? twilioWhatsAppNumber
      : `whatsapp:${twilioWhatsAppNumber}`;

    const result = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      contentSid: contentSid,
      contentVariables: JSON.stringify(contentVariables)
    });

    console.log(`[Twilio] Template sent to ${to}: ${contentSid}`);
    return { success: true, messageId: result.sid };
  } catch (error) {
    console.error('[Twilio] Template send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Build the Claude system prompt for restaurant reservation assistance
 * Updated to handle multi-restaurant platform
 */
function buildSystemPrompt(restaurantInfo, session, availableRestaurants = []) {
  const hasRestaurant = !!restaurantInfo || !!session?.restaurantId;
  const restaurantName = restaurantInfo?.restaurant_name || session?.restaurantId || null;

  // Get current time info
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });

  // Base prompt varies based on whether a restaurant is selected
  if (!hasRestaurant) {
    // No restaurant selected - guide user to choose one
    const restaurantList = availableRestaurants.length > 0
      ? availableRestaurants.map((r, i) => `${i + 1}. ${r.restaurant_name}`).join('\n')
      : 'No restaurants currently available';

    return `You are a friendly AI reservation assistant for Seatable, a restaurant reservation platform. You help customers make reservations at restaurants in our network.

CURRENT CONTEXT:
- Platform: Seatable
- Today's Date: ${currentDate} (${currentDay})
- Session ID: ${session?.id || 'new'}
- Customer Phone: ${session?.phoneNumber || 'unknown'}
- Restaurant Selected: NONE

AVAILABLE RESTAURANTS IN OUR NETWORK:
${restaurantList}

CRITICAL FIRST STEP:
Since no restaurant is selected yet, you MUST first help the user choose a restaurant before making any reservation.

If the user asks to make a reservation without specifying a restaurant:
1. Warmly greet them
2. Present the list of available restaurants
3. Ask which restaurant they'd like to book at

Once they choose, use the 'select_restaurant' tool to set it, then proceed with the reservation.

CONVERSATION STYLE:
- Be warm, professional, and concise
- Keep responses brief and WhatsApp-friendly
- Present restaurant options clearly numbered
- Guide users step by step

EXAMPLE RESPONSE when user wants to book without specifying restaurant:
"Hi! I'd be happy to help you make a reservation. 😊

We have the following restaurants available:
1. Restaurant Name 1
2. Restaurant Name 2

Which restaurant would you like to book at?"`;
  }

  // Restaurant is selected - normal reservation flow
  return `You are a friendly and professional AI assistant for ${restaurantName}. You help customers make reservations, answer questions, and provide information about the restaurant.

CURRENT CONTEXT:
- Restaurant: ${restaurantName}
- Today's Date: ${currentDate} (${currentDay})
- Session ID: ${session?.id || 'new'}
- Customer Phone: ${session?.phoneNumber || 'unknown'}

RESTAURANT INFORMATION:
${restaurantInfo ? JSON.stringify(restaurantInfo, null, 2) : 'Restaurant details loading...'}

YOUR CAPABILITIES:
1. Make new reservations
2. Modify existing reservations
3. Cancel reservations
4. Answer questions about the restaurant (hours, location, menu, etc.)
5. Provide information about availability

TOOLS AVAILABLE:
You have access to tools for checking availability and creating/modifying reservations. Use them when needed.

CONVERSATION STYLE:
- Be warm, professional, and concise
- Keep responses brief and WhatsApp-friendly (short messages work best)
- Ask clarifying questions one at a time
- Confirm details before making reservations
- Use simple language, avoid jargon

IMPORTANT GUIDELINES:
- Always confirm the date, time, party size, and name before creating a reservation
- If a time slot is not available, suggest alternatives
- Be helpful with dietary restrictions or special requests
- Never share other customers' information`;
}

/**
 * Process a message with Claude AI
 * (Adapted from the Meta webhook implementation)
 */
async function processWithClaude(messageText, session) {
  // Get restaurant info if we have a restaurant ID
  let restaurantInfo = null;
  let supabaseClient = null;
  let availableRestaurants = [];

  // Always fetch available restaurants for the platform
  try {
    availableRestaurants = await getAllActiveRestaurants();
    console.log(`[Twilio] Found ${availableRestaurants.length} active restaurants in platform`);
  } catch (err) {
    console.error('[Twilio] Error fetching restaurants:', err);
  }

  if (session?.restaurantId) {
    const result = await getRestaurantByName(session.restaurantId);
    if (result?.match) {
      restaurantInfo = result.match;
      if (restaurantInfo.supabase_url && restaurantInfo.supabase_anon_key) {
        supabaseClient = await getMultiTenantClient(restaurantInfo.supabase_url, restaurantInfo.supabase_anon_key);
      }
    }
  }

  // Build conversation history
  const conversationHistory = session?.conversationHistory || [];

  // Add the new user message
  conversationHistory.push({
    role: 'user',
    content: messageText
  });

  // Define available tools for restaurant operations
  const tools = [
    {
      name: 'check_availability',
      description: 'Check table availability for a specific date and time',
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
      description: 'Create a new reservation',
      input_schema: {
        type: 'object',
        properties: {
          customer_name: {
            type: 'string',
            description: 'Name for the reservation'
          },
          customer_phone: {
            type: 'string',
            description: 'Phone number'
          },
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format'
          },
          time: {
            type: 'string',
            description: 'Time in HH:MM format'
          },
          party_size: {
            type: 'integer',
            description: 'Number of guests'
          },
          special_requests: {
            type: 'string',
            description: 'Any special requests or notes'
          }
        },
        required: ['customer_name', 'date', 'time', 'party_size']
      }
    },
    {
      name: 'list_restaurants',
      description: 'List all available restaurants in the system',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'select_restaurant',
      description: 'Select a restaurant for the current conversation',
      input_schema: {
        type: 'object',
        properties: {
          restaurant_name: {
            type: 'string',
            description: 'Name of the restaurant to select'
          }
        },
        required: ['restaurant_name']
      }
    }
  ];

  try {
    // Call Claude with the conversation
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: buildSystemPrompt(restaurantInfo, session, availableRestaurants),
      tools: tools,
      messages: conversationHistory
    });

    // Process the response
    let assistantMessage = '';
    let toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        assistantMessage += block.text;
      } else if (block.type === 'tool_use') {
        // Handle tool calls
        const toolResult = await handleToolCall(block.name, block.input, session, supabaseClient);
        toolResults.push({
          tool_use_id: block.id,
          content: JSON.stringify(toolResult)
        });
      }
    }

    // If there were tool calls, send results back to Claude
    if (toolResults.length > 0) {
      conversationHistory.push({
        role: 'assistant',
        content: response.content
      });
      conversationHistory.push({
        role: 'user',
        content: toolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.tool_use_id,
          content: tr.content
        }))
      });

      // Get Claude's final response
      const finalResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: buildSystemPrompt(restaurantInfo, session, availableRestaurants),
        tools: tools,
        messages: conversationHistory
      });

      for (const block of finalResponse.content) {
        if (block.type === 'text') {
          assistantMessage = block.text;
        }
      }
    }

    // Update session with conversation history
    conversationHistory.push({
      role: 'assistant',
      content: assistantMessage
    });

    return assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.';
  } catch (error) {
    console.error('[Twilio] Claude API error:', error);
    throw error;
  }
}

/**
 * Handle tool calls from Claude
 */
async function handleToolCall(toolName, toolInput, session, supabaseClient) {
  console.log(`[Twilio] Tool call: ${toolName}`, toolInput);

  switch (toolName) {
    case 'list_restaurants': {
      const restaurants = await getAllActiveRestaurants();
      return {
        success: true,
        count: restaurants.length,
        restaurants: restaurants.map(r => ({
          name: r.restaurant_name,
          aliases: r.restaurant_aliases || [],
          language: r.language || 'en'
        })),
        message: restaurants.length > 0
          ? `We have ${restaurants.length} restaurant(s) available: ${restaurants.map(r => r.restaurant_name).join(', ')}`
          : 'No restaurants are currently available in our system.'
      };
    }

    case 'select_restaurant': {
      const result = await getRestaurantByName(toolInput.restaurant_name);
      if (result?.match) {
        await setSessionRestaurant(session.id, result.match.restaurant_name);
        return {
          success: true,
          restaurant: result.match.restaurant_name,
          message: `Selected ${result.match.restaurant_name}. How can I help you with your reservation?`
        };
      }
      // Check if there are multiple matches needing disambiguation
      if (result?.needsDisambiguation && result?.matches) {
        return {
          success: false,
          needsDisambiguation: true,
          options: result.matches.map(m => m.restaurant_name),
          message: `Multiple restaurants found. Did you mean: ${result.matches.map(m => m.restaurant_name).join(', ')}?`
        };
      }
      return {
        success: false,
        error: `Restaurant "${toolInput.restaurant_name}" not found in our system`
      };
    }

    case 'check_availability': {
      if (!supabaseClient) {
        return { success: false, error: 'No restaurant selected' };
      }

      // Query available tables for the requested time
      const { data: tables, error } = await supabaseClient
        .from('tables')
        .select('*')
        .gte('capacity', toolInput.party_size)
        .eq('status', 'available');

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        available: tables.length > 0,
        tables: tables.length,
        message: tables.length > 0
          ? `We have ${tables.length} table(s) available for ${toolInput.party_size} guests on ${toolInput.date} at ${toolInput.time}.`
          : `Sorry, no tables available for ${toolInput.party_size} guests at that time.`
      };
    }

    case 'create_reservation': {
      if (!supabaseClient) {
        return { success: false, error: 'No restaurant selected' };
      }

      // Create the reservation
      const { data, error } = await supabaseClient
        .from('reservations')
        .insert({
          customer_name: toolInput.customer_name,
          customer_phone: toolInput.customer_phone || session?.phoneNumber,
          date: toolInput.date,
          time: toolInput.time,
          party_size: toolInput.party_size,
          special_requests: toolInput.special_requests || null,
          status: 'confirmed',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        reservation: data,
        message: `Reservation confirmed for ${toolInput.customer_name}, party of ${toolInput.party_size} on ${toolInput.date} at ${toolInput.time}.`
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Validate Twilio webhook signature
 */
function validateTwilioSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) return false;

  // Get the full URL
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const url = `${protocol}://${host}${req.url}`;

  // Validate the signature
  return twilio.validateRequest(authToken, twilioSignature, url, req.body);
}

/**
 * Parse URL-encoded body manually if needed
 */
function parseUrlEncodedBody(body) {
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  }
  return body || {};
}

/**
 * Main webhook handler for Twilio WhatsApp messages
 */
module.exports = async (req, res) => {
  // Health check endpoint
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'twilio-whatsapp-webhook',
      timestamp: new Date().toISOString()
    });
  }

  // Handle incoming messages (POST)
  if (req.method === 'POST') {
    try {
      // Log raw body type for debugging
      console.log('[Twilio] Body type:', typeof req.body);
      console.log('[Twilio] Raw body:', req.body);

      // Twilio sends form-urlencoded data - parse it if necessary
      let parsedBody = req.body;
      if (typeof req.body === 'string') {
        console.log('[Twilio] Parsing string body as URL-encoded');
        parsedBody = parseUrlEncodedBody(req.body);
      } else if (!req.body || Object.keys(req.body).length === 0) {
        console.log('[Twilio] Empty body, checking raw request');
        // Try to get raw body if available
        parsedBody = {};
      }

      console.log('[Twilio] Parsed body:', JSON.stringify(parsedBody, null, 2));

      // Twilio sends form-urlencoded data
      const {
        From,         // Sender's WhatsApp number (format: whatsapp:+1234567890)
        To,           // Your WhatsApp number
        Body,         // Message text
        MessageSid,   // Unique message ID
        NumMedia,     // Number of media attachments
        ProfileName,  // Sender's WhatsApp profile name
      } = parsedBody;

      // Validate required fields
      if (!From || !Body) {
        console.log('[Twilio] Missing required fields');
        return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Extract phone number (remove 'whatsapp:' prefix)
      const fromNumber = From.replace('whatsapp:', '');
      const messageText = Body.trim();

      console.log(`[Twilio] Message from ${fromNumber} (${ProfileName}): ${messageText}`);

      // Handle media messages (not supported yet)
      if (NumMedia && parseInt(NumMedia) > 0) {
        await sendWhatsAppMessage(fromNumber, 'I can only process text messages at the moment. Please type your request.');
        return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Get or create session for this phone number
      const session = await getOrCreateSession(fromNumber, `twilio-${Date.now()}`);

      if (!session) {
        console.error('[Twilio] Failed to create session');
        await sendWhatsAppMessage(fromNumber, 'Sorry, I had trouble starting our conversation. Please try again.');
        return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // Process message with Claude
      console.log(`[Twilio] Processing message with Claude for session: ${session.id}`);
      let response;
      try {
        response = await processWithClaude(messageText, session);
        console.log(`[Twilio] Claude response received: ${response?.substring(0, 100)}...`);
      } catch (claudeError) {
        console.error('[Twilio] Claude processing error:', claudeError);
        response = 'Sorry, I had trouble processing your message. Please try again.';
      }

      // Send response back via TwiML (more reliable for Sandbox)
      console.log(`[Twilio] Sending TwiML response to ${fromNumber}: ${response.substring(0, 100)}...`);

      // Escape XML special characters in the response
      const escapedResponse = response
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      // Return TwiML response with the message
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twimlResponse);

    } catch (error) {
      console.error('[Twilio] Webhook error:', error);
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
