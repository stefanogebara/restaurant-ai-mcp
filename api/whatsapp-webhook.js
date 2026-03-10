// Meta Cloud API WhatsApp webhook
// Webhook URL: https://restaurant-ai-mcp.vercel.app/api/whatsapp-webhook
// Verify token: process.env.WHATSAPP_VERIFY_TOKEN

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
const { isMessageDuplicate, rejectOversizedBody } = require('./_lib/rate-limit');
const {
  getOrCreateSession,
  setSessionRestaurant,
  getSessionByPhone,
  normalizePhoneNumber,
  updateSessionConversationHistory
} = require('./_lib/whatsapp-sessions');
const { getRestaurantByName, getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { getMultiTenantClient } = require('./_lib/multi-tenant-supabase');
const { canAccommodateParty, supabaseAdmin } = require('./_lib/supabase');
const { buildPersonaPrompt } = require('./_lib/persona-prompt-builder');
const { trackUsage } = require('./_lib/usage-tracking');
const { generateSecureReservationId } = require('./_lib/secure-id');
const { extractMemoriesFromWhatsApp } = require('./services/memoryExtractor');
const { buildGuestContext } = require('./services/guestMemory');
const { findPendingFeedbackForPhone, processFeedbackReply } = require('./services/feedbackService');
const { updateDeliveryStatus, handleOptOut } = require('./services/campaignService');

// AI provider: Anthropic Claude
let anthropicClient = null;
function getAnthropic() {
  if (!anthropicClient) {
    const AnthropicModule = require('@anthropic-ai/sdk');
    const Anthropic = AnthropicModule.default || AnthropicModule;
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-20250514';

// WhatsApp API base URL
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

// Message deduplication is handled via Redis (shared across Vercel instances).
// Falls back to allowing the message when Redis is unavailable.
// See api/_lib/rate-limit.js → isMessageDuplicate()

// Per-phone rate limiting (10 messages per minute)
const phoneRateLimits = new Map();
function isRateLimited(phone) {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  let timestamps = phoneRateLimits.get(phone) || [];
  timestamps = timestamps.filter(ts => ts > oneMinuteAgo);
  if (timestamps.length >= 10) return true;
  timestamps.push(now);
  phoneRateLimits.set(phone, timestamps);
  return false;
}
setInterval(() => {
  const oneMinuteAgo = Date.now() - 60 * 1000;
  for (const [phone, timestamps] of phoneRateLimits) {
    const active = timestamps.filter(ts => ts > oneMinuteAgo);
    if (active.length === 0) phoneRateLimits.delete(phone);
    else phoneRateLimits.set(phone, active);
  }
}, 5 * 60 * 1000);

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
      logger.error(' Send error:', { status: response.status, data: JSON.stringify(data) });
      return { success: false, error: data.error?.message || 'Failed to send' };
    }

    logger.info(` Message sent to ${to}, status=${response.status}, msgId=${data.messages?.[0]?.id}, contacts=${JSON.stringify(data.contacts)}`);
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
  },
  {
    type: 'function',
    function: {
      name: 'list_restaurants',
      description: 'List all available restaurants in the platform. Use when the customer has not specified which restaurant.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_reservation',
      description: 'Look up an existing reservation by confirmation number or customer phone number.',
      parameters: {
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
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_reservation',
      description: 'Cancel an existing reservation. Use lookup_reservation first to verify the reservation exists.',
      parameters: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'The reservation confirmation number to cancel'
          }
        },
        required: ['reservation_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'modify_reservation',
      description: 'Modify an existing reservation. Can change date, time, or party size. Use lookup_reservation first.',
      parameters: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'The reservation confirmation number to modify'
          },
          new_date: {
            type: 'string',
            description: 'New date in YYYY-MM-DD format (optional)'
          },
          new_time: {
            type: 'string',
            description: 'New time in HH:MM format (optional)'
          },
          new_party_size: {
            type: 'integer',
            description: 'New party size (optional)'
          }
        },
        required: ['reservation_id']
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
        const accommodationResult = await canAccommodateParty(session.restaurant.id, party_size);

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
        const reservationId = generateSecureReservationId();

        const { data, error } = await client
          .from('reservations')
          .insert({
            reservation_id: reservationId,
            restaurant_id: session.restaurant.id,
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

        // Track usage for metered billing
        if (session.restaurant?.id) {
          trackUsage(session.restaurant.id, 'whatsapp_reservation');
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

    case 'list_restaurants': {
      const restaurants = await getAllActiveRestaurants();
      return {
        success: true,
        count: restaurants.length,
        restaurants: restaurants.map(r => ({
          name: r.restaurant_name,
          id: r.id
        })),
        message: restaurants.length > 0
          ? `We have ${restaurants.length} restaurant(s) available: ${restaurants.map(r => r.restaurant_name).join(', ')}`
          : 'No restaurants are currently available.'
      };
    }

    case 'lookup_reservation': {
      if (!session?.restaurant) {
        return { success: false, error: 'No restaurant selected. Please identify the restaurant first.' };
      }

      const { reservation_id, customer_phone } = toolInput;
      if (!reservation_id && !customer_phone) {
        return { success: false, error: 'Please provide a reservation ID or phone number.' };
      }

      try {
        const client = getMultiTenantClient(session.restaurant);
        if (!client) return { success: false, error: 'Could not connect to restaurant database' };

        let query = client.from('reservations').select('*');

        if (reservation_id) {
          query = query.eq('reservation_id', reservation_id);
        } else {
          const normalizedPhone = customer_phone.replace(/^\+/, '').replace(/\D/g, '');
          const phoneVariants = [normalizedPhone, customer_phone];
          if (normalizedPhone.length >= 11 && normalizedPhone.startsWith('1')) {
            phoneVariants.push(normalizedPhone.slice(1));
          }
          if (normalizedPhone.length === 10) {
            phoneVariants.push('1' + normalizedPhone);
          }
          query = query.in('customer_phone', phoneVariants);
        }

        const { data, error } = await query.order('date', { ascending: false }).limit(5);
        if (error) {
          logger.error(' Lookup error:', error);
          return { success: false, error: 'Could not look up reservation.' };
        }

        if (!data || data.length === 0) {
          return { success: false, error: 'No reservation found with that information.' };
        }

        const reservations = data.map(r => ({
          reservation_id: r.reservation_id,
          customer_name: r.customer_name,
          date: r.date,
          time: r.time,
          party_size: r.party_size,
          status: r.status
        }));

        return {
          success: true,
          count: reservations.length,
          reservations,
          message: reservations.length === 1
            ? `Found reservation ${reservations[0].reservation_id} for ${reservations[0].customer_name} on ${reservations[0].date} at ${reservations[0].time} for ${reservations[0].party_size} guests. Status: ${reservations[0].status}`
            : `Found ${reservations.length} reservations.`
        };
      } catch (err) {
        logger.error(' Lookup error:', err);
        return { success: false, error: 'Error looking up reservation' };
      }
    }

    case 'cancel_reservation': {
      if (!session?.restaurant) {
        return { success: false, error: 'No restaurant selected.' };
      }

      const { reservation_id } = toolInput;
      if (!reservation_id) {
        return { success: false, error: 'Please provide the reservation confirmation number.' };
      }

      try {
        const client = getMultiTenantClient(session.restaurant);
        if (!client) return { success: false, error: 'Could not connect to restaurant database' };

        // Verify reservation exists
        const { data: existing, error: lookupErr } = await client
          .from('reservations')
          .select('*')
          .eq('reservation_id', reservation_id)
          .single();

        if (lookupErr || !existing) {
          return { success: false, error: 'Reservation not found.' };
        }

        if (existing.status === 'cancelled') {
          return { success: false, error: 'This reservation has already been cancelled.' };
        }

        const { error: updateErr } = await client
          .from('reservations')
          .update({ status: 'cancelled' })
          .eq('reservation_id', reservation_id);

        if (updateErr) {
          logger.error(' Cancel error:', updateErr);
          return { success: false, error: 'Could not cancel reservation.' };
        }

        logger.info(` Reservation cancelled: ${reservation_id}`);
        return {
          success: true,
          reservation_id,
          message: `Reservation ${reservation_id} for ${existing.customer_name} on ${existing.date} at ${existing.time} has been cancelled.`
        };
      } catch (err) {
        logger.error(' Cancel error:', err);
        return { success: false, error: 'Error cancelling reservation' };
      }
    }

    case 'modify_reservation': {
      if (!session?.restaurant) {
        return { success: false, error: 'No restaurant selected.' };
      }

      const { reservation_id, new_date, new_time, new_party_size } = toolInput;
      if (!reservation_id) {
        return { success: false, error: 'Please provide the reservation confirmation number.' };
      }

      if (!new_date && !new_time && !new_party_size) {
        return { success: false, error: 'Please specify what to change: new date, time, or party size.' };
      }

      try {
        const client = getMultiTenantClient(session.restaurant);
        if (!client) return { success: false, error: 'Could not connect to restaurant database' };

        const { data: existing, error: lookupErr } = await client
          .from('reservations')
          .select('*')
          .eq('reservation_id', reservation_id)
          .single();

        if (lookupErr || !existing) {
          return { success: false, error: 'Reservation not found.' };
        }

        if (existing.status === 'cancelled') {
          return { success: false, error: 'Cannot modify a cancelled reservation.' };
        }

        const updates = {};
        if (new_date) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(new_date)) {
            return { success: false, error: 'Invalid date format. Use YYYY-MM-DD.' };
          }
          updates.date = new_date;
        }
        if (new_time) {
          if (!/^\d{2}:\d{2}$/.test(new_time)) {
            return { success: false, error: 'Invalid time format. Use HH:MM.' };
          }
          updates.time = new_time;
        }
        if (new_party_size) {
          const size = parseInt(new_party_size, 10);
          if (isNaN(size) || size < 1 || size > 50) {
            return { success: false, error: 'Party size must be between 1 and 50.' };
          }
          updates.party_size = size;
        }

        const { data: updated, error: updateErr } = await client
          .from('reservations')
          .update(updates)
          .eq('reservation_id', reservation_id)
          .select()
          .single();

        if (updateErr) {
          logger.error(' Modify error:', updateErr);
          return { success: false, error: 'Could not modify reservation.' };
        }

        const changes = [];
        if (new_date) changes.push(`date to ${updated.date}`);
        if (new_time) changes.push(`time to ${updated.time}`);
        if (new_party_size) changes.push(`party size to ${updated.party_size}`);

        logger.info(` Reservation modified: ${reservation_id}`, updates);
        return {
          success: true,
          reservation_id,
          message: `Reservation ${reservation_id} updated: ${changes.join(', ')}. New details: ${updated.customer_name}, party of ${updated.party_size} on ${updated.date} at ${updated.time}.`
        };
      } catch (err) {
        logger.error(' Modify error:', err);
        return { success: false, error: 'Error modifying reservation' };
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Call the OpenAI-compatible chat completions endpoint
 */
/**
 * Call Anthropic Claude and return response in OpenAI-compatible format.
 * Converts OpenAI tool format → Anthropic tool format, and response back.
 */
async function callChatCompletions(messages, tools) {
  logger.info(` AI call: model=${AI_MODEL}, provider=anthropic`);

  // Separate system message from conversation messages
  const systemContent = messages.find(m => m.role === 'system')?.content || '';
  const conversationMessages = messages.filter(m => m.role !== 'system');

  // Convert OpenAI messages → Anthropic messages format
  const anthropicMessages = [];
  for (const msg of conversationMessages) {
    if (msg.role === 'user') {
      anthropicMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      // May contain tool_calls from previous round
      if (msg.tool_calls) {
        const content = [];
        if (msg.content) content.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
        anthropicMessages.push({ role: 'assistant', content });
      } else {
        anthropicMessages.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content }],
      });
    }
  }

  // Convert OpenAI tools → Anthropic tools format
  const anthropicTools = (tools || []).map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const response = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: systemContent,
    messages: anthropicMessages,
    tools: anthropicTools.length > 0 ? anthropicTools : undefined,
  });

  // Convert Anthropic response → OpenAI format
  const textBlocks = response.content.filter(b => b.type === 'text');
  const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

  const result = {
    choices: [{
      message: {
        role: 'assistant',
        content: textBlocks.map(b => b.text).join('') || null,
      },
      finish_reason: toolUseBlocks.length > 0 ? 'tool_calls' : 'stop',
    }],
  };

  if (toolUseBlocks.length > 0) {
    result.choices[0].message.tool_calls = toolUseBlocks.map(b => ({
      id: b.id,
      type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input) },
    }));
  }

  return result;
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

  // Build system prompt — use rich per-restaurant persona when available
  let systemPrompt = null;

  if (session?.restaurant?.id) {
    try {
      const { data: restaurantConfig } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('*')
        .eq('id', session.restaurant.id)
        .single();

      if (restaurantConfig) {
        systemPrompt = buildPersonaPrompt(restaurantConfig, { language });
        systemPrompt += `\n\nCurrent date and time: ${currentDateTime.formatted}\nToday is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}\n`;
        systemPrompt += '\nWhatsApp-specific guidelines:\n';
        systemPrompt += '- Keep responses concise (under 500 characters when possible)\n';
        systemPrompt += '- Use plain conversational messages, no bullet points or formatted text\n';
        systemPrompt += `- When they mention "today", use ${currentDateTime.date}\n`;
        systemPrompt += '- When they mention "tomorrow", calculate the next day\n';
        systemPrompt += '- If they give a time like "7pm", convert to 24-hour format (19:00)\n';
        if (languageInstruction) systemPrompt += languageInstruction;
      }
    } catch (configErr) {
      logger.warn('Failed to load restaurant config for prompt (non-fatal):', configErr.message);
    }
  }

  // Fallback to generic prompt
  if (!systemPrompt) {
    systemPrompt = `You are a friendly AI assistant helping customers make restaurant reservations via WhatsApp.
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
  }

  // Inject guest memory context if available
  if (session?.restaurant?.id && session?.sender_phone) {
    try {
      const guestContext = await buildGuestContext(
        session.restaurant.id,
        session.sender_phone,
        userMessage
      );
      if (guestContext) {
        systemPrompt += guestContext;
      }
    } catch (ctxErr) {
      logger.warn('Guest context injection failed (non-fatal):', ctxErr.message);
    }
  }

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

  // With bodyParser disabled, read the raw body for signature verification
  if (req.method === 'POST' && !req.body) {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });
    req._rawBody = Buffer.concat(chunks).toString('utf8');
    try {
      req.body = JSON.parse(req._rawBody);
    } catch {
      req.body = {};
    }
  }

  // Reject oversized payloads (> 1 MB)
  if (rejectOversizedBody(req, res)) return;

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
    if (!appSecret) {
      logger.error('META_APP_SECRET not configured — rejecting unsigned webhook');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      logger.error('Missing X-Hub-Signature-256 header');
      return res.status(403).json({ error: 'Missing signature' });
    }
    const rawBody = req._rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      logger.error('Invalid Meta webhook signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    try {
      const body = req.body;

      // Log incoming webhook (abbreviated to avoid log bloat)
      logger.info(' Webhook POST received, AI config:', {
        model: AI_MODEL,
        provider: 'anthropic',
        apiKeySet: !!process.env.ANTHROPIC_API_KEY,
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

        // Opt-out keywords for marketing campaigns
        if (normalizedText === 'STOP' || normalizedText === 'UNSUBSCRIBE' || normalizedText === 'PARAR') {
          // Opt out from all restaurants (best-effort per-restaurant scoping)
          try {
            const session = await getSessionByPhone(from);
            const restaurantId = session?.restaurant?.id;
            if (restaurantId) {
              await handleOptOut(restaurantId, from);
            }
          } catch (e) {
            logger.error('Opt-out handling error:', e.message);
          }
          await sendWhatsAppMessage(from,
            normalizedText === 'PARAR'
              ? 'Voce foi removido da nossa lista de marketing. Nao recebera mais mensagens promocionais.'
              : 'You have been unsubscribed from marketing messages. You will no longer receive promotional messages from us.'
          );
          return res.status(200).json({ status: 'ok' });
        }

        // Deduplicate: Meta retries on timeout, ignore messages we've already seen
        // Uses Redis so dedup works across all Vercel serverless instances
        const messageId = message.id;
        if (messageId && await isMessageDuplicate(messageId)) {
          logger.info(` Duplicate message ${messageId}, skipping`);
          return res.status(200).json({ status: 'ok' });
        }

        // Rate limit: max 10 messages per minute per phone
        if (isRateLimited(from)) {
          logger.info(` Rate limited ${from}`);
          return res.status(200).json({ status: 'ok' });
        }

        // Check if this is a feedback reply (before normal conversation routing)
        try {
          const pendingFeedback = await findPendingFeedbackForPhone(from);
          if (pendingFeedback) {
            const result = await processFeedbackReply(pendingFeedback.restaurantId, from, messageText);
            if (result) {
              const thankYou = result.rating
                ? `Thank you for your feedback! You rated us ${result.rating}/5.${result.comment ? ' We appreciate your comments.' : ''} We look forward to welcoming you again!`
                : 'Thank you for your feedback! We appreciate you taking the time to share your thoughts.';
              await sendWhatsAppMessage(from, thankYou);
              return res.status(200).json({ status: 'ok' });
            }
          }
        } catch (feedbackErr) {
          logger.error('Feedback reply check failed:', feedbackErr.message);
          // Fall through to normal conversation flow
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
        const conversationHistory = Array.isArray(session.conversation_history) ? session.conversation_history : [];
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
        const updatedHistory = [
          ...conversationHistory,
          { role: 'user', content: messageText },
          { role: 'assistant', content: response }
        ];
        try {
          await updateSessionConversationHistory(session.id, updatedHistory);
        } catch (historyErr) {
          logger.error(' Failed to save conversation history (non-fatal):', historyErr.message);
        }

        // Fire-and-forget memory extraction from WhatsApp conversation
        if (session?.restaurant?.id && updatedHistory.length >= 4) {
          extractMemoriesFromWhatsApp(
            session.restaurant.id,
            from,
            updatedHistory,
            session.id
          ).catch(err => {
            logger.warn('WhatsApp memory extraction failed (non-fatal):', err.message);
          });
        }

        // Send response back via WhatsApp
        logger.info(` Sending response to ${from}`);
        const sendResult = await sendWhatsAppMessage(from, response);
        logger.info(` Send result:`, JSON.stringify(sendResult));

        return res.status(200).json({ status: 'ok' });
      }

      // Process status updates (delivery receipts)
      if (value?.statuses) {
        for (const statusUpdate of value.statuses) {
          logger.info(' Message status update:', {
            id: statusUpdate.id,
            recipientId: statusUpdate.recipient_id,
            status: statusUpdate.status,
            timestamp: statusUpdate.timestamp,
            errors: statusUpdate.errors || null,
          });

          // Route delivery status to campaign tracking (fire-and-forget)
          if (statusUpdate.id && ['delivered', 'read', 'failed'].includes(statusUpdate.status)) {
            updateDeliveryStatus(statusUpdate.id, statusUpdate.status).catch(err => {
              logger.error('Campaign delivery status update failed:', err.message);
            });
          }
        }
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

// Disable Vercel's automatic body parsing so we can access the raw body
// for HMAC signature verification (Meta signs the raw bytes, not re-serialized JSON)
module.exports.config = { api: { bodyParser: false } };
