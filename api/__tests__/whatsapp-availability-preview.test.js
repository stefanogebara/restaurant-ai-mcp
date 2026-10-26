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
