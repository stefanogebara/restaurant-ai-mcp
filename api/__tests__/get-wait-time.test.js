'use strict';

// Audit 2026-11-11, F6: /api/get-wait-time read `record.fields.Time` (the old
// Airtable shape). Current records carry `time`, so the endpoint threw for any
// restaurant with a booking today (live: success:false for the CI sandbox), and
// the voice agents' get_wait_time tool always failed. "Now" and "today" also
// came from the server zone (UTC): at 16:00 in São Paulo it reported peak hour.

const mockGetReservations = jest.fn();
jest.mock('../_lib/supabase', () => ({
  getReservations: (...a) => mockGetReservations(...a),
  getRestaurantInfo: jest.fn(() => Promise.resolve({ success: true,
    data: { records: [{ id: 'r-1', fields: { 'Restaurant Name': 'Casa', Timezone: 'America/Sao_Paulo' } }] } })),
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ capacity: 4 }, { capacity: 4 }], error: null }) }) }) }) },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn(() => Promise.resolve({ user: null })) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn(() => Promise.resolve(false)) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn(() => false) }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

const handler = require('../get-wait-time');
const call = async () => {
  const res = { status: jest.fn(function s() { return this; }), json: jest.fn(function j() { return this; }), end: jest.fn() };
  await handler({ method: 'GET', query: { restaurant_id: 'r-1' }, headers: {} }, res);
  return { status: res.status.mock.calls[0]?.[0] ?? 200, body: res.json.mock.calls[0][0] };
};
const originalTz = process.env.TZ;

beforeEach(() => {
  process.env.TZ = 'UTC';
  jest.useFakeTimers({ now: new Date('2026-11-24T19:00:00Z') }); // 16:00 in São Paulo
  mockGetReservations.mockReset();
});
afterAll(() => {
  jest.useRealTimers();
  if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
});

test('works when the restaurant has bookings today, and asks for the LOCAL date', async () => {
  mockGetReservations.mockResolvedValue({ success: true, data: { records: [
    { time: '17:00:00', status: 'confirmed' }, { time: '17:30:00', status: 'Confirmed' }, { time: '17:45:00', status: 'cancelled' },
  ] } });
  const { status, body } = await call();
  expect(status).toBe(200);
  expect(body.success).toBe(true);
  expect(mockGetReservations).toHaveBeenCalledWith('r-1', { date: '2026-11-24' });
});

test('peak hour follows the restaurant clock (16:00 local is not peak)', async () => {
  mockGetReservations.mockResolvedValue({ success: true, data: { records: [] } });
  const { body } = await call();
  expect(body.is_peak_hour).toBe(false);
  expect(body.estimated_wait_minutes).toBe(10);
});

test('cancelled bookings do not count toward occupancy', async () => {
  mockGetReservations.mockResolvedValue({ success: true, data: { records: [
    { time: '16:30:00', status: 'cancelled' }, { time: '16:45:00', status: 'cancelled' }, { time: '17:00:00', status: 'no_show' },
    { time: '17:15:00', status: 'cancelled' }, { time: '17:30:00', status: 'cancelled' }, { time: '17:45:00', status: 'cancelled' },
    { time: '17:50:00', status: 'cancelled' },
  ] } });
  const { body } = await call();
  expect(body.estimated_wait_minutes).toBe(10);
});
