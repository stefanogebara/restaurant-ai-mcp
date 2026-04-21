// Reservation tool definitions and execution for WhatsApp AI agent

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const { getRestaurantByName, getAllActiveRestaurants } = require('../../_lib/restaurant-registry');
const { canAccommodateParty, supabaseAdmin } = require('../../_lib/supabase');
const { trackUsage } = require('../../_lib/usage-tracking');
const { generateSecureReservationId } = require('../../_lib/secure-id');
const {
  setSessionRestaurant,
} = require('../../_lib/whatsapp-sessions');
const { sendTemplateMessage, sendInteractiveButtonMessage } = require('./message-sender');
const { sendReservationConfirmationEmail } = require('../../_lib/email');
const { addCustomerToQueue, checkQueuePosition } = require('./waitlist-handler');

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
            description: 'Phone number of the customer. Use the sender WhatsApp number from context if available.'
          },
          customer_email: {
            type: 'string',
            description: 'Email address of the customer (optional, for sending confirmation email)'
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
  },
  {
    type: 'function',
    function: {
      name: 'join_waitlist',
      description: 'Add a customer to the restaurant\'s walk-in queue/waitlist. Use this when someone wants to join the fila/queue/lista de espera. This is NOT for reservations — it\'s for customers who want to wait for a table right now.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: {
            type: 'string',
            description: 'The customer\'s name'
          },
          party_size: {
            type: 'integer',
            description: 'Number of guests in the party'
          }
        },
        required: ['customer_name', 'party_size']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_active_promotions',
      description: 'Get active promotions and discount coupons available at the restaurant. Use when the customer asks about promotions, discounts, coupons, or deals.',
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
      name: 'check_queue_position',
      description: 'Check a customer\'s current position in the queue/waitlist. Use when someone asks about their position, wait time, or says \'posição\', \'posicao\', \'quanto falta\'.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

/**
 * Resolve the restaurant object from session.
 * Handles the case where the Supabase JOIN returns null but restaurant_id FK is set.
 * @param {object} session
 * @returns {Promise<object|null>}
 */
async function resolveSessionRestaurant(session) {
  if (session?.restaurant) return session.restaurant;
  if (!session?.restaurant_id) return null;
  try {
    const restaurants = await getAllActiveRestaurants();
    return restaurants.find(r => r.id === session.restaurant_id) || null;
  } catch (_) {
    return null;
  }
}

/**
 * Execute a tool call
 */
