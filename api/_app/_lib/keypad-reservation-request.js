'use strict';

const { randomUUID } = require('node:crypto');
const { callbackUrl } = require('./keypad-reservation');
const { guestProof } = require('./shared-voice-guest');

const SANDBOX_RESTAURANT = '0761e937-6eec-44be-b1d7-34b4209c7f30';
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const KEYS = new Set(['reservation_id', 'reservation_code_spelling', 'new_time']);
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' });
const unavailable = { success: false, state: 'unavailable' };

function spokenTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return minutes ? `${hours} horas e ${minutes} minutos` : `${hours} horas`;
}

// The transport binds the grant to the verified inbound leg. The model supplies
// only the receipt and proposed time. It cannot authorize a reservation write.
function createKeypadReservationRequest({ origin, resolveGrant, readReservation, persistAction, fetchCall, redirectCall }) {
  return async function prepare(grant, input) {
    const context = await resolveGrant(grant);
    if (!context || context.restaurantId !== SANDBOX_RESTAURANT) return unavailable;
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => !KEYS.has(key)) ||
        typeof input.new_time !== 'string' || !TIME.test(input.new_time)) return unavailable;
    const proof = guestProof(input, { callerNumber: context.caller });
    if (!proof) return unavailable;

    const booking = await readReservation(context.restaurantId, proof.reservationId);
    if (!booking || booking.restaurant_id !== context.restaurantId || booking.reservation_id !== proof.reservationId ||
        typeof booking.customer_phone !== 'string' || !/^\+?[0-9 ().-]{8,40}$/.test(booking.customer_phone) ||
        booking.customer_phone.replace(/\D/g, '') !== context.caller.slice(1) ||
        !['confirmed', 'pending'].includes(booking.status) || !Number.isSafeInteger(booking.party_size) ||
        booking.party_size < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(booking.date)) return unavailable;
    const currentTime = typeof booking.time === 'string' ? booking.time.slice(0, 5) : '';
    const date = new Date(booking.date + 'T12:00:00Z');
    if (!TIME.test(currentTime) || currentTime === input.new_time || !Number.isFinite(+date) ||
        date.toISOString().slice(0, 10) !== booking.date) return unavailable;

    const call = await fetchCall(context.callSid);
    if (!call || call.accountSid !== context.accountSid || call.sid !== context.callSid ||
        call.from !== context.caller || call.to !== context.called ||
        call.direction !== 'inbound' || call.status !== 'in-progress') return unavailable;

    const id = randomUUID();
    const prepared = await persistAction({
      id, account_sid: context.accountSid, call_sid: call.sid, caller: context.caller, called: context.called,
      restaurant_id: context.restaurantId, reservation_code: proof.reservationId, reservation_snapshot: booking,
      action: 'modify', changes: { time: input.new_time }, expires_at: new Date(Date.now() + 60_000).toISOString(),
      readback: `Sua reserva para ${booking.party_size} ${booking.party_size === 1 ? 'pessoa' : 'pessoas'} no dia ${DATE.format(date)} ` +
        `está marcada para ${spokenTime(currentTime)}. Você pediu para mudar para ${spokenTime(input.new_time)} no mesmo dia. ` +
        'Após esta leitura, pressione um para confirmar ou dois para manter a reserva.',
    });
    if (!prepared) return { success: false, state: 'already_prepared' };

    await redirectCall(call.sid, callbackUrl(origin, id, 'read'));
    return { success: true, state: 'awaiting_keypad', changed: false };
  };
}

module.exports = { createKeypadReservationRequest, SANDBOX_RESTAURANT };
