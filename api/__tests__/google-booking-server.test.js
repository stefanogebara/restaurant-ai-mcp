'use strict';

// Google Booking server: bookings go through the shared guest rules.
// The SQL itself is exercised in scripts/auditoria-reservas/r5-google-parceiros.cjs.
process.env.GOOGLE_BOOKING_SECRET = 'test-google-secret';

const RESTAURANT = '0761e937-6eec-44be-b1d7-34b4209c7f30';
const ROW = '5b0c1f7e-1111-4222-8333-444455556666';
let mockConfig;
let mockExisting;
const mockBook = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

function mockChain(result) {
  const chain = {
    select: () => chain, eq: jest.fn(() => chain), limit: () => Promise.resolve({ error: null }),
    maybeSingle: () => Promise.resolve({ data: result(), error: null }),
  };
  return chain;
}

jest.mock('../_lib/supabase', () => ({
  bookGuestReservation: (...args) => mockBook(...args),
  supabaseAdmin: {
    rpc: (...args) => mockRpc(...args),
    schema: () => ({ from: () => mockChain(() => mockConfig) }),
    from: (table) => { const chain = mockChain(() => mockExisting); mockFrom(table, chain); return chain; },
  },
}));
const mockMutations = {
  modifyGuestReservation: jest.fn(), cancelGuestReservation: jest.fn(), verifyGuestReservation: jest.fn(),
};
jest.mock('../_lib/reservation-mutations', () => mockMutations);

const handler = require('../google-booking/server');

function call({ action, body, token = 'test-google-secret' }) {
  return new Promise(resolve => {
    const res = {
      statusCode: 200, body: undefined,
      setHeader() {}, status(code) { this.statusCode = code; return this; },
      json(obj) { this.body = obj; resolve(this); return this; },
    };
    handler({ method: 'POST', query: { action }, headers: { authorization: `Bearer ${token}` }, body }, res);
  });
}
const slot = (overrides = {}) => ({ merchant_id: RESTAURANT, start_time: '2026-11-19T19:00:00-03:00', resources: { party_size: 4 }, ...overrides });
const guest = { given_name: 'Gil', family_name: 'Google', telephone: '+5511970000099', email: 'gil@example.test' };

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig = { id: RESTAURANT, timezone: 'America/Sao_Paulo' };
  mockExisting = null;
  mockBook.mockReset();
  Object.values(mockMutations).forEach(fn => fn.mockReset());
});

test('a wrong token is refused before any booking', async () => {
  const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: guest }, token: 'wrong' });
  expect(res.statusCode).toBe(401);
  expect(mockBook).not.toHaveBeenCalled();
});

