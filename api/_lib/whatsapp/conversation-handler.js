/**
 * Claude AI conversation handler for WhatsApp reservation flows.
 * Manages system prompt building, conversation history, and multi-round tool calling.
 * Extracted from twilio-whatsapp-webhook.js (M-23).
 */

const { getAI, AI_MODEL_FAST } = require('../ai-client');
const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('WhatsApp:Conversation');
const { getRestaurantById, getRestaurantByName, getAllActiveRestaurants } = require('../restaurant-registry');
const { getMultiTenantClient } = require('../multi-tenant-supabase');
const { updateSessionConversationHistory } = require('../whatsapp-sessions');
const { handleToolCall } = require('./tool-handler');

// Initialize AI client (lazy singleton via centralized ai-client)
const anthropic = getAI();

/**
 * Sanitize conversation history to ensure valid message structure for Claude API
 * - Ensures all tool_result blocks have corresponding tool_use blocks
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
            logger.warn(' Skipping user message with orphan tool_result blocks');
          }
        } else {
          // No valid previous assistant message with tool_use - skip these tool_results
          logger.warn(' Skipping tool_result blocks without corresponding tool_use');
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

  logger.info(` Sanitized conversation history: ${history.length} -> ${sanitized.length} messages`);
  return sanitized;
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
  const emojiNumbers = ['1\uFE0F\u20E3', '2\uFE0F\u20E3', '3\uFE0F\u20E3', '4\uFE0F\u20E3', '5\uFE0F\u20E3', '6\uFE0F\u20E3', '7\uFE0F\u20E3', '8\uFE0F\u20E3', '9\uFE0F\u20E3', '\uD83D\uDD1F'];

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
"Hi! I'd be happy to help you make a reservation. \uD83C\uDF7D\uFE0F

*Choose a Restaurant:*

1\uFE0F\u20E3 Restaurant Name 1
2\uFE0F\u20E3 Restaurant Name 2
3\uFE0F\u20E3 Restaurant Name 3

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

/** Tool definitions for Claude */
const TOOL_DEFINITIONS = [
  {
    name: 'check_availability',
    description: 'Check table availability for a specific date and time',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
        party_size: { type: 'integer', description: 'Number of guests' }
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
        customer_name: { type: 'string', description: 'Name for the reservation' },
        customer_phone: { type: 'string', description: 'Phone number' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format' },
        party_size: { type: 'integer', description: 'Number of guests' },
        special_requests: { type: 'string', description: 'Any special requests or notes' }
      },
      required: ['customer_name', 'date', 'time', 'party_size']
    }
  },
  {
    name: 'list_restaurants',
    description: 'List all available restaurants in the system',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'select_restaurant',
    description: 'Select a restaurant for the current conversation',
    input_schema: {
      type: 'object',
      properties: {
        restaurant_name: { type: 'string', description: 'Name of the restaurant to select' }
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
        reservation_id: { type: 'string', description: 'The reservation confirmation number (e.g., RES-20260119-XXXX)' },
        customer_phone: { type: 'string', description: 'Customer phone number to look up reservations' }
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
        reservation_id: { type: 'string', description: 'The reservation confirmation number to cancel' }
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
        reservation_id: { type: 'string', description: 'The reservation confirmation number to modify' },
        new_date: { type: 'string', description: 'New date in YYYY-MM-DD format (optional, only if changing date)' },
        new_time: { type: 'string', description: 'New time in HH:MM format (optional, only if changing time)' },
        new_party_size: { type: 'integer', description: 'New party size (optional, only if changing party size)' }
      },
      required: ['reservation_id']
    }
  }
];

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
    logger.info(` Found ${availableRestaurants.length} active restaurants in platform`);
  } catch (err) {
    logger.error(' Error fetching restaurants:', err);
  }

  // Use restaurant from session JOIN if available
  if (session?.restaurant) {
    restaurantInfo = session.restaurant;
    logger.info(` Using restaurant from session: ${restaurantInfo.restaurant_name} (ID: ${restaurantInfo.id})`);
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
        logger.info(` Found restaurant by name fallback: ${result.restaurant_name}`);
      }
    }

    if (result) {
      restaurantInfo = result;
      logger.info(` Using restaurant: ${restaurantInfo.restaurant_name} (ID: ${restaurantInfo.id})`);
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

  try {
    // Multi-round tool calling loop
    const MAX_TOOL_ROUNDS = 5; // Prevent infinite loops
    let currentResponse = null;
    let assistantMessage = '';
    let toolRounds = 0;

    // Initial Claude call
    currentResponse = await anthropic.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 300,
      system: buildSystemPrompt(restaurantInfo, session, availableRestaurants),
      tools: TOOL_DEFINITIONS,
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
        logger.info(` Claude finished after ${toolRounds} tool round(s)`);
        break;
      }

      // Process tool calls
      logger.info(` Processing ${toolUseBlocks.length} tool call(s) in round ${toolRounds + 1}`);
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
            logger.info(` Updated supabaseClient after restaurant selection: ${updatedRestaurant.restaurant_name}`);
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
        model: AI_MODEL_FAST,
        max_tokens: 300,
        system: buildSystemPrompt(restaurantInfo, session, availableRestaurants),
        tools: TOOL_DEFINITIONS,
        messages: conversationHistory
      });

      toolRounds++;
    }

    if (toolRounds >= MAX_TOOL_ROUNDS) {
      logger.warn(` Max tool rounds (${MAX_TOOL_ROUNDS}) reached`);
    }

    // Add final assistant message to conversation history
    conversationHistory.push({
      role: 'assistant',
      content: currentResponse.content
    });

    // Save conversation history to session for persistence
    await updateSessionConversationHistory(session.id, conversationHistory);

    return assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.';
  } catch (error) {
    logger.error(' Claude API error:', error);
    throw error;
  }
}

module.exports = {
  sanitizeConversationHistory,
  buildSystemPrompt,
  processWithClaude,
  TOOL_DEFINITIONS,
};
