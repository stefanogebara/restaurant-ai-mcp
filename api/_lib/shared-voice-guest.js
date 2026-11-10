'use strict';

// A phone number from the native call is routing context, not sufficient guest
// proof. Never discover a confirmation code by name/phone in this adapter.
const SECURE_CODE = /^RES-\d{8}-[A-Za-z0-9_-]{12}$/;
const E164 = /^\+[1-9]\d{7,14}$/;
const ACTIONS = new Set(['lookup_reservation', 'modify_reservation', 'cancel_reservation']);
const NATO = new Map(Object.entries({
  alpha: 'a', alfa: 'a', bravo: 'b', charlie: 'c', delta: 'd', echo: 'e', foxtrot: 'f', golf: 'g', hotel: 'h', india: 'i',
  juliett: 'j', kilo: 'k', lima: 'l', mike: 'm', november: 'n', oscar: 'o', papa: 'p', quebec: 'q',
  romeo: 'r', sierra: 's', tango: 't', uniform: 'u', victor: 'v', whiskey: 'w', 'x-ray': 'x', yankee: 'y', zulu: 'z',
}));
const CASE_WORDS = new Map([
  ...['uppercase', 'maiúscula', 'maiuscula', 'mayúscula', 'mayuscula'].map(word => [word, 'uppercase']),
  ...['lowercase', 'minúscula', 'minuscula'].map(word => [word, 'lowercase']),
]);
const DIGIT_MARKERS = new Set(['digit', 'dígito', 'digito']);
const HYPHENS = new Set(['hyphen', 'hífen', 'hifen', 'guion', 'guión']);
const UNDERSCORES = new Set(['underscore', 'sublinhado']);
const DIGITS = new Map([
  ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'],
  ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'],
].flatMap(words => words.map((word, i) => [word, String(i)])));

function digit(token) {
  return /^[0-9]$/.test(token || '') ? token : DIGITS.get(token);
}

// This is an alternate encoding of the SAME full opaque code, never a search,
// correction or shortened proof. Known EN/PT/ES dictionary words use NFC and
// case-insensitive matching. Letter/NATO operands remain raw ASCII only.
// Every letter needs an explicit case word, even a single ASCII letter. A digit
// may be 0..9/a listed number word, with an optional listed digit marker.
function decodeReservationCodeSpelling(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1500) return null;
  const tokens = value.split(/[\s,;.]+/).filter(Boolean);
  if (!tokens.length) return null;
  const words = tokens.map(token => token.normalize('NFC').toLowerCase());
  let decoded = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = words[i];
    const letterCase = CASE_WORDS.get(token);
    let character;
    if (letterCase) {
      const next = tokens[++i];
      // Do not normalize or transliterate an opaque letter or NATO operand:
      // e.g. NFC can turn a Kelvin-sign lookalike into ASCII K.
      if (!next || !/^[A-Za-z-]+$/.test(next)) return null;
      const letter = /^[A-Za-z]$/.test(next) ? next.toLowerCase() : NATO.get(next.toLowerCase());
      if (!letter) return null;
      character = letterCase === 'uppercase' ? letter.toUpperCase() : letter;
    } else if (DIGIT_MARKERS.has(token)) {
      character = digit(words[++i]);
    } else if ((token === 'guion' || token === 'guión') && words[i + 1] === 'bajo') {
      character = '_';
      i++;
    } else if (HYPHENS.has(token)) character = '-';
    else if (UNDERSCORES.has(token)) character = '_';
    else character = digit(token);
    if (character === undefined) return null;
    decoded += character;
    if (decoded.length > 25) return null;
  }
  return SECURE_CODE.test(decoded) ? decoded : null;
}

function guestIdentity(data, context) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !context ||
      typeof context.callerNumber !== 'string' || !E164.test(context.callerNumber)) return false;
  const phones = [data.phone, data.customer_phone, data.caller_phone, data.sender_phone].filter(v => v !== undefined);
  return !phones.some(v => v !== context.callerNumber) && !data.customer_email;
}

function guestProof(data, context) {
  if (!guestIdentity(data, context)) return null;
  const literal = Object.hasOwn(data, 'reservation_id');
  const spelled = Object.hasOwn(data, 'reservation_code_spelling');
  if (literal === spelled) return null; // Exactly one representation, never reconcile two.
  const code = spelled ? decodeReservationCodeSpelling(data.reservation_code_spelling)
    : typeof data.reservation_id === 'string' ? data.reservation_id.trim() : null;
  if (!code || !SECURE_CODE.test(code)) return null;
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
    if (result.success === true) {
      // Enrich Calls only from the verified row, never model parameters. Keep
      // the stored name's case/diacritics and omit invalid or absent metadata.
      const updates = {};
      const name = result.reservation?.customer_name, party = result.reservation?.party_size;
      if (typeof name === 'string' && name.trim() && name.length <= 100 && !/[\u0000-\u001f\u007f]/u.test(name)) {
        updates.customer_name = name;
      }
      if (Number.isSafeInteger(party) && party >= 1 && party <= 100) updates.party_size = party;
      if (result.changed === true && action !== 'lookup_reservation') {
        Object.assign(updates, {
          reservation_id: result.reservation.reservation_id,
          outcome: action === 'modify_reservation' ? 'reservation_modified' : 'reservation_cancelled',
          successful_booking: false,
        });
      }
      if (Object.keys(updates).length) await conversationLogger.updateConversation(conversationId, updates);
    }
  }
  return result;
}

module.exports = { ACTIONS, decodeReservationCodeSpelling, guestIdentity, guestProof, runGuestAction };
