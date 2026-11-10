'use strict';

// Internal adapter contract. The phone is transport/verification authority,
// never a phone supplied in model tool arguments. The RPC repeats every guard.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRORS = {
  verification_failed: 'Could not verify that reservation. Please check the full confirmation code.',
  invalid_input: 'Please specify the reservation details to change.',
  invalid_date: 'Please provide a valid date in YYYY-MM-DD format.',
  invalid_time: 'Please provide a valid time in HH:MM format.',
  invalid_party_size: 'Party size must be a whole number between 1 and 100.',
  invalid_status: 'This reservation can no longer be changed through this channel.',
  restaurant_unavailable: 'The restaurant is not available for reservation changes.',
  timezone_unavailable: 'Could not verify the restaurant timezone. No change was made.',
  past_slot: 'That time has passed. Please choose a future time.',
  outside_hours: 'The restaurant is closed at that time. Please choose another time.',
  too_late: 'That time is after the last seating. Please choose an earlier time.',
  too_far: 'That date is beyond the advance-booking window.',
  party_too_large: 'The party exceeds the restaurant booking limit.',
  unavailable: 'No capacity remains for that time. No change was made.',
  mutation_unavailable: 'Could not complete the reservation request. Please check its current details before retrying.',
};

function failure(code) {
  code = Object.hasOwn(ERRORS, code) ? code : 'mutation_unavailable';
  return { success: false, changed: false, reservation: null, error: { code, message: ERRORS[code] } };
}

function phoneDigits(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^\+?[\d ().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function request(action, input) {
  const { restaurantId, reservationId, customerPhone } = input || {};
  const phone = phoneDigits(customerPhone);
  if (typeof restaurantId !== 'string' || !UUID.test(restaurantId) || !phone ||
      typeof reservationId !== 'string' || !reservationId.length || reservationId.length > 120 || /\s/.test(reservationId)) {
    return failure('verification_failed');
  }
  const tenant = restaurantId.toLowerCase();
  const changes = {};
  if (action === 'modify') {
    if (input.newDate !== undefined) {
      if (!validDate(input.newDate)) return failure('invalid_date');
      changes.date = input.newDate;
    }
    if (input.newTime !== undefined) {
      if (typeof input.newTime !== 'string' || input.newTime.length !== 5 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.newTime)) return failure('invalid_time');
      changes.time = input.newTime;
    }
    if (input.newPartySize !== undefined) {
      const size = typeof input.newPartySize === 'string' && input.newPartySize.length > 0 && !/\D/.test(input.newPartySize)
        ? Number(input.newPartySize) : input.newPartySize;
      if (!Number.isSafeInteger(size) || size < 1 || size > 100) return failure('invalid_party_size');
      changes.party_size = size;
    }
    if (!Object.keys(changes).length) return failure('invalid_input');
  }

  try {
    const { supabaseAdmin } = require('./supabase');
    if (!supabaseAdmin) return failure('mutation_unavailable');
    const { data, error } = await supabaseAdmin.rpc('mutate_guest_reservation', {
      p_restaurant_id: tenant, p_customer_phone: phone, p_reservation_id: reservationId,
      p_action: action, p_changes: changes,
    });
    if (error || !data || typeof data.success !== 'boolean') return failure('mutation_unavailable');
    if (!data.success) return failure(data.error?.code);
    const row = data.reservation;
    if (!row || !row.id || row.reservation_id !== reservationId || row.restaurant_id !== tenant ||
        phoneDigits(row.customer_phone) !== phone || typeof data.changed !== 'boolean' ||
        (action === 'verify' && data.changed)) return failure('mutation_unavailable');
    const fields = ['id', 'reservation_id', 'restaurant_id', 'customer_name', 'customer_phone', 'date', 'time',
      'party_size', 'status', 'table_ids', 'special_requests'];
    const reservation = Object.fromEntries(fields.map(key => [key, row[key]]));
    return { success: true, changed: data.changed, reservation, error: null };
  } catch (_) {
    // Never log provider/DB payloads or retry an ambiguously committed mutation.
    return failure('mutation_unavailable');
  }
}

module.exports = {
  verifyGuestReservation: input => request('verify', input),
  modifyGuestReservation: input => request('modify', input),
  cancelGuestReservation: input => request('cancel', input),
};
