'use strict';

let mockReservations = [];
let mockTableResult = { data: [{ capacity: 4 }], error: null };
let mockQueries = [];

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: table => {
      const query = {};
      for (const method of ['select', 'eq', 'in', 'gte', 'lte']) query[method] = jest.fn().mockReturnValue(query);
      mockQueries.push({ table, query });
      query.then = (resolve, reject) => Promise.resolve(
        table === 'tables' ? mockTableResult : { data: mockReservations, error: null },
      ).then(resolve, reject);
      return query;
    },
  },
  canAccommodateParty: jest.fn().mockResolvedValue({
    success: true, can_accommodate: true, method: 'single',
    total_capacity: 4, table_numbers: [1],
  }),
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

beforeEach(() => {
  mockReservations = [];
  mockTableResult = { data: [{ capacity: 4 }], error: null };
  mockQueries = [];
});

test('offers a provisional slot when seats are free', async () => {
  const result = await executeTool('check_availability', request, session);
  expect(result).toMatchObject({ success: true, available: true, provisional: true });
});

test('an overlapping later reservation consumes capacity', async () => {
  mockReservations = [{ date: '2099-01-01', time: '19:30', party_size: 4, status: 'confirmed' }];
  const result = await executeTool('check_availability', request, session);
  expect(result).toMatchObject({ success: true, available: false });
});

test('an overlapping previous-day reservation consumes capacity after midnight', async () => {
  mockReservations = [{ date: '2099-01-01', time: '23:30', party_size: 4, status: 'confirmed' }];
  const result = await executeTool('check_availability', {
    date: '2099-01-02', time: '00:15', party_size: 2,
  }, session);
  expect(result).toMatchObject({ success: true, available: false });
  const read = mockQueries.find(({ table }) => table === 'reservations').query;
  expect(read.gte).toHaveBeenCalledWith('date', '2099-01-01');
  expect(read.lte).toHaveBeenCalledWith('date', '2099-01-03');
});

test('non-overlapping bookings do not consume the requested slot', async () => {
  mockReservations = [{ date: '2099-01-01', time: '21:00', party_size: 4, status: 'confirmed' }];
  const result = await executeTool('check_availability', request, session);
  expect(result).toMatchObject({ success: true, available: true });
});

test('the restaurant dining duration defines the overlap window', async () => {
  mockReservations = [{ date: '2099-01-01', time: '20:30', party_size: 4, status: 'confirmed' }];
  const result = await executeTool('check_availability', request, session, {
    averageDiningDurationMinutes: 120,
  });
  expect(result).toMatchObject({ success: true, available: false });
});

test('a failed table read cannot invent spare seats', async () => {
  mockTableResult = { data: null, error: { message: 'tables unavailable' } };
  const result = await executeTool('check_availability', request, session);
  expect(result.success).toBe(false);
});

test('zero configured seats is not a 30-seat fallback', async () => {
  mockTableResult = { data: [], error: null };
  const result = await executeTool('check_availability', request, session);
  expect(result).toMatchObject({ success: true, available: false });
});

test('invalid calendar dates fail before any database read', async () => {
  const result = await executeTool('check_availability', {
    date: '2099-02-30', time: '19:00', party_size: 2,
  }, session);
  expect(result.success).toBe(false);
  expect(mockQueries).toHaveLength(0);
});

describe('the past and the restaurant limits, as the booking function checks them (15/11/2026)', () => {
  // Clock: 2026-11-10T12:00Z, restaurant zone UTC -> the 30-day window ends 2026-12-10.
  const limited = { timezone: 'UTC', reservationSettings: { advance_booking_days: 30, max_party_size: 6 } };
  const ask = (input, inbound = limited) => executeTool('check_availability', { date: '2026-11-20', time: '19:00', party_size: 2, ...input }, session, inbound);
  beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-10T12:00:00Z') }); });
  afterEach(() => { jest.useRealTimers(); });

  test.each([
    ['a time already passed today', { date: '2026-11-10', time: '11:00' }, 'PAST_DATE', /already passed\. Today at the restaurant is Tuesday, 2026-11-10/],
    ['the first day past the window', { date: '2026-12-11' }, 'TOO_FAR', /up to 30 days in advance/],
    ['a party above the restaurant limit', { party_size: 7 }, 'PARTY_TOO_LARGE', /up to 6 guests/],
  ])('%s is not offered, before any database read', async (_, input, reason, message) => {
    const result = await ask(input);
    expect(result).toMatchObject({ success: true, available: false, provisional: true, reason });
    expect(result.message).toMatch(message);
    expect(mockQueries).toHaveLength(0);
  });

  test('the last day of the window and the party limit itself are offered', async () => {
    expect(await ask({ date: '2026-12-10', party_size: 4 })).toMatchObject({ success: true, available: true });
  });

  test('the zone comes from the session restaurant when the inbound context has none', async () => {
    const zoned = { restaurant: { ...session.restaurant, timezone: 'UTC', reservation_settings: { advance_booking_days: 30 } } };
    const result = await executeTool('check_availability', { date: '2026-12-11', time: '19:00', party_size: 2 }, zoned, {});
    expect(result).toMatchObject({ available: false, reason: 'TOO_FAR' });
  });

  test('without stored limits there is no window; an unknown zone leaves the time checks to the booking', async () => {
    expect(await ask({ date: '2027-06-01' }, { timezone: 'UTC' })).toMatchObject({ available: true });
    expect(await ask({ date: '2026-11-10', time: '11:00' }, { timezone: 'Mars/Olympus', reservationSettings: limited.reservationSettings }))
      .toMatchObject({ success: true, available: true });
  });

  test('every seat-holding status is read, as the booking function counts them', async () => {
    await ask({});
    const read = mockQueries.find(({ table }) => table === 'reservations').query;
    expect(read.in).toHaveBeenCalledWith('status', expect.arrayContaining(['confirmed', 'seated', 'pending', 'Confirmed', 'Seated', 'Pending']));
  });
});
