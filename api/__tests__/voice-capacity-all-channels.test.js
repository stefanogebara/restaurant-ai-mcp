'use strict';

// Audit 2026-11-11, F2: the voice capacity check (canAccommodateParty) only
// looked at bookings that carried table_ids, and only at exact 'confirmed' /
// 'seated'. WhatsApp and portal bookings carry no table, so a restaurant filled
// through WhatsApp still accepted voice bookings: 12 guests in 8 seats.
// The rule must match book_whatsapp_reservation: every seat-holding booking
// from any channel, over the neighbouring days, against total active capacity.

const mockTables = [];
let mockBookings = [];
let mockBookingError = null;
const mockQueries = [];

jest.mock('../_lib/db/clients', () => {
  const query = table => {
    const filters = [];
    const chain = {
      select: () => chain,
      eq: (c, v) => { filters.push(['eq', c, v]); return chain; },
      gte: (c, v) => { filters.push(['gte', c, v]); return chain; },
      lte: (c, v) => { filters.push(['lte', c, v]); return chain; },
      in: (c, v) => { filters.push(['in', c, v]); return chain; },
      order: () => chain,
      then: (resolve, reject) => {
        mockQueries.push({ table, filters });
        const result = table === 'tables'
          ? { data: mockTables, error: null }
          : { data: mockBookingError ? null : mockBookings, error: mockBookingError };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  };
  return {
    supabase: { from: query },
    handleSupabaseResponse: (data, error) => ({ success: false, error: true, message: error?.message }),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
});

const { canAccommodateParty } = require('../_lib/db/tables');

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const table = (id, n) => ({ id, table_number: n, capacity: 4, location: 'Main', is_fixed: false, adjacent_tables: [], combination_group: null });
const booking = (o) => ({ table_ids: [], date: '2026-11-26', time: '19:00:00', party_size: 4, status: 'confirmed', ...o });
const ask = (party, time = '19:00') => canAccommodateParty('r-1', party, { date: '2026-11-26', time, durationMinutes: 90 });

beforeEach(() => {
  mockTables.length = 0;
  mockTables.push(table(T1, 1), table(T2, 2));
  mockBookings = [];
  mockBookingError = null;
  mockQueries.length = 0;
});

describe('canAccommodateParty counts every channel', () => {
  test('a WhatsApp booking without tables fills the room (the reproduced overbooking)', async () => {
    mockBookings = [booking({ party_size: 8 })];
    const r = await ask(4);
    expect(r.can_accommodate).toBe(false);
    expect(r.seats_available).toBe(0);
  });

  test('pending and legacy capitalised statuses hold seats', async () => {
    mockBookings = [booking({ status: 'pending' }), booking({ status: 'Confirmed' })];
    expect((await ask(1)).can_accommodate).toBe(false);
  });

  test('a late booking from the previous day that runs past midnight holds seats', async () => {
    mockBookings = [booking({ date: '2026-11-25', time: '23:30:00', party_size: 8 })];
    expect((await ask(2, '00:30')).can_accommodate).toBe(false);
  });

  test('cancelled, completed and no-show bookings do not hold seats', async () => {
    mockBookings = [booking({ status: 'cancelled', party_size: 8 }), booking({ status: 'completed' }), booking({ status: 'no_show' })];
    const r = await ask(8);
    expect(r.can_accommodate).toBe(true);
    expect(r.table_ids.sort()).toEqual([T1, T2].sort());
  });

  test('a non-overlapping booking leaves the slot free', async () => {
    mockBookings = [booking({ time: '21:00:00', party_size: 8 })];
    expect((await ask(8, '19:00')).can_accommodate).toBe(true);
  });

  test('assigned tables are still excluded and the rest is offered', async () => {
    mockBookings = [booking({ table_ids: [T1], party_size: 4 })];
    const r = await ask(4);
    expect(r.can_accommodate).toBe(true);
    expect(r.table_ids).toEqual([T2]);
  });

  test('a party size sent as text is added, not concatenated', async () => {
    mockBookings = [booking({ party_size: 4 })];
    const r = await canAccommodateParty('r-1', '4', { date: '2026-11-26', time: '19:00', durationMinutes: 90 });
    expect(r.can_accommodate).toBe(true);
  });

  test('an unreadable calendar fails closed instead of looking empty', async () => {
    mockBookingError = { message: 'timeout' };
    const r = await ask(2);
    expect(r.success).toBe(false);
    expect(r.can_accommodate).toBe(false);
  });

  test('reads the previous, same and next day for this restaurant only', async () => {
    await ask(2);
    const q = mockQueries.find(x => x.table === 'reservations');
    expect(q.filters).toEqual(expect.arrayContaining([
      ['eq', 'restaurant_id', 'r-1'], ['gte', 'date', '2026-11-25'], ['lte', 'date', '2026-11-27'],
    ]));
  });
});
