/**
 * Voice Pipeline Tool Handler
 *
 * Routes tool calls from AI backends (OpenAI Realtime, etc.) to the shared
 * tool-handlers business logic. This is the bridge between the AI's function
 * calling and Seatable's reservation system.
 *
 * Each tool call comes from the AI backend with a name and arguments.
 * We execute the corresponding shared handler and return the result.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const toolHandlers = require('../_lib/tool-handlers');
const { trackUsage } = require('../_lib/usage-tracking');

const logger = createSecureLogger('VoiceToolHandler');

/**
 * Execute a tool call from an AI backend
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Tool arguments from the AI
 * @param {Object} context - Call context
 * @param {string} context.restaurantId - Restaurant UUID
 * @param {Object} context.restaurantConfig - Full restaurant config
 * @param {string} context.callerNumber - Caller's phone number
 * @param {string} context.conversationId - Conversation ID for logging
 * @returns {Promise<Object>} Tool result to send back to the AI
 */
async function executeToolCall(toolName, args, context) {
  const { restaurantId, restaurantConfig, callerNumber, conversationId } = context;
  const startTime = Date.now();

  logger.info(`Executing tool: ${toolName}`, {
    restaurantId,
    args: toolName === 'create_reservation'
      ? { ...args, customer_phone: '***' }
      : args
  });

  try {
    let result;

    switch (toolName) {
      case 'get_current_datetime': {
        const timezone = restaurantConfig?.timezone || 'UTC';
        result = toolHandlers.getDateTime(timezone);
        break;
      }

      case 'check_availability': {
        result = await toolHandlers.checkAvailability(
          restaurantId,
          restaurantConfig,
          {
            date: args.date,
            time: args.time,
            party_size: args.party_size
          }
        );
        break;
      }

      case 'create_reservation': {
        result = await toolHandlers.createReservation(
          restaurantId,
          restaurantConfig,
          {
            date: args.date,
            time: args.time,
            party_size: args.party_size,
            customer_name: args.customer_name,
            customer_phone: args.customer_phone || callerNumber,
            customer_email: args.customer_email,
            special_requests: args.special_requests
          }
        );

        // Track usage for metered billing on successful reservation
        if (result.success && restaurantId) {
          trackUsage(restaurantId, 'ai_call_completed');
        }
        break;
      }

      case 'lookup_reservation': {
        result = await toolHandlers.lookupReservation(
          restaurantId,
          {
            phone: args.phone || args.customer_phone,
            name: args.name || args.customer_name,
            reservation_id: args.reservation_id
          }
        );
        break;
      }

      case 'modify_reservation': {
        result = await toolHandlers.modifyReservation(
          restaurantId,
          {
            reservation_id: args.reservation_id,
            new_date: args.new_date,
            new_time: args.new_time,
            new_party_size: args.new_party_size
          }
        );
        break;
      }

      case 'cancel_reservation': {
        result = await toolHandlers.cancelReservation(
          restaurantId,
          {
            reservation_id: args.reservation_id
          }
        );
        break;
      }

      case 'get_wait_time': {
        result = await toolHandlers.getWaitTime(restaurantId);
        break;
      }

      case 'identify_restaurant': {
        result = await toolHandlers.identifyRestaurant(
          args.restaurant_name,
          callerNumber,
          conversationId
        );
        break;
      }

      default: {
        logger.warn(`Unknown tool call: ${toolName}`);
        result = {
          success: false,
          error: 'unknown_tool',
          message: `Tool '${toolName}' is not available.`
        };
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Tool ${toolName} completed in ${duration}ms`, {
      success: result.success
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Tool ${toolName} failed after ${duration}ms:`, {
      message: error.message
    });

    return {
      success: false,
      error: 'tool_execution_error',
      message: 'An error occurred processing your request. Please try again.'
    };
  }
}

module.exports = { executeToolCall };