describe('CreateBooking', () => {
  test('books through the shared function in the restaurant local time, with a hashed retry key', async () => {
    mockBook.mockResolvedValue({ success: true, status: 'created', data: { id: ROW } });
    const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: guest, idempotency_token: 'tok-1' } });

    expect(res.statusCode).toBe(200);
    expect(res.body.booking).toEqual(expect.objectContaining({ booking_id: ROW, status: 'CONFIRMED', party_size: 4 }));
    const [restaurantId, fields, options] = mockBook.mock.calls[0];
    expect(restaurantId).toBe(RESTAURANT);
    expect(fields).toEqual(expect.objectContaining({
      source: 'google', date: '2026-11-19', time: '19:00', party_size: 4,
      customer_name: 'Gil Google', customer_phone: '+5511970000099', customer_email: 'gil@example.test',
    }));
    expect(fields.reservation_id).toMatch(/^RES-\d{8}-/);
    expect(options.externalId).toMatch(/^google:v1:[0-9a-f]{64}$/);
  });

  test.each([
    [{ start_sec: '1795125600', start_time: undefined }, '2026-11-19', '19:00'],
    [{ start_time: '2026-11-19T19:00:00' }, '2026-11-19', '19:00'],
    [{ start_time: '2026-11-20T03:00:00Z' }, '2026-11-20', '00:00'],
  ])('slot %p is stored as local %s %s', async (overrides, date, time) => {
    mockBook.mockResolvedValue({ success: true, status: 'created', data: { id: ROW } });
    await call({ action: 'CreateBooking', body: { slot: slot(overrides), user_information: guest } });
    expect(mockBook.mock.calls[0][1]).toEqual(expect.objectContaining({ date, time }));
    expect(mockBook.mock.calls[0][2]).toEqual({});
  });

  test('a retry of the same token returns the first booking', async () => {
    mockBook.mockResolvedValue({ success: false, status: 'existing', data: { id: ROW } });
    const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: guest, idempotency_token: 'tok-1' } });
    expect(res.body.booking).toEqual(expect.objectContaining({ booking_id: ROW, status: 'CONFIRMED' }));
  });

  test('a retry of a booking cancelled since is reported as cancelled', async () => {
    mockBook.mockResolvedValue({ success: false, status: 'cancelled_intent', data: { id: ROW } });
    const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: guest, idempotency_token: 'tok-1' } });
    expect(res.body.booking).toEqual(expect.objectContaining({ booking_id: ROW, status: 'CANCELED' }));
  });

  test.each(['unavailable', 'outside_hours', 'too_late', 'past_slot', 'too_far', 'party_too_large'])(
    'a %s refusal is a SLOT_UNAVAILABLE booking failure', async status => {
      mockBook.mockResolvedValue({ success: false, status, data: { status } });
      const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: guest } });
      expect(res.statusCode).toBe(200);
      expect(res.body.booking_failure.cause).toBe('SLOT_UNAVAILABLE');
      expect(res.body.booking).toBeUndefined();
    });

  test('a booking without a telephone is refused as invalid', async () => {
    mockBook.mockResolvedValue({ success: false, status: 'invalid_input', data: { status: 'invalid_input' } });
    const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: { given_name: 'Gil' } } });
    expect(res.statusCode).toBe(400);
    expect(mockBook.mock.calls[0][1].customer_phone).toBeNull();
  });

  test('an unknown or inactive merchant is 404 with no booking', async () => {
    mockConfig = null;
    const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: guest } });
    expect(res.statusCode).toBe(404);
    expect(mockBook).not.toHaveBeenCalled();
  });

  test.each([{ start_time: 'tomorrow at 7' }, { start_time: '2026-02-30T19:00:00' }, { start_time: undefined }])(
    'an unreadable slot time %p is 400 with no booking', async overrides => {
      const res = await call({ action: 'CreateBooking', body: { slot: slot(overrides), user_information: guest } });
      expect(res.statusCode).toBe(400);
      expect(mockBook).not.toHaveBeenCalled();
    });

  test('a database error is 500, never a confirmation', async () => {
    mockBook.mockResolvedValue({ success: false, status: 'error', error: { message: 'boom' } });
    const res = await call({ action: 'CreateBooking', body: { slot: slot(), user_information: guest } });
    expect(res.statusCode).toBe(500);
    expect(res.body.booking).toBeUndefined();
  });
});

describe('UpdateBooking', () => {
  const google = { id: ROW, restaurant_id: RESTAURANT, reservation_id: 'RES-20261112-GOOGLE000001', customer_phone: '+5511970000099' };
  const ok = status => ({ success: true, changed: true, reservation: { status, party_size: 4 }, error: null });
  const target = { restaurantId: RESTAURANT, reservationId: google.reservation_id, customerPhone: google.customer_phone };

  test('only a booking Google created can be found, and only by source google', async () => {
    mockExisting = null;
    const res = await call({ action: 'UpdateBooking', body: { booking: { booking_id: ROW, status: 'CANCELED' } } });
    expect(res.statusCode).toBe(404);
    const [, chain] = mockFrom.mock.calls.find(([table]) => table === 'reservations');
    expect(chain.eq).toHaveBeenCalledWith('source', 'google');
    expect(mockMutations.cancelGuestReservation).not.toHaveBeenCalled();
  });

  test('another merchant cannot change the booking', async () => {
    mockExisting = google;
    const res = await call({ action: 'UpdateBooking', body: { booking: { booking_id: ROW, merchant_id: 'other', status: 'CANCELED' } } });
    expect(res.statusCode).toBe(404);
    expect(mockMutations.cancelGuestReservation).not.toHaveBeenCalled();
  });

  test('cancel goes through the shared cancel rule', async () => {
    mockExisting = google;
    mockMutations.cancelGuestReservation.mockResolvedValue(ok('cancelled'));
    const res = await call({ action: 'UpdateBooking', body: { booking: { booking_id: ROW, status: 'CANCELED' } } });
    expect(mockMutations.cancelGuestReservation).toHaveBeenCalledWith(target);
    expect(res.body.booking).toEqual(expect.objectContaining({ booking_id: ROW, status: 'CANCELED' }));
  });

  test('a new time goes through the shared change rule in local time', async () => {
    mockExisting = google;
    mockMutations.modifyGuestReservation.mockResolvedValue(ok('confirmed'));
    const res = await call({ action: 'UpdateBooking', body: { booking: { booking_id: ROW, start_time: '2026-11-19T18:30:00-03:00', party_size: 3 } } });
    expect(mockMutations.modifyGuestReservation).toHaveBeenCalledWith({ ...target, newDate: '2026-11-19', newTime: '18:30', newPartySize: 3 });
    expect(res.body.booking.status).toBe('CONFIRMED');
  });

  test('a change onto a full sitting is a SLOT_UNAVAILABLE failure', async () => {
    mockExisting = google;
    mockMutations.modifyGuestReservation.mockResolvedValue({ success: false, changed: false, reservation: null, error: { code: 'unavailable' } });
    const res = await call({ action: 'UpdateBooking', body: { booking: { booking_id: ROW, start_time: '2026-11-19T21:30:00-03:00' } } });
    expect(res.statusCode).toBe(200);
    expect(res.body.booking_failure.cause).toBe('SLOT_UNAVAILABLE');
  });

  test('a CONFIRMED status with no change only verifies', async () => {
    mockExisting = google;
    mockMutations.verifyGuestReservation.mockResolvedValue({ success: true, changed: false, reservation: { status: 'confirmed', party_size: 4 } });
    const res = await call({ action: 'UpdateBooking', body: { booking: { booking_id: ROW, status: 'CONFIRMED' } } });
    expect(mockMutations.verifyGuestReservation).toHaveBeenCalledWith(target);
    expect(mockMutations.modifyGuestReservation).not.toHaveBeenCalled();
    expect(res.body.booking.status).toBe('CONFIRMED');
  });

  test('a booking that can no longer change is a booking failure', async () => {
    mockExisting = google;
    mockMutations.cancelGuestReservation.mockResolvedValue({ success: false, changed: false, reservation: null, error: { code: 'invalid_status' } });
    const res = await call({ action: 'UpdateBooking', body: { booking: { booking_id: ROW, status: 'CANCELED' } } });
    expect(res.body.booking_failure.cause).toBe('CAUSE_UNSPECIFIED');
  });
});

