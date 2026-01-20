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
  normalizePhoneNumber,
  updateSessionConversationHistory
} = require('./_lib/whatsapp-sessions');
const { getRestaurantByName, getRestaurantById, getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { getMultiTenantClient } = require('./_lib/multi-tenant-supabase');
const { centralSupabase } = require('./_lib/central-supabase');
const { canAccommodateParty } = require('./_lib/supabase');

/**
 * Parse natural language date into YYYY-MM-DD format
 * Handles: "today", "tomorrow", "2026-01-19", "January 19", "19/01/2026", etc.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  const today = new Date();
  const normalizedDate = dateStr.toLowerCase().trim();

  // Handle "today"
  if (normalizedDate === 'today') {
    return today.toISOString().slice(0, 10);
  }

  // Handle "tomorrow"
  if (normalizedDate === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }

  // Handle day names (next Monday, this Friday, etc.)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (normalizedDate.includes(dayNames[i])) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7; // Next week if today or past
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate.toISOString().slice(0, 10);
    }
  }

  // Handle ISO format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Handle "January 19" or "Jan 19" format
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbrev = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  for (let i = 0; i < monthNames.length; i++) {
    const monthMatch = normalizedDate.match(new RegExp(`(${monthNames[i]}|${monthAbbrev[i]})\\s*(\\d{1,2})`));
    if (monthMatch) {
      const day = parseInt(monthMatch[2]);
      const year = today.getFullYear();
      const month = (i + 1).toString().padStart(2, '0');
      return `${year}-${month}-${day.toString().padStart(2, '0')}`;
    }
  }

  // Try to parse as a date directly
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  // Default to tomorrow if we can't parse
  console.warn(`[Twilio] Could not parse date: "${dateStr}", defaulting to tomorrow`);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

/**
 * Parse natural language time into HH:MM format (24-hour)
 * Handles: "7pm", "7:30pm", "19:00", "7 PM", "seven o'clock", etc.
 */
function parseTime(timeStr) {
  if (!timeStr) return null;

  const normalized = timeStr.toLowerCase().trim().replace(/\s+/g, '');

  // Handle 24-hour format (19:00, 19:30)
  const time24Match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const hours = parseInt(time24Match[1]).toString().padStart(2, '0');
    const minutes = time24Match[2];
    return `${hours}:${minutes}`;
  }

  // Handle 12-hour format (7pm, 7:30pm, 7:30 pm)
  const time12Match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (time12Match) {
    let hours = parseInt(time12Match[1]);
    const minutes = time12Match[2] || '00';
    const period = time12Match[3];

    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Handle just a number (assume PM for restaurant context, 1-11 = PM, 12 = noon)
  const justNumber = normalized.match(/^(\d{1,2})$/);
  if (justNumber) {
    let hours = parseInt(justNumber[1]);
    if (hours >= 1 && hours <= 11) hours += 12; // Assume PM for restaurant hours
    return `${hours.toString().padStart(2, '0')}:00`;
  }

  // Default to 19:00 (7pm) if we can't parse
  console.warn(`[Twilio] Could not parse time: "${timeStr}", defaulting to 19:00`);
  return '19:00';
}

/**
 * Format a date for display with relative context (Today, Tomorrow, etc.)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string} - Formatted date like "Today (Monday, January 19th)" or "Tomorrow (Tuesday, January 20th)"
 */
function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  // Format the full date
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const fullDate = date.toLocaleDateString('en-US', options);

  // Add ordinal suffix to day
  const day = date.getDate();
  const ordinal = day === 1 || day === 21 || day === 31 ? 'st'
                : day === 2 || day === 22 ? 'nd'
                : day === 3 || day === 23 ? 'rd' : 'th';
  const formattedDate = fullDate.replace(/(\d+)/, `$1${ordinal}`);

  // Check for relative dates
  if (date.toDateString() === today.toDateString()) {
    return `Today (${formattedDate})`;
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow (${formattedDate})`;
  }

  // For dates within the next week, just show the day name and date
  const daysUntil = Math.floor((date - today) / (1000 * 60 * 60 * 24));
  if (daysUntil >= 2 && daysUntil <= 7) {
    return `This ${formattedDate}`;
  }

  // For dates further out, include the year
  if (daysUntil > 7) {
    return date.toLocaleDateString('en-US', { ...options, year: 'numeric' }).replace(/(\d+),/, `$1${ordinal},`);
  }

  return formattedDate;
}

/**
 * Format time for display (12-hour format with AM/PM)
 * @param {string} timeStr - Time in HH:MM format (24-hour)
 * @returns {string} - Formatted time like "7:00 PM"
 */
function formatTimeForDisplay(timeStr) {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  } catch {
    return timeStr;
  }
}

/**
 * Find the most recent upcoming reservation for a phone number
 * @param {string} phoneNumber - Customer phone number (without whatsapp: prefix)
 * @param {string} restaurantId - Optional restaurant ID to filter by
 * @returns {Object|null} - Most recent upcoming reservation or null
 */
async function findRecentReservation(phoneNumber, restaurantId = null) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Normalize phone number - remove + prefix and any non-digits
    // Database stores: 5511999002121 (digits only, no +)
    const normalizedPhone = phoneNumber.replace(/^\+/, '').replace(/\D/g, '');

    console.log(`[Twilio] Finding reservation for phone: ${phoneNumber} -> normalized: ${normalizedPhone}`);

    let query = centralSupabase
      .from('reservations')
      .select('*')
      .eq('customer_phone', normalizedPhone)
      .in('status', ['confirmed', 'pending'])
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(1);

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Twilio] Error finding recent reservation:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error('[Twilio] Exception finding recent reservation:', err);
    return null;
  }
}

/**
 * Update the context stored in a WhatsApp session
 * @param {string} sessionId - Session UUID
 * @param {Object} contextUpdate - Object with fields to update/merge into context
 */
async function updateSessionContext(sessionId, contextUpdate) {
  try {
    // First get the current session
    const { data: session, error: fetchError } = await centralSupabase
      .from('whatsapp_sessions')
      .select('context')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      console.error('[Twilio] Error fetching session for context update:', fetchError);
      return;
    }

    // Merge the new context with existing
    const currentContext = session?.context || {};
    const newContext = { ...currentContext, ...contextUpdate };

    // Update the session
    const { error: updateError } = await centralSupabase
      .from('whatsapp_sessions')
      .update({
        context: newContext,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('[Twilio] Error updating session context:', updateError);
    }
  } catch (err) {
    console.error('[Twilio] Exception updating session context:', err);
  }
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Sanitize conversation history to ensure valid message structure for Claude API
 * - Ensures all tool_result blocks have corresponding tool_use blocks in the previous assistant message
 * - Removes orphan tool_result blocks that would cause API errors
 */
function sanitizeConversationHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const sanitized = [];

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];

    // Check if this message contains tool_result blocks
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const toolResults = msg.content.filter(block => block.type === 'tool_result');

      if (toolResults.length > 0) {
        // Find the previous assistant message
        const prevMsg = sanitized[sanitized.length - 1];

        if (prevMsg && prevMsg.role === 'assistant' && Array.isArray(prevMsg.content)) {
          // Get all tool_use IDs from the previous assistant message
          const toolUseIds = new Set(
            prevMsg.content
              .filter(block => block.type === 'tool_use')
              .map(block => block.id)
          );

          // Filter to only include tool_results that have matching tool_use blocks
          const validToolResults = toolResults.filter(tr => toolUseIds.has(tr.tool_use_id));

          if (validToolResults.length > 0) {
            sanitized.push({
              role: 'user',
              content: validToolResults
            });
          } else {
            console.warn('[Twilio] Skipping user message with orphan tool_result blocks');
          }
        } else {
          // No valid previous assistant message with tool_use - skip these tool_results
          console.warn('[Twilio] Skipping tool_result blocks without corresponding tool_use');
        }
      } else {
        // No tool_results, keep the message as is
        sanitized.push(msg);
      }
    } else {
      // Regular message (not tool_result), keep it
      sanitized.push(msg);
    }
  }

  console.log(`[Twilio] Sanitized conversation history: ${history.length} -> ${sanitized.length} messages`);
  return sanitized;
}

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
  const hasRestaurant = !!restaurantInfo || !!session?.restaurant_id || !!session?.restaurant;
  const restaurantName = restaurantInfo?.restaurant_name || session?.restaurant?.restaurant_name || null;

  // Get current time info
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });

  // Emoji numbers for prettier restaurant list
  const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  // Base prompt varies based on whether a restaurant is selected
  if (!hasRestaurant) {
    // No restaurant selected - guide user to choose one
    const restaurantList = availableRestaurants.length > 0
      ? availableRestaurants.map((r, i) => `${emojiNumbers[i] || (i + 1) + '.'} ${r.restaurant_name}`).join('\n')
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
"Hi! I'd be happy to help you make a reservation. 🍽️

*Choose a Restaurant:*

1️⃣ Restaurant Name 1
2️⃣ Restaurant Name 2
3️⃣ Restaurant Name 3

Reply with the number or name to select."`;
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

  // Use restaurant from session JOIN if available
  if (session?.restaurant) {
    restaurantInfo = session.restaurant;
    console.log(`[Twilio] Using restaurant from session: ${restaurantInfo.restaurant_name} (ID: ${restaurantInfo.id})`);
    if (restaurantInfo.supabase_url && restaurantInfo.supabase_anon_key) {
      supabaseClient = await getMultiTenantClient(restaurantInfo.supabase_url, restaurantInfo.supabase_anon_key);
    }
  } else if (session?.restaurant_id) {
    // Fallback: lookup restaurant by ID if JOIN didn't work
    let result = await getRestaurantById(session.restaurant_id);

    // Fallback to name lookup for old sessions that stored restaurant name
    if (!result) {
      const nameResult = await getRestaurantByName(session.restaurant_id);
      if (nameResult?.match) {
        result = nameResult.match;
        console.log(`[Twilio] Found restaurant by name fallback: ${result.restaurant_name}`);
      }
    }

    if (result) {
      restaurantInfo = result;
      console.log(`[Twilio] Using restaurant: ${restaurantInfo.restaurant_name} (ID: ${restaurantInfo.id})`);
      if (restaurantInfo.supabase_url && restaurantInfo.supabase_anon_key) {
        supabaseClient = await getMultiTenantClient(restaurantInfo.supabase_url, restaurantInfo.supabase_anon_key);
      }
    }
  }

  // Build conversation history from session (snake_case from Supabase)
  // Sanitize to remove any orphan tool_result blocks that would cause API errors
  const rawHistory = session?.conversation_history || [];
  const conversationHistory = sanitizeConversationHistory(rawHistory);

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
    },
    {
      name: 'lookup_reservation',
      description: 'Look up an existing reservation by confirmation number or customer phone number',
      input_schema: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'The reservation confirmation number (e.g., RES-20260119-XXXX)'
          },
          customer_phone: {
            type: 'string',
            description: 'Customer phone number to look up reservations'
          }
        },
        required: []
      }
    },
    {
      name: 'cancel_reservation',
      description: 'Cancel an existing reservation. Use lookup_reservation first to verify the reservation exists.',
      input_schema: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'The reservation confirmation number to cancel'
          }
        },
        required: ['reservation_id']
      }
    },
    {
      name: 'modify_reservation',
      description: 'Modify an existing reservation. Can change date, time, or party size. Use lookup_reservation first to verify the reservation.',
      input_schema: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'The reservation confirmation number to modify'
          },
          new_date: {
            type: 'string',
            description: 'New date in YYYY-MM-DD format (optional, only if changing date)'
          },
          new_time: {
            type: 'string',
            description: 'New time in HH:MM format (optional, only if changing time)'
          },
          new_party_size: {
            type: 'integer',
            description: 'New party size (optional, only if changing party size)'
          }
        },
        required: ['reservation_id']
      }
    }
  ];

  try {
    // Multi-round tool calling loop
    // Claude may need multiple tool calls (e.g., check_availability then create_reservation)
    const MAX_TOOL_ROUNDS = 5; // Prevent infinite loops
    let currentResponse = null;
    let assistantMessage = '';
    let toolRounds = 0;

    // Initial Claude call
    currentResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: buildSystemPrompt(restaurantInfo, session, availableRestaurants),
      tools: tools,
      messages: conversationHistory
    });

    // Loop until Claude responds with just text (no tool calls) or max rounds reached
    while (toolRounds < MAX_TOOL_ROUNDS) {
      // Check if response has tool calls
      const toolUseBlocks = currentResponse.content.filter(block => block.type === 'tool_use');
      const textBlocks = currentResponse.content.filter(block => block.type === 'text');

      // Collect any text from this response
      for (const block of textBlocks) {
        assistantMessage = block.text; // Use latest text
      }

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0) {
        console.log(`[Twilio] Claude finished after ${toolRounds} tool round(s)`);
        break;
      }

      // Process tool calls
      console.log(`[Twilio] Processing ${toolUseBlocks.length} tool call(s) in round ${toolRounds + 1}`);
      const toolResults = [];

      for (const block of toolUseBlocks) {
        const toolResult = await handleToolCall(block.name, block.input, session, supabaseClient, restaurantInfo);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(toolResult)
        });

        // If select_restaurant was called, update the supabaseClient for subsequent tools
        if (block.name === 'select_restaurant' && toolResult.success && toolResult.restaurantId) {
          const updatedRestaurant = await getRestaurantById(toolResult.restaurantId);
          if (updatedRestaurant?.supabase_url && updatedRestaurant?.supabase_anon_key) {
            supabaseClient = await getMultiTenantClient(updatedRestaurant.supabase_url, updatedRestaurant.supabase_anon_key);
            restaurantInfo = updatedRestaurant;
            console.log(`[Twilio] Updated supabaseClient after restaurant selection: ${updatedRestaurant.restaurant_name}`);
          }
        }
      }

      // Add assistant response (with tool calls) to history
      conversationHistory.push({
        role: 'assistant',
        content: currentResponse.content
      });

      // Add tool results to history
      conversationHistory.push({
        role: 'user',
        content: toolResults
      });

      // Get next response from Claude
      currentResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: buildSystemPrompt(restaurantInfo, session, availableRestaurants),
        tools: tools,
        messages: conversationHistory
      });

      toolRounds++;
    }

    if (toolRounds >= MAX_TOOL_ROUNDS) {
      console.warn(`[Twilio] Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
    }

    // Add final assistant message to conversation history
    // Store the full response content array for consistency
    conversationHistory.push({
      role: 'assistant',
      content: currentResponse.content
    });

    // Save conversation history to session for persistence
    await updateSessionConversationHistory(session.id, conversationHistory);

    return assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.';
  } catch (error) {
    console.error('[Twilio] Claude API error:', error);
    throw error;
  }
}

/**
 * Handle tool calls from Claude
 */
async function handleToolCall(toolName, toolInput, session, supabaseClient, restaurantInfo = null) {
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
        // Use restaurant ID (UUID) not name for session storage
        await setSessionRestaurant(session.id, result.match.id);
        return {
          success: true,
          restaurant: result.match.restaurant_name,
          restaurantId: result.match.id,
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

      // Parse date/time for consistent display
      const parsedDate = parseDate(toolInput.date);
      const parsedTime = parseTime(toolInput.time);
      const partySize = parseInt(toolInput.party_size);

      // Check if party can be accommodated using table-aware logic
      // This respects is_fixed flag and adjacent_tables configuration
      const accommodationResult = await canAccommodateParty(partySize);

      if (!accommodationResult.success) {
        return { success: false, error: 'Could not check table availability' };
      }

      // Check for time conflicts with existing reservations
      const { data: reservations, error: resError } = await supabaseClient
        .from('reservations')
        .select('party_size')
        .eq('date', parsedDate)
        .eq('time', parsedTime)
        .in('status', ['confirmed', 'seated']);

      if (resError) {
        console.error('[Twilio] Reservation check error:', resError);
      }

      const bookedSeats = reservations?.reduce((sum, r) => sum + (r.party_size || 0), 0) || 0;

      // Get total capacity
      const { data: allTables } = await supabaseClient
        .from('tables')
        .select('capacity')
        .eq('is_active', true);
      const totalCapacity = allTables?.reduce((sum, t) => sum + t.capacity, 0) || 30;
      const remainingCapacity = totalCapacity - bookedSeats;

      // Both conditions must be met
      const canFit = accommodationResult.can_accommodate && remainingCapacity >= partySize;

      // Build response message with table info
      let message;
      if (canFit) {
        if (accommodationResult.method === 'combination') {
          message = `We have availability for ${partySize} guests on ${parsedDate} at ${parsedTime}. We can seat you at Tables ${accommodationResult.tables.join(' + ')} (${accommodationResult.total_capacity} seats combined).`;
        } else {
          message = `We have a table available for ${partySize} guests on ${parsedDate} at ${parsedTime} (Table ${accommodationResult.tables[0]}, seats ${accommodationResult.total_capacity}).`;
        }
      } else if (!accommodationResult.can_accommodate) {
        message = `Sorry, we cannot accommodate a party of ${partySize} guests. ${accommodationResult.reason || 'Our largest available seating option is smaller.'}`;
      } else {
        message = `Sorry, ${parsedTime} is fully booked for ${partySize} guests.`;
      }

      return {
        success: true,
        available: canFit,
        date: parsedDate,
        time: parsedTime,
        message,
        details: {
          can_physically_accommodate: accommodationResult.can_accommodate,
          seating_method: accommodationResult.method,
          assigned_tables: accommodationResult.tables,
          table_capacity: accommodationResult.total_capacity
        }
      };
    }

    case 'create_reservation': {
      if (!supabaseClient) {
        return { success: false, error: 'No restaurant selected' };
      }

      // Parse date and time from natural language to proper formats
      const parsedDate = parseDate(toolInput.date);
      const parsedTime = parseTime(toolInput.time);

      console.log(`[Twilio] Parsed reservation date: "${toolInput.date}" -> "${parsedDate}"`);
      console.log(`[Twilio] Parsed reservation time: "${toolInput.time}" -> "${parsedTime}"`);

      if (!parsedDate || !parsedTime) {
        return { success: false, error: 'Could not parse date or time. Please provide a valid date and time.' };
      }

      // Generate a unique reservation ID (RES-YYYYMMDD-XXXX format)
      const dateForId = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      const reservationId = `RES-${dateForId}-${randomPart}`;

      // Get customer phone from input or session (session uses snake_case: sender_phone)
      const customerPhone = toolInput.customer_phone || session?.sender_phone;

      // Create the reservation with restaurant association
      const reservationData = {
        reservation_id: reservationId,
        customer_name: toolInput.customer_name,
        customer_phone: customerPhone,
        date: parsedDate,
        time: parsedTime,
        party_size: toolInput.party_size,
        special_requests: toolInput.special_requests || null,
        status: 'confirmed'
      };

      // Add restaurant_id if available
      if (restaurantInfo?.id) {
        reservationData.restaurant_id = restaurantInfo.id;
        console.log(`[Twilio] Linking reservation to restaurant: ${restaurantInfo.restaurant_name} (${restaurantInfo.id})`);
      }

      const { data, error } = await supabaseClient
        .from('reservations')
        .insert(reservationData)
        .select()
        .single();

      if (error) {
        console.error('[Twilio] Reservation creation error:', error);
        console.error('[Twilio] Insert data was:', { reservation_id: reservationId, customer_name: toolInput.customer_name, customer_phone: customerPhone, date: parsedDate, time: parsedTime, party_size: toolInput.party_size });
        return { success: false, error: error.message };
      }

      console.log(`[Twilio] Reservation created: ${reservationId} for ${toolInput.customer_name}`);

      // Send confirmation message to customer (if template contentSid is configured)
      // Note: For Twilio, templates require contentSid from Twilio Content API
      const templateContentSid = process.env.TWILIO_TEMPLATE_RESERVATION_CONFIRMED;
      if (templateContentSid && customerPhone) {
        // Format date and time for display with relative context (Today, Tomorrow, etc.)
        const displayDate = formatDateForDisplay(parsedDate);
        const displayTime = formatTimeForDisplay(parsedTime);

        await sendTemplateMessage(customerPhone, templateContentSid, {
          '1': toolInput.customer_name,
          '2': restaurantInfo?.restaurant_name || 'our restaurant',
          '3': displayDate,
          '4': displayTime,
          '5': toolInput.party_size.toString()
        });
        console.log(`[Twilio] Confirmation template sent to ${customerPhone}`);
      }

      return {
        success: true,
        reservation: data,
        reservationId: reservationId,
        message: `Reservation confirmed for ${toolInput.customer_name}, party of ${toolInput.party_size} on ${parsedDate} at ${parsedTime}. Your confirmation number is ${reservationId}.`
      };
    }

    case 'lookup_reservation': {
      if (!supabaseClient) {
        return { success: false, error: 'No restaurant selected' };
      }

      const { reservation_id, customer_phone } = toolInput;

      if (!reservation_id && !customer_phone) {
        return {
          success: false,
          error: 'Please provide either a reservation confirmation number or phone number to look up your reservation.'
        };
      }

      let query = supabaseClient
        .from('reservations')
        .select('*');

      if (reservation_id) {
        query = query.eq('reservation_id', reservation_id);
      } else if (customer_phone) {
        query = query.eq('customer_phone', customer_phone);
      }

      // Filter by restaurant if one is selected
      if (restaurantInfo?.id) {
        query = query.eq('restaurant_id', restaurantInfo.id);
      }

      const { data, error } = await query.order('date', { ascending: false }).limit(5);

      if (error) {
        console.error('[Twilio] Lookup error:', error);
        return { success: false, error: 'Could not look up reservation. Please try again.' };
      }

      if (!data || data.length === 0) {
        return {
          success: false,
          error: 'No reservation found with that information. Please check your confirmation number or phone number.'
        };
      }

      const reservations = data.map(r => ({
        reservation_id: r.reservation_id,
        customer_name: r.customer_name,
        date: r.date,
        time: r.time,
        party_size: r.party_size,
        status: r.status
      }));

      console.log(`[Twilio] Found ${reservations.length} reservation(s)`);
      return {
        success: true,
        count: reservations.length,
        reservations: reservations,
        message: reservations.length === 1
          ? `Found reservation ${reservations[0].reservation_id} for ${reservations[0].customer_name} on ${reservations[0].date} at ${reservations[0].time} for ${reservations[0].party_size} guests. Status: ${reservations[0].status}`
          : `Found ${reservations.length} reservations.`
      };
    }

    case 'cancel_reservation': {
      if (!supabaseClient) {
        return { success: false, error: 'No restaurant selected' };
      }

      const { reservation_id } = toolInput;

      if (!reservation_id) {
        return {
          success: false,
          error: 'Please provide the reservation confirmation number to cancel.'
        };
      }

      // First, verify the reservation exists and belongs to this restaurant
      let query = supabaseClient
        .from('reservations')
        .select('*')
        .eq('reservation_id', reservation_id);

      if (restaurantInfo?.id) {
        query = query.eq('restaurant_id', restaurantInfo.id);
      }

      const { data: existing, error: lookupError } = await query.single();

      if (lookupError || !existing) {
        console.error('[Twilio] Cancel lookup error:', lookupError);
        return {
          success: false,
          error: 'Reservation not found. Please check your confirmation number.'
        };
      }

      if (existing.status === 'cancelled') {
        return {
          success: false,
          error: 'This reservation has already been cancelled.'
        };
      }

      // Update the reservation status to cancelled
      const { error: updateError } = await supabaseClient
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('reservation_id', reservation_id);

      if (updateError) {
        console.error('[Twilio] Cancel update error:', updateError);
        return { success: false, error: 'Could not cancel the reservation. Please try again or contact the restaurant directly.' };
      }

      console.log(`[Twilio] Reservation cancelled: ${reservation_id}`);

      // Send cancellation template if configured
      const cancelTemplateSid = process.env.TWILIO_TEMPLATE_RESERVATION_CANCELLED;
      if (cancelTemplateSid && existing.customer_phone) {
        // Format date and time for display with relative context
        const displayDate = formatDateForDisplay(existing.date);
        const displayTime = formatTimeForDisplay(existing.time);

        await sendTemplateMessage(existing.customer_phone, cancelTemplateSid, {
          '1': existing.customer_name,
          '2': restaurantInfo?.restaurant_name || 'our restaurant',
          '3': displayDate,
          '4': displayTime
        });
        console.log(`[Twilio] Cancellation template sent to ${existing.customer_phone}`);
      }

      return {
        success: true,
        reservation_id: reservation_id,
        message: `Your reservation ${reservation_id} for ${existing.customer_name} on ${existing.date} at ${existing.time} has been cancelled. We hope to see you again soon!`
      };
    }

    case 'modify_reservation': {
      if (!supabaseClient) {
        return { success: false, error: 'No restaurant selected' };
      }

      const { reservation_id, new_date, new_time, new_party_size } = toolInput;

      if (!reservation_id) {
        return {
          success: false,
          error: 'Please provide the reservation confirmation number to modify.'
        };
      }

      if (!new_date && !new_time && !new_party_size) {
        return {
          success: false,
          error: 'Please specify what you want to change: new date, new time, or new party size.'
        };
      }

      // First, verify the reservation exists
      let query = supabaseClient
        .from('reservations')
        .select('*')
        .eq('reservation_id', reservation_id);

      if (restaurantInfo?.id) {
        query = query.eq('restaurant_id', restaurantInfo.id);
      }

      const { data: existing, error: lookupError } = await query.single();

      if (lookupError || !existing) {
        console.error('[Twilio] Modify lookup error:', lookupError);
        return {
          success: false,
          error: 'Reservation not found. Please check your confirmation number.'
        };
      }

      if (existing.status === 'cancelled') {
        return {
          success: false,
          error: 'Cannot modify a cancelled reservation. Please make a new reservation instead.'
        };
      }

      // Build update object with only changed fields
      const updates = {};
      if (new_date) {
        const parsedNewDate = parseDate(new_date);
        if (!parsedNewDate) {
          return { success: false, error: 'Invalid date format. Please provide a valid date.' };
        }
        updates.date = parsedNewDate;
      }
      if (new_time) {
        const parsedNewTime = parseTime(new_time);
        if (!parsedNewTime) {
          return { success: false, error: 'Invalid time format. Please provide a valid time.' };
        }
        updates.time = parsedNewTime;
      }
      if (new_party_size) {
        updates.party_size = new_party_size;
      }

      // Update the reservation
      const { data: updated, error: updateError } = await supabaseClient
        .from('reservations')
        .update(updates)
        .eq('reservation_id', reservation_id)
        .select()
        .single();

      if (updateError) {
        console.error('[Twilio] Modify update error:', updateError);
        return { success: false, error: 'Could not modify the reservation. Please try again or contact the restaurant directly.' };
      }

      console.log(`[Twilio] Reservation modified: ${reservation_id}`, updates);

      // Build change summary
      const changes = [];
      if (new_date) changes.push(`date to ${updated.date}`);
      if (new_time) changes.push(`time to ${updated.time}`);
      if (new_party_size) changes.push(`party size to ${updated.party_size}`);

      // Send modification template if configured
      const modifyTemplateSid = process.env.TWILIO_TEMPLATE_RESERVATION_MODIFIED;
      if (modifyTemplateSid && updated.customer_phone) {
        // Format date and time for display with relative context
        const displayDate = formatDateForDisplay(updated.date);
        const displayTime = formatTimeForDisplay(updated.time);

        await sendTemplateMessage(updated.customer_phone, modifyTemplateSid, {
          '1': updated.customer_name,
          '2': restaurantInfo?.restaurant_name || 'our restaurant',
          '3': displayDate,
          '4': displayTime,
          '5': updated.party_size.toString()
        });
        console.log(`[Twilio] Modification template sent to ${updated.customer_phone}`);
      }

      return {
        success: true,
        reservation_id: reservation_id,
        updated: updated,
        message: `Your reservation ${reservation_id} has been updated! Changed: ${changes.join(', ')}. New details: ${updated.customer_name}, party of ${updated.party_size} on ${updated.date} at ${updated.time}.`
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

      // Handle quick action keywords (MODIFY, CANCEL, BOOK, HELP)
      const messageTextLower = messageText.toLowerCase().trim();

      if (messageTextLower === 'modify') {
        // Look up user's most recent reservation to modify
        const recentReservation = await findRecentReservation(fromNumber, session.restaurantId);
        if (recentReservation) {
          // Format date and time for display with relative context
          const displayDate = formatDateForDisplay(recentReservation.date);
          const displayTime = formatTimeForDisplay(recentReservation.time);
          const response = `I found your reservation (${recentReservation.reservation_id}) for ${displayDate} at ${displayTime} for ${recentReservation.party_size} guests.\n\nWhat would you like to change?\n• Date\n• Time\n• Party size\n\nJust tell me what you'd like to update.`;

          const escapedResponse = response
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
          const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
          res.setHeader('Content-Type', 'text/xml');
          return res.status(200).send(twimlResponse);
        } else {
          const response = "I couldn't find any upcoming reservations for your phone number. Would you like to make a new reservation?";
          const escapedResponse = response
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
          const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
          res.setHeader('Content-Type', 'text/xml');
          return res.status(200).send(twimlResponse);
        }
      }

      if (messageTextLower === 'cancel') {
        // Look up user's most recent reservation to cancel
        const recentReservation = await findRecentReservation(fromNumber, session.restaurantId);
        if (recentReservation) {
          // Format date and time for display with relative context
          const displayDate = formatDateForDisplay(recentReservation.date);
          const displayTime = formatTimeForDisplay(recentReservation.time);
          const response = `I found your reservation (${recentReservation.reservation_id}) for ${displayDate} at ${displayTime} for ${recentReservation.party_size} guests.\n\nAre you sure you want to cancel this reservation?\n\nReply YES to confirm cancellation or NO to keep it.`;

          // Store pending cancellation in session context
          await updateSessionContext(session.id, {
            pendingCancellation: recentReservation.reservation_id
          });

          const escapedResponse = response
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
          const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
          res.setHeader('Content-Type', 'text/xml');
          return res.status(200).send(twimlResponse);
        } else {
          const response = "I couldn't find any upcoming reservations for your phone number. Would you like to make a new reservation?";
          const escapedResponse = response
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
          const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
          res.setHeader('Content-Type', 'text/xml');
          return res.status(200).send(twimlResponse);
        }
      }

      if (messageTextLower === 'book') {
        // Clear any pending actions and start fresh reservation flow
        await updateSessionContext(session.id, { pendingCancellation: null });
        const response = "I'd be happy to help you make a reservation! Please tell me:\n\n• How many guests?\n• What date?\n• What time?";
        const escapedResponse = response
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send(twimlResponse);
      }

      if (messageTextLower === 'help') {
        const response = "I can help you with:\n\n• BOOK - Make a new reservation\n• MODIFY - Change an existing reservation\n• CANCEL - Cancel a reservation\n• HELP - Show this menu\n\nOr just tell me what you need and I'll assist you!";
        const escapedResponse = response
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send(twimlResponse);
      }

      // Handle YES/NO responses for pending cancellation
      if ((messageTextLower === 'yes' || messageTextLower === 'no') && session.context?.pendingCancellation) {
        if (messageTextLower === 'yes') {
          // Perform the cancellation
          const reservationId = session.context.pendingCancellation;
          const { error } = await supabase
            .from('reservations')
            .update({ status: 'Cancelled' })
            .eq('reservation_id', reservationId);

          await updateSessionContext(session.id, { pendingCancellation: null });

          if (error) {
            const response = "Sorry, I had trouble cancelling your reservation. Please try again or contact the restaurant directly.";
            const escapedResponse = response.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
            res.setHeader('Content-Type', 'text/xml');
            return res.status(200).send(twimlResponse);
          }

          const response = `Your reservation (${reservationId}) has been cancelled. We hope to see you again soon!\n\nReply BOOK to make a new reservation.`;
          const escapedResponse = response.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
          const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
          res.setHeader('Content-Type', 'text/xml');
          return res.status(200).send(twimlResponse);
        } else {
          // User said NO - keep the reservation
          await updateSessionContext(session.id, { pendingCancellation: null });
          const response = "No problem! Your reservation has been kept. Is there anything else I can help you with?";
          const escapedResponse = response.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
          const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapedResponse}</Message></Response>`;
          res.setHeader('Content-Type', 'text/xml');
          return res.status(200).send(twimlResponse);
        }
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
