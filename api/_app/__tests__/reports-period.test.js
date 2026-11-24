const mockVerifyAuth = jest.fn();
const mockRateLimit = jest.fn();
const mockSubscription = jest.fn();
const mockFrom = jest.fn();
const mockSchema = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyAuth: mockVerifyAuth }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: mockRateLimit }));
jest.mock('../_lib/subscription-middleware', () => ({ inlineCheckSubscription: mockSubscription }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: mockFrom, schema: mockSchema },
}));

const handler = require('../reports');
let records;

function query(table) {
  const filters = {};
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn((column, value) => { filters.gte = { column, value }; return builder; }),
    lte: jest.fn((column, value) => { filters.lte = { column, value }; return builder; }),
    lt: jest.fn().mockReturnThis(),
    then: (resolve, reject) => {
      let data = records[table] || [];
      if (table === 'reservations' && filters.gte && filters.lte) {
        data = data.filter(row => row.date >= filters.gte.value && row.date <= filters.lte.value);
      }
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  records = { reservations: [], service_records: [] };
  mockRateLimit.mockResolvedValue(false);
  mockSubscription.mockResolvedValue(false);
  mockVerifyAuth.mockResolvedValue({ user: { restaurant_id: 'restaurant-1' } });
  mockSchema.mockReturnValue({ from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: 'America/Sao_Paulo' }, error: null }) }) }),
  }) });
  mockFrom.mockImplementation(query);
});

test('includes services on the end date in the restaurant time zone', async () => {
  records.service_records = [
    { id: 'at-start', seated_at: '2026-10-05T12:00:00Z', party_size: 2, status: 'completed', reservation_id: null },
    { id: 'late-end', seated_at: '2026-10-13T01:00:00Z', party_size: 3, status: 'completed', reservation_id: null },
    { id: 'next-day', seated_at: '2026-10-13T04:00:00Z', party_size: 9, status: 'completed', reservation_id: null },
  ];
  const res = response();
  await handler({ method: 'GET', query: {
    action: 'weekly', start_date: '2026-10-05', end_date: '2026-10-12',
  } }, res);
  const payload = res.json.mock.calls.at(-1)[0];
  expect(payload.success).toBe(true);
  expect(payload.data.summary.total_covers).toBe(5);
  expect(payload.data.summary.covers_estimated).toBe(false);
});

test('marks reservation-only covers as estimates instead of served guests', async () => {
  records.reservations = [{ id: 'r1', date: '2026-10-12', time: '19:00', party_size: 4, status: 'confirmed' }];
  const res = response();
  await handler({ method: 'GET', query: {
    action: 'weekly', start_date: '2026-10-05', end_date: '2026-10-12',
  } }, res);
  const payload = res.json.mock.calls.at(-1)[0];
  expect(payload.data.summary.total_covers).toBe(4);
  expect(payload.data.summary.covers_estimated).toBe(true);
  expect(payload.data.demographics.repeat_customers).toBe(0);
});

test('omits comparisons when one period uses bookings and the other completed service', async () => {
  records.reservations = [{ id: 'r1', date: '2026-10-12', time: '19:00', party_size: 4, status: 'confirmed' }];
  records.service_records = [{ id: 's1', seated_at: '2026-10-03T14:00:00Z', party_size: 3, status: 'completed', reservation_id: null }];
  const res = response();
  await handler({ method: 'GET', query: {
    action: 'weekly', start_date: '2026-10-05', end_date: '2026-10-12',
  } }, res);
  const payload = res.json.mock.calls.at(-1)[0];
  expect(payload.data.summary.covers_estimated).toBe(true);
  expect(payload.data.summary.covers_comparison_valid).toBe(false);
});

test('rejects impossible ranges before reading operational tables', async () => {
  const res = response();
  await handler({ method: 'GET', query: {
    action: 'weekly', start_date: '2026-02-30', end_date: '2026-03-02',
  } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockFrom).not.toHaveBeenCalled();
});