async function executeTool(toolName, toolInput, session) {
  logger.info(` Executing tool: ${toolName}`, toolInput);

  // Normalize session: if JOIN returned null but FK is set, resolve from registry.
  // This handles the case where the Supabase restaurant_registry JOIN silently fails.
  if (!session?.restaurant && session?.restaurant_id) {
    const resolved = await resolveSessionRestaurant(session);
    if (resolved) session = { ...session, restaurant: resolved };
  }

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
        const client = supabaseAdmin;
        if (!client) {
          return { success: false, error: 'Could not connect to restaurant database' };
        }

        const { date, time, party_size } = toolInput;

        // Get reservations for that date/time (scoped to this restaurant)
        const { data: reservations, error } = await client
          .from('reservations')
          .select('id, time, party_size, status')
          .eq('restaurant_id', session.restaurant.id)
          .eq('date', date)
          .in('status', ['confirmed', 'seated']);

        if (error) {
          logger.error(' Availability check error:', error);
          return { success: false, error: 'Could not check availability' };
        }

        // Check if party can be accommodated using date/time-aware table logic
        const accommodationResult = await canAccommodateParty(session.restaurant.id, party_size, { date, time });

        if (!accommodationResult.success) {
          return { success: false, error: 'Could not check table availability' };
        }

        // Check for time conflicts with existing reservations
        const bookedAtTime = reservations?.filter(r => r.time === time) || [];
        const bookedSeats = bookedAtTime.reduce((sum, r) => sum + (r.party_size || 0), 0);

        // Get total capacity to check overall availability (scoped to this restaurant)
        const { data: allTables } = await client
          .from('tables')
          .select('capacity')
          .eq('restaurant_id', session.restaurant.id)
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
            message = `Yes, we have availability for ${party_size} guests on ${date} at ${time}. We can seat you at Tables ${(accommodationResult.table_numbers || []).join(' + ')} (${accommodationResult.total_capacity} seats combined).`;
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
        const client = supabaseAdmin;
        if (!client) {
          return { success: false, error: 'Could not connect to restaurant database' };
        }

        const { date, time, party_size, customer_name, customer_email, special_requests } = toolInput;
        // Use provided phone or fall back to sender's WhatsApp number
        const customer_phone = toolInput.customer_phone || session?.sender_phone;

        if (!customer_phone) {
          return { success: false, error: 'Customer phone number is required' };
        }

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
        const restLang = session.restaurant?.language || 'en';
        const dateLocaleMap = { 'pt-BR': 'pt-BR', pt: 'pt-BR', es: 'es-ES', en: 'en-US' };
        const dateLocale = dateLocaleMap[restLang] || 'en-US';
        const formattedDate = new Date(date).toLocaleDateString(dateLocale, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const formattedTime = new Date(`2000-01-01 ${time}`).toLocaleTimeString(dateLocale, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: restLang === 'en'
        });

        // WhatsApp template language codes use underscore format (pt_BR, not pt-BR or pt)
        const templateLangMap = { 'pt-BR': 'pt_BR', pt: 'pt_BR', es: 'es', en: 'en' };
        const templateLang = templateLangMap[session.restaurant?.language] || 'en';
        const templateResult = await sendTemplateMessage(
          customer_phone,
          'reservation_confirmed',
          templateLang,
          [
            customer_name,
            session.restaurant.restaurant_name,
            formattedDate,
            formattedTime,
            party_size.toString()
          ]
        );
        logger.info(' Template confirmation result:', templateResult);

        // Send email confirmation if customer provided an email
        if (customer_email) {
          try {
            await sendReservationConfirmationEmail({
              customerEmail: customer_email,
              customerName: customer_name,
              restaurantName: session.restaurant.restaurant_name,
              reservationId,
              partySize: party_size,
              date,
              time,
              specialRequests: special_requests || '',
              language: session.restaurant.language || 'en',
            });
            logger.info(` Confirmation email sent to ${customer_email}`);
          } catch (emailErr) {
            logger.warn(' Email confirmation failed (non-fatal):', emailErr.message);
          }
        }

        // Fetch address for Google Maps link (non-fatal if missing)
        let mapsLine = '';
        try {
          const { data: rConfig } = await client
            .schema('restaurant')
            .from('restaurant_config')
            .select('address, city')
            .eq('id', session.restaurant.id)
            .maybeSingle();
          const addressParts = [rConfig?.address, rConfig?.city].filter(Boolean);
          if (addressParts.length > 0) {
            const mapsQuery = encodeURIComponent(addressParts.join(', '));
            mapsLine = `\n📍 https://maps.google.com/?q=${mapsQuery}`;
          }
        } catch (addrErr) {
          logger.warn(' Could not fetch address for button message (non-fatal):', addrErr.message);
        }

        // Send interactive button message so customer can cancel easily
        // Normalize language: treat 'pt' as 'pt-BR'
        const rawLang = session?.restaurant?.language || 'en';
        const lang = rawLang === 'pt' ? 'pt-BR' : rawLang;
        const buttonConfirmText = {
          'pt-BR': `✅ Reserva confirmada!\n${customer_name} · ${party_size} pessoa${party_size > 1 ? 's' : ''} · ${date} às ${time}${mapsLine}`,
          es: `✅ ¡Reserva confirmada!\n${customer_name} · ${party_size} persona${party_size > 1 ? 's' : ''} · ${date} a las ${time}${mapsLine}`,
          en: `✅ Reservation confirmed!\n${customer_name} · ${party_size} guest${party_size > 1 ? 's' : ''} · ${date} at ${time}${mapsLine}`,
        };
        const cancelLabel = { 'pt-BR': '❌ Cancelar reserva', es: '❌ Cancelar reserva', en: '❌ Cancel reservation' };
        sendInteractiveButtonMessage(
          customer_phone,
          buttonConfirmText[lang] || buttonConfirmText['en'],
          [{ id: `cancel_reservation_${reservationId}`, title: cancelLabel[lang] || cancelLabel['en'] }]
        ).catch(err => logger.warn(' Button message failed (non-fatal):', err.message));

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
        const client = supabaseAdmin;
        if (!client) return { success: false, error: 'Could not connect to restaurant database' };

        let query = client.from('reservations').select('reservation_id, customer_name, customer_phone, date, time, party_size, status, special_requests');

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
        const client = supabaseAdmin;
        if (!client) return { success: false, error: 'Could not connect to restaurant database' };

        // Verify reservation exists
        const { data: existing, error: lookupErr } = await client
          .from('reservations')
          .select('reservation_id, customer_name, date, time, status')
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
        const client = supabaseAdmin;
        if (!client) return { success: false, error: 'Could not connect to restaurant database' };

        const { data: existing, error: lookupErr } = await client
          .from('reservations')
          .select('reservation_id, customer_name, date, time, party_size, status')
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

    case 'join_waitlist': {
      if (!session?.restaurant) {
        return {
          success: false,
          error: 'No restaurant selected. Please identify the restaurant first.'
        };
      }

      const { customer_name, party_size } = toolInput;
      const customerPhone = session?.sender_phone;

      if (!customerPhone) {
        return { success: false, error: 'Could not determine customer phone number.' };
      }

      if (!customer_name || !party_size) {
        return { success: false, error: 'Customer name and party size are required.' };
      }

      try {
        const result = await addCustomerToQueue(
          session.restaurant.id,
          customer_name,
          party_size,
          customerPhone
        );
        return result;
      } catch (err) {
        logger.error(' Join waitlist error:', err);
        return { success: false, error: 'Error adding to waitlist' };
      }
    }

    case 'get_active_promotions': {
      if (!session?.restaurant) {
        return { success: false, error: 'No restaurant selected. Please identify the restaurant first.' };
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabaseAdmin
          .schema('restaurant')
          .from('coupons')
          .select('code, description, discount_type, discount_value, min_order, valid_until')
          .eq('restaurant_id', session.restaurant.id)
          .eq('is_active', true)
          .or(`valid_from.is.null,valid_from.lte.${today}`)
          .or(`valid_until.is.null,valid_until.gte.${today}`)
          .order('created_at', { ascending: false });

        if (error) {
          logger.error(' get_active_promotions error:', error);
          return { success: false, error: 'Could not retrieve promotions' };
        }

        if (!data || data.length === 0) {
          return { success: true, has_promotions: false, promotions: [], message: 'No active promotions at this time.' };
        }

        const promotions = data.map(c => {
          const discountText = c.discount_type === 'percentage'
            ? `${c.discount_value}% off`
            : `R$${c.discount_value} off`;
          return {
            code: c.code,
            description: c.description || discountText,
            discount: discountText,
            min_order: c.min_order,
            valid_until: c.valid_until,
          };
        });

        return {
          success: true,
          has_promotions: true,
          count: promotions.length,
          promotions,
          message: `Found ${promotions.length} active promotion(s).`,
        };
      } catch (err) {
        logger.error(' get_active_promotions error:', err);
        return { success: false, error: 'Error retrieving promotions' };
      }
    }

    case 'check_queue_position': {
      if (!session?.restaurant) {
        return {
          success: false,
          error: 'No restaurant selected. Please identify the restaurant first.'
        };
      }

      const customerPhone = session?.sender_phone;

      if (!customerPhone) {
        return { success: false, error: 'Could not determine customer phone number.' };
      }

      try {
        const result = await checkQueuePosition(
          session.restaurant.id,
          customerPhone
        );
        return result;
      } catch (err) {
        logger.error(' Check queue position error:', err);
        return { success: false, error: 'Error checking queue position' };
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

module.exports = {
  RESERVATION_TOOLS,
  executeTool,
  getCurrentDateTime,
};