describe('BatchAvailabilityLookup asks the booking rule (check_guest_slots)', () => {
  const lookup = body => call({ action: 'BatchAvailabilityLookup', body: { merchant_id: RESTAURANT, party_size: 2, ...body } });
  // Clock: 2026-11-15T02:30Z = 23:30 on 2026-11-14 in São Paulo: the restaurant's
  // "today" is still the 14th, while the server's UTC date is already the 15th.
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-15T02:30:00Z') });
    mockConfig = { id: RESTAURANT, timezone: 'America/Sao_Paulo', average_dining_duration_minutes: 120,
      reservation_settings: { advance_booking_days: 3 } };
    mockRpc.mockReset().mockImplementation(async (_, args) => ({
      data: { status: 'ok', slots: args.p_starts.map(start => ({
        date: start.slice(0, 10), time: start.slice(11),
        status: start.endsWith('T19:00') ? 'ok' : 'outside_hours', seats_available: 5,
      })) }, error: null }));
  });
  afterEach(() => { jest.useRealTimers(); });

  test('candidates start on the restaurant-local today and stop at its day limit', async () => {
    const res = await lookup({});
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe('check_guest_slots');
    expect(args).toMatchObject({ p_restaurant_id: RESTAURANT, p_party_size: 2 });
    expect(args.p_starts[0]).toBe('2026-11-14T00:00');
    expect(args.p_starts[args.p_starts.length - 1]).toBe('2026-11-17T23:30');
    expect(args.p_starts).toHaveLength(4 * 48);
    expect(res.statusCode).toBe(200);
  });

  test('only slots the rule accepts are offered, with its own seat count and the restaurant duration', async () => {
    const res = await lookup({ slot_time_range: { start_date: '2026-11-16', end_date: '2026-11-16' } });
    expect(res.body.slots).toEqual([{
      merchant_id: RESTAURANT, service_id: 'dining', start_time: '2026-11-16T19:00:00',
      duration_seconds: 7200, available_spots: 2, resources: { party_size: 2 },
    }]);
  });

  test('a range starting in the past starts today instead; a range past the limit is cut', async () => {
    await lookup({ slot_time_range: { start_date: '2026-11-01', end_date: '2026-12-31' } });
    const starts = mockRpc.mock.calls[0][1].p_starts;
    expect(starts[0]).toBe('2026-11-14T00:00');
    expect(starts[starts.length - 1]).toBe('2026-11-17T23:30');
  });

  test('a range wholly past the limit asks nothing and offers nothing', async () => {
    const res = await lookup({ slot_time_range: { start_date: '2026-12-01', end_date: '2026-12-02' } });
    expect(res.body).toEqual({ slots: [] });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test.each([[{ party_size: 0 }], [{ party_size: 2.5 }], [{ party_size: 'two' }], [{ merchant_id: '' }]])(
    'an invalid request %p is 400 with no check', async body => {
      const res = await lookup(body);
      expect(res.statusCode).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
    });

  test('an unknown merchant is 404, and a failed check is 500 with no slots', async () => {
    mockConfig = null;
    expect((await lookup({})).statusCode).toBe(404);
    mockConfig = { id: RESTAURANT, timezone: 'America/Sao_Paulo' };
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const res = await lookup({});
    expect(res.statusCode).toBe(500);
    expect(res.body.slots).toBeUndefined();
  });
});
