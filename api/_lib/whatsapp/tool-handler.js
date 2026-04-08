/**
 * Claude tool call handler for WhatsApp reservation flows.
 * Handles: list_restaurants, select_restaurant, check_availability,
 *          create_reservation, lookup_reservation, cancel_reservation,
 *          modify_reservation.
 * Extracted from twilio-whatsapp-webhook.js (M-23).
 */

const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('WhatsApp:Tools');
const { getRestaurantByName, getAllActiveRestaurants } = require('../restaurant-registry');
const { canAccommodateParty } = require('../supabase');
const { trackUsage } = require('../usage-tracking');
const { setSessionRestaurant } = require('../whatsapp-sessions');
const { parseDate, parseTime, formatDateForDisplay, formatTimeForDisplay } = require('./date-time-utils');
const { sendTemplateMessage } = require('./message-sender');

/**
 * Handle tool calls from Claude
 */
async function handleToolCall(toolName, toolInput, session, supabaseClient, restaurantInfo = null) {
  logger.info(` Tool call: ${toolName}`, toolInput);

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
      const accommodationResult = await canAccommodateParty(restaurantInfo.id, partySize);

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
        logger.error(' Reservation check error:', resError);
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

      logger.info(` Parsed reservation date: "${toolInput.date}" -> "${parsedDate}"`);
      logger.info(` Parsed reservation time: "${toolInput.time}" -> "${parsedTime}"`);

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
        status: 'confirmed',
        source: 'whatsapp_ai'
      };

      // Add restaurant_id if available
      if (restaurantInfo?.id) {
        reservationData.restaurant_id = restaurantInfo.id;
        logger.info(` Linking reservation to restaurant: ${restaurantInfo.restaurant_name} (${restaurantInfo.id})`);
      }

      const { data, error } = await supabaseClient
        .from('reservations')
        .insert(reservationData)
        .select()
        .single();

      if (error) {
        logger.error(' Reservation creation error:', error);
        logger.error(' Insert data was:', { reservation_id: reservationId, customer_name: toolInput.customer_name, customer_phone: customerPhone, date: parsedDate, time: parsedTime, party_size: toolInput.party_size });
        return { success: false, error: error.message };
      }

      logger.info(` Reservation created: ${reservationId} for ${toolInput.customer_name}`);

      // Track usage for metered billing
      if (restaurantInfo?.id) {
        trackUsage(restaurantInfo.id, 'whatsapp_reservation');
      }

      // Send confirmation message to customer (if template contentSid is configured)
      const templateContentSid = process.env.TWILIO_TEMPLATE_RESERVATION_CONFIRMED;
      if (templateContentSid && customerPhone) {
        const displayDate = formatDateForDisplay(parsedDate);
        const displayTime = formatTimeForDisplay(parsedTime);

        await sendTemplateMessage(customerPhone, templateContentSid, {
          '1': toolInput.customer_name,
          '2': restaurantInfo?.restaurant_name || 'our restaurant',
          '3': displayDate,
          '4': displayTime,
          '5': toolInput.party_size.toString()
        });
        logger.info(` Confirmation template sent to ${customerPhone}`);
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
        .select('reservation_id, customer_name, customer_phone, date, time, party_size, status');

      if (reservation_id) {
        query = query.eq('reservation_id', reservation_id);
      } else if (customer_phone) {
        // Generate phone variants to match different storage formats
        const normalizedPhone = customer_phone.replace(/^\+/, '').replace(/\D/g, '');
        const phoneVariants = [normalizedPhone, customer_phone];

        if (normalizedPhone.length >= 11 && normalizedPhone.startsWith('1')) {
          phoneVariants.push(normalizedPhone.slice(1));
        }

        if (normalizedPhone.length === 10) {
          phoneVariants.push('1' + normalizedPhone);
        }

        if (normalizedPhone.length > 10) {
          const last10 = normalizedPhone.slice(-10);
          if (!phoneVariants.includes(last10)) {
            phoneVariants.push(last10);
          }
        }

        logger.info(` lookup_reservation phone variants: ${phoneVariants.join(', ')}`);
        query = query.in('customer_phone', phoneVariants);
      }

      // Filter by restaurant if one is selected
      if (restaurantInfo?.id) {
        query = query.eq('restaurant_id', restaurantInfo.id);
      }

      const { data, error } = await query.order('date', { ascending: false }).limit(5);

      if (error) {
        logger.error(' Lookup error:', error);
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

      logger.info(` Found ${reservations.length} reservation(s)`);
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
        .select('reservation_id, customer_name, customer_phone, date, time, party_size, status')
        .eq('reservation_id', reservation_id);

      if (restaurantInfo?.id) {
        query = query.eq('restaurant_id', restaurantInfo.id);
      }

      const { data: existing, error: lookupError } = await query.single();

      if (lookupError || !existing) {
        logger.error(' Cancel lookup error:', lookupError);
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
        logger.error(' Cancel update error:', updateError);
        return { success: false, error: 'Could not cancel the reservation. Please try again or contact the restaurant directly.' };
      }

      logger.info(` Reservation cancelled: ${reservation_id}`);

      // Send cancellation template if configured
      const cancelTemplateSid = process.env.TWILIO_TEMPLATE_RESERVATION_CANCELLED;
      if (cancelTemplateSid && existing.customer_phone) {
        const displayDate = formatDateForDisplay(existing.date);
        const displayTime = formatTimeForDisplay(existing.time);

        await sendTemplateMessage(existing.customer_phone, cancelTemplateSid, {
          '1': existing.customer_name,
          '2': restaurantInfo?.restaurant_name || 'our restaurant',
          '3': displayDate,
          '4': displayTime
        });
        logger.info(` Cancellation template sent to ${existing.customer_phone}`);
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
        .select('reservation_id, customer_name, date, time, party_size, status')
        .eq('reservation_id', reservation_id);

      if (restaurantInfo?.id) {
        query = query.eq('restaurant_id', restaurantInfo.id);
      }

      const { data: existing, error: lookupError } = await query.single();

      if (lookupError || !existing) {
        logger.error(' Modify lookup error:', lookupError);
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
        logger.error(' Modify update error:', updateError);
        return { success: false, error: 'Could not modify the reservation. Please try again or contact the restaurant directly.' };
      }

      logger.info(` Reservation modified: ${reservation_id}`, updates);

      // Build change summary
      const changes = [];
      if (new_date) changes.push(`date to ${updated.date}`);
      if (new_time) changes.push(`time to ${updated.time}`);
      if (new_party_size) changes.push(`party size to ${updated.party_size}`);

      // Send modification template if configured
      const modifyTemplateSid = process.env.TWILIO_TEMPLATE_RESERVATION_MODIFIED;
      if (modifyTemplateSid && updated.customer_phone) {
        const displayDate = formatDateForDisplay(updated.date);
        const displayTime = formatTimeForDisplay(updated.time);

        await sendTemplateMessage(updated.customer_phone, modifyTemplateSid, {
          '1': updated.customer_name,
          '2': restaurantInfo?.restaurant_name || 'our restaurant',
          '3': displayDate,
          '4': displayTime,
          '5': updated.party_size.toString()
        });
        logger.info(` Modification template sent to ${updated.customer_phone}`);
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

module.exports = { handleToolCall };
