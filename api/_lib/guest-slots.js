'use strict';

// The booking rule, asked without booking. public.check_guest_slots runs the
// same slot checks as book_guest_reservation (guest_slot_status: hours per
// service period, notice, the restaurant's day and party limits, seats from
// every channel) for a list of restaurant-local starts, read only. Voice,
// WhatsApp and Google availability ask it, so they cannot offer a time the
// booking then refuses. Physical table combinations are not part of the rule:
// callers still ask canAccommodateParty for that.

const { restaurantTodayHint } = require('./timezone');

/**
 * @param {string} restaurantId
 * @param {number} partySize
 * @param {string[]} starts - 'YYYY-MM-DDTHH:MM', restaurant wall time
 * @returns {Promise<{ ok: boolean, status: string, slots: Array<{ date: string, time: string, status: string, seats_available?: number }> }>}
 *   slots come back in the order asked. status: ok | restaurant_unavailable | invalid_input | error
 */
async function checkGuestSlots(restaurantId, partySize, starts) {
  try {
    const { supabaseAdmin } = require('./supabase');
    const { data, error } = await supabaseAdmin.rpc('check_guest_slots', {
      p_restaurant_id: restaurantId,
      p_party_size: partySize,
      p_starts: starts,
    });
    if (error || !data || typeof data.status !== 'string') return { ok: false, status: 'error', slots: [] };
    if (data.status !== 'ok' || !Array.isArray(data.slots) || data.slots.length !== starts.length) {
      return { ok: false, status: data.status === 'ok' ? 'error' : data.status, slots: [] };
    }
    return { ok: true, status: 'ok', slots: data.slots };
  } catch (_) {
    return { ok: false, status: 'error', slots: [] };
  }
}

/**
 * The guest-facing reason for a refused slot, the same words on every channel.
 * @param {string} status - a guest_slot_status answer other than 'ok'
 * @param {{ timezone?: string, limits?: { advanceBookingDays?: number|null, maxPartySize?: number|null }, partySize?: number, time?: string }} context
 * @returns {{ code: string, message: string }}
 */
function slotRefusal(status, { timezone, limits = {}, partySize, time } = {}) {
  const today = () => restaurantTodayHint(timezone);
  switch (status) {
    case 'past_slot':
      return { code: 'PAST_DATE', message: `The requested date and time is in the past. ${today()}` };
    case 'too_far':
      return {
        code: 'TOO_FAR',
        message: limits.advanceBookingDays != null
          ? `Reservations can only be made up to ${limits.advanceBookingDays} days in advance. ${today()}`
          : `That date is further ahead than the restaurant takes bookings. ${today()}`,
      };
    case 'party_too_large':
      return {
        code: 'PARTY_TOO_LARGE',
        message: limits.maxPartySize != null
          ? `We can accommodate parties up to ${limits.maxPartySize} guests. For larger groups, please call us directly.`
          : 'That party is larger than the restaurant books. For larger groups, please call us directly.',
      };
    case 'outside_hours':
      return { code: 'CLOSED', message: 'The restaurant is closed at that time. Please choose another time.' };
    case 'too_late':
      return { code: 'TOO_LATE', message: 'That time is after the last seating. Please choose an earlier time.' };
    case 'unavailable':
      return {
        code: 'FULLY_BOOKED',
        message: `Sorry, ${time || 'that time'} is fully booked${partySize ? ` for ${partySize} guests` : ''}.`,
      };
    case 'timezone_unavailable':
      return { code: 'TIMEZONE_UNAVAILABLE', message: 'Could not verify the restaurant time zone. Please call the restaurant directly.' };
    default:
      return { code: 'UNAVAILABLE', message: 'That time cannot be booked. Please choose another time.' };
  }
}

module.exports = { checkGuestSlots, slotRefusal };
