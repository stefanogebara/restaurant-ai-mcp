'use strict';

// WhatsApp check_availability asks the booking rule (check_guest_slots: the
// slot checks of book_guest_reservation) for the requested start and keeps only
// the physical table check (canAccommodateParty). The rule itself is tested
// against Postgres in scripts/auditoria-reservas (r7, r9).
const mockRpc = jest.fn();
const mockCanAccommodate = jest.fn();
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { rpc: (...args) => mockRpc(...args), from: jest.fn() },
  canAccommodateParty: (...args) => mockCanAccommodate(...args),
}));
jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn(), getAllActiveRestaurants: jest.fn(),
}));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn() }));
jest.mock('../_lib/whatsapp-sessions', () => ({ setSessionRestaurant: jest.fn() }));
jest.mock('../_services/whatsapp/message-sender', () => ({
  sendTemplateMessage: jest.fn(), sendInteractiveButtonMessage: jest.fn(),
}));
jest.mock('../_lib/email', () => ({ sendReservationConfirmationEmail: jest.fn() }));
jest.mock('../_services/whatsapp/waitlist-handler', () => ({
  addCustomerToQueue: jest.fn(), checkQueuePosition: jest.fn(),
}));

const { executeTool } = require('../_services/whatsapp/reservation-tools');
const session = { restaurant: { id: 'restaurant-1', average_dining_duration_minutes: 90 } };
const request = { date: '2099-01-01', time: '19:00', party_size: 2 };
const inbound = { timezone: 'UTC', reservationSettings: { advance_booking_days: 30, max_party_size: 6 } };

let mockStatus;
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-10T12:00:00Z') });
  mockStatus = () => ({ status: 'ok', seats_available: 6 });
  mockRpc.mockReset().mockImplementation(async (_, args) => ({
    data: { status: 'ok', slots: args.p_starts.map(start => ({ date: start.slice(0, 10), time: start.slice(11), ...mockStatus(start) })) },
    error: null,
  }));
  mockCanAccommodate.mockReset().mockResolvedValue({
    success: true, can_accommodate: true, method: 'single', total_capacity: 4, table_numbers: [1],
  });
});
afterEach(() => { jest.useRealTimers(); });

test('offers a provisional slot when the rule accepts it and the tables fit', async () => {
  const result = await executeTool('check_availability', request, session, inbound);
  expect(result).toMatchObject({ success: true, available: true, provisional: true });
  expect(result.details.remaining_capacity_at_time).toBe(6);
});

test('asks the rule for exactly the requested start, party and restaurant', async () => {
  await executeTool('check_availability', request, session, inbound);
  expect(mockRpc).toHaveBeenCalledWith('check_guest_slots', {
    p_restaurant_id: 'restaurant-1', p_party_size: 2, p_starts: ['2099-01-01T19:00'],
  });
});

test('the table check uses the restaurant dining duration', async () => {
  await executeTool('check_availability', request, session, { ...inbound, averageDiningDurationMinutes: 120 });
  expect(mockCanAccommodate).toHaveBeenCalledWith('restaurant-1', 2, { date: '2099-01-01', time: '19:00', durationMinutes: 120 });
});

test.each([
  ['past_slot', 'PAST_DATE', /in the past\. Today at the restaurant is Tuesday, 2026-11-10/],
  ['too_far', 'TOO_FAR', /up to 30 days in advance/],
  ['party_too_large', 'PARTY_TOO_LARGE', /up to 6 guests/],
  ['outside_hours', 'CLOSED', /closed at that time/],
  ['too_late', 'TOO_LATE', /after the last seating/],
  ['unavailable', 'FULLY_BOOKED', /19:00 is fully booked for 2 guests/],
])('the rule answer %s is a provisional no with reason %s, and no table check', async (status, reason, message) => {
  mockStatus = () => ({ status, seats_available: status === 'unavailable' ? 1 : undefined });
  const result = await executeTool('check_availability', request, session, inbound);
  expect(result).toMatchObject({ success: true, available: false, provisional: true, reason });
  expect(result.message).toMatch(message);
  expect(mockCanAccommodate).not.toHaveBeenCalled();
});

test('the limits for the wording come from the session restaurant when the inbound context has none', async () => {
  mockStatus = () => ({ status: 'too_far' });
  const zoned = { restaurant: { ...session.restaurant, timezone: 'UTC', reservation_settings: { advance_booking_days: 14 } } };
  const result = await executeTool('check_availability', request, zoned, {});
  expect(result.message).toMatch(/up to 14 days in advance/);
});

test('tables that cannot combine for the party are a no', async () => {
  mockCanAccommodate.mockResolvedValue({ success: true, can_accommodate: false, reason: 'No combination seats 2.' });
  const result = await executeTool('check_availability', request, session, inbound);
  expect(result).toMatchObject({ success: true, available: false });
  expect(result.message).toMatch(/cannot accommodate a party of 2 guests\. No combination seats 2\./);
});

test('a combination names its tables and stays provisional', async () => {
  mockCanAccommodate.mockResolvedValue({ success: true, can_accommodate: true, method: 'combination', table_numbers: [1, 2] });
  const result = await executeTool('check_availability', request, session, inbound);
  expect(result.message).toMatch(/Tables 1 \+ 2\. The slot is confirmed only when the reservation is created\./);
});

test('a failed table read or a failed rule check cannot invent availability', async () => {
  mockCanAccommodate.mockResolvedValue({ success: false });
  expect((await executeTool('check_availability', request, session, inbound)).success).toBe(false);
  mockRpc.mockResolvedValue({ data: null, error: { message: 'down' } });
  const failed = await executeTool('check_availability', request, session, inbound);
  expect(failed.success).toBe(false);
  expect(failed.available).toBeUndefined();
});

test.each([
  ['an impossible calendar date', { date: '2099-02-30' }],
  ['a bad clock time', { time: '7pm' }],
  ['fractional guests', { party_size: 2.5 }],
])('%s fails before asking the rule', async (_, input) => {
  const result = await executeTool('check_availability', { ...request, ...input }, session, inbound);
  expect(result.success).toBe(false);
  expect(mockRpc).not.toHaveBeenCalled();
});
