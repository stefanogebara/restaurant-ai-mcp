/**
 * Quick action keyword handlers for WhatsApp messages.
 * Handles: MODIFY, CANCEL, BOOK, HELP, YES/NO confirmation flows.
 * Extracted from twilio-whatsapp-webhook.js (M-23).
 */

const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('WhatsApp:QuickActions');
const { centralSupabase } = require('../central-supabase');
const { formatDateForDisplay, formatTimeForDisplay } = require('./date-time-utils');
const { buildTwimlResponse } = require('./message-sender');
const { findRecentReservation, updateSessionContext } = require('./reservation-lookup');

/**
 * Try to handle a quick action keyword. Returns a TwiML response string if handled,
 * or null if the message is not a quick action.
 */
async function handleQuickAction(messageTextLower, fromNumber, session) {
  if (messageTextLower === 'modify') {
    return await handleModify(fromNumber, session);
  }

  if (messageTextLower === 'cancel') {
    return await handleCancel(fromNumber, session);
  }

  if (messageTextLower === 'book') {
    return await handleBook(session);
  }

  if (messageTextLower === 'help') {
    return handleHelp();
  }

  // Handle YES/NO responses for pending cancellation
  if ((messageTextLower === 'yes' || messageTextLower === 'no') && session.context?.pendingCancellation) {
    return await handleCancellationConfirmation(messageTextLower, session);
  }

  return null; // Not a quick action
}

async function handleModify(fromNumber, session) {
  const recentReservation = await findRecentReservation(fromNumber, session.restaurantId);
  if (recentReservation) {
    const displayDate = formatDateForDisplay(recentReservation.date);
    const displayTime = formatTimeForDisplay(recentReservation.time);
    const response = `I found your reservation (${recentReservation.reservation_id}) for ${displayDate} at ${displayTime} for ${recentReservation.party_size} guests.\n\nWhat would you like to change?\n\u2022 Date\n\u2022 Time\n\u2022 Party size\n\nJust tell me what you'd like to update.`;
    return buildTwimlResponse(response);
  }
  return buildTwimlResponse("I couldn't find any upcoming reservations for your phone number. Would you like to make a new reservation?");
}

async function handleCancel(fromNumber, session) {
  const recentReservation = await findRecentReservation(fromNumber, session.restaurantId);
  if (recentReservation) {
    const displayDate = formatDateForDisplay(recentReservation.date);
    const displayTime = formatTimeForDisplay(recentReservation.time);
    const response = `I found your reservation (${recentReservation.reservation_id}) for ${displayDate} at ${displayTime} for ${recentReservation.party_size} guests.\n\nAre you sure you want to cancel this reservation?\n\nReply YES to confirm cancellation or NO to keep it.`;

    // Store pending cancellation in session context
    await updateSessionContext(session.id, {
      pendingCancellation: recentReservation.reservation_id
    });

    return buildTwimlResponse(response);
  }
  return buildTwimlResponse("I couldn't find any upcoming reservations for your phone number. Would you like to make a new reservation?");
}

async function handleBook(session) {
  // Clear any pending actions and start fresh reservation flow
  await updateSessionContext(session.id, { pendingCancellation: null });
  return buildTwimlResponse("I'd be happy to help you make a reservation! Please tell me:\n\n\u2022 How many guests?\n\u2022 What date?\n\u2022 What time?");
}

function handleHelp() {
  return buildTwimlResponse("I can help you with:\n\n\u2022 BOOK - Make a new reservation\n\u2022 MODIFY - Change an existing reservation\n\u2022 CANCEL - Cancel a reservation\n\u2022 HELP - Show this menu\n\nOr just tell me what you need and I'll assist you!");
}

async function handleCancellationConfirmation(messageTextLower, session) {
  if (messageTextLower === 'yes') {
    // Perform the cancellation
    const reservationId = session.context.pendingCancellation;
    const { error } = await centralSupabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('reservation_id', reservationId);

    await updateSessionContext(session.id, { pendingCancellation: null });

    if (error) {
      return buildTwimlResponse("Sorry, I had trouble cancelling your reservation. Please try again or contact the restaurant directly.");
    }

    return buildTwimlResponse(`Your reservation (${reservationId}) has been cancelled. We hope to see you again soon!\n\nReply BOOK to make a new reservation.`);
  }

  // User said NO - keep the reservation
  await updateSessionContext(session.id, { pendingCancellation: null });
  return buildTwimlResponse("No problem! Your reservation has been kept. Is there anything else I can help you with?");
}

module.exports = { handleQuickAction };
