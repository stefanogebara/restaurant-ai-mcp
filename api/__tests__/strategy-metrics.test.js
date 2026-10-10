const mockVerifyAuth = jest.fn();
const mockFrom = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyAuth: (...args) => mockVerifyAuth(...args) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: (...args) => mockFrom(...args) } }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/sentry', () => ({ initSentry: jest.fn(), captureException: jest.fn() }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));

const handler = require('../strategy-metrics');

let reservations;
let serviceRecords;
const queries = [];

function query(table) {
  const q = {
    table,
    filters: [],
    select() { return this; },
    eq(field, value) { this.filters.push(['eq', field, value]); return this; },
    gte(field, value) { this.filters.push(['gte', field, value]); return this; },
    not() { return this; },
    order() { return this; },
    then(resolve, reject) {
      const data = table === 'reservations' ? reservations : serviceRecords;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  queries.push(q);
  return q;
}

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function metrics(timezone) {
  mockVerifyAuth.mockResolvedValue({ user: { restaurant_id: 'restaurant-a', timezone } });
  const res = response();
  await handler({ method: 'GET', query: { range: '30' }, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  return res.json.mock.calls[0][0].data;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-01T00:30:00.000Z'));
  jest.clearAllMocks();
  queries.length = 0;
  reservations = [];
  serviceRecords = [];
  mockFrom.mockImplementation(query);
});

afterEach(() => jest.useRealTimers());

test('no-show denominator excludes today and future in restaurant local time', async () => {
  // In Los Angeles the UTC clock is already Oct 1, but service date is Sep 30.
  reservations = [
    { id: 'past-no-show', date: '2026-09-29', status: 'no_show' },
    { id: 'past-completed', date: '2026-09-29', status: 'completed' },
    { id: 'today-confirmed', date: '2026-09-30', status: 'confirmed' },
    { id: 'future-confirmed', date: '2026-10-01', status: 'confirmed' },
  ];

  const data = await metrics('America/Los_Angeles');
  expect(data.summary.no_show_rate).toBe(50);
  expect(data.summary.no_show_sample_size).toBe(2);
  expect(data.summary.total_reservations).toBe(4);
  expect(data.timelines.no_show).toEqual([{ date: '2026-09-29', rate: 50, total: 2, no_shows: 1 }]);
  expect(queries[0].filters).toContainEqual(['eq', 'restaurant_id', 'restaurant-a']);
  expect(queries[0].filters).toContainEqual(['gte', 'date', '2026-08-31']);
});

test('no-show rate is unavailable when only unfinished days have reservations', async () => {
  reservations = [
    { id: 'today', date: '2026-09-30', status: 'confirmed' },
    { id: 'future', date: '2026-10-02', status: 'confirmed' },
  ];

  const data = await metrics('America/Los_Angeles');
  expect(data.summary.no_show_rate).toBeNull();
  expect(data.summary.no_show_sample_size).toBe(0);
  expect(data.timelines.no_show).toEqual([]);
  // Historical conversion field is unchanged until the product defines an
  // actual inquiry denominator.
  expect(data.summary.conversion_rate).toBe(100);
});

test('a local day already finished in Madrid counts even while UTC date is earlier', async () => {
  jest.setSystemTime(new Date('2026-09-30T23:30:00.000Z'));
  reservations = [{ id: 'yesterday', date: '2026-09-30', status: 'no_show' }];

  const data = await metrics('Europe/Madrid');
  expect(data.summary.no_show_rate).toBe(100);
  expect(data.summary.no_show_sample_size).toBe(1);
  expect(data.timelines.no_show[0].date).toBe('2026-09-30');
});
