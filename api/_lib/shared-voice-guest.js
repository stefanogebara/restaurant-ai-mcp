'use strict';

// A phone number from the native call is routing context, not sufficient guest
// proof. Never discover a confirmation code by name/phone in this adapter.
const SECURE_CODE = /^RES-\d{8}-[A-Za-z0-9_-]{12}$/;
const E164 = /^\+[1-9]\d{7,14}$/;
const ACTIONS = new Set(['lookup_reservation', 'modify_reservation', 'cancel_reservation']);

function guestProof(data, context) {
  if (!data || typeof data !== 'object' || !context) return null;
  const code = typeof data.reservation_id === 'string' ? data.reservation_id.trim() : '';
  if (!E164.test(context.callerNumber || '') || !SECURE_CODE.test(code)) return null;
  const phones = [data.phone, data.customer_phone, data.caller_phone, data.sender_phone].filter(v => v !== undefined);
  if (phones.some(v => v !== context.callerNumber) || data.customer_email) return null;
  return { reservationId: code, customerPhone: context.callerNumber };
}

async function runGuestAction({ action, data, context, restaurantId, conversationId, conversationLogger }) {
  const proof = guestProof(data, context);
  if (!ACTIONS.has(action) || !proof || !restaurantId) {
    return { success: false, verification_required: true,
      message: 'Please provide the complete confirmation code from your receipt. If it is unavailable, contact the restaurant for help.' };
  }
  const service = require('./reservation-mutations');
  const args = { restaurantId, ...proof };
  let result;
  if (action === 'lookup_reservation') {
    result = await service.verifyGuestReservation(args);
  } else if (action === 'modify_reservation') {
    result = await service.modifyGuestReservation({ ...args,
      newDate: data.new_date ?? data.date,
      newTime: data.new_time ?? data.time,
      newPartySize: data.new_party_size ?? data.party_size });
  } else {
    result = await service.cancelGuestReservation(args);
  }
  if (conversationId && conversationLogger) {
    // Omit phone/code from parameters. The verified reservation is sufficient
    // to link the result; failed verification exposes no booking facts.
    await conversationLogger.logToolCall(conversationId, {
      tool_name: action, parameters: {}, success: result.success === true,
      result: result.success ? { changed: result.changed === true } : undefined,
    });
    if (result.success === true && result.changed === true && action !== 'lookup_reservation') {
      await conversationLogger.updateConversation(conversationId, {
        reservation_id: result.reservation.reservation_id,
        outcome: action === 'modify_reservation' ? 'reservation_modified' : 'reservation_cancelled',
        successful_booking: false,
      });
    }
  }
  return result;
}

module.exports = { ACTIONS, guestProof, runGuestAction };
