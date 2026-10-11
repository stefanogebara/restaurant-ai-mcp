const mockFrom = jest.fn();
const mockWaitlistIn = jest.fn();
const mockWaitlistLt = jest.fn();
let failStaleWaitlist = false;

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
}));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));

const handler = require('../health');

function chain(table) {
  let columns;
  let activeOnly = false;
  let olderThanCutoff = false;
  const query = {
    select(value) { columns = value; return query; },
    eq() { return query; },
    in(...args) { mockWaitlistIn(...args); activeOnly = true; return query; },
    lt(...args) { mockWaitlistLt(...args); olderThanCutoff = true; return query; },
    then(resolve, reject) {
      let result = { data: [], error: null };
      if (table === 'tables' && columns === '*') result = { count: 8, error: null };
      if (table === 'waitlist' && columns === 'added_at') {
        result = failStaleWaitlist
          ? { data: null, error: { message: 'database unavailable' } }
          : { data: activeOnly && olderThanCutoff ? [] : [{ added_at: '2020-01-01T00:00:00Z' }], error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

beforeAll(() => { process.env.CRON_SECRET = 'health-test-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => {
  jest.clearAllMocks();
  failStaleWaitlist = false;
  mockFrom.mockImplementation(chain);
});

async function runDetailedHealth() {
  const req = { method: 'GET', query: { detailed: 'true' }, headers: { authorization: 'Bearer health-test-secret' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
  await handler(req, res);
  return { res, body: res.json.mock.calls[0][0] };
}

test('terminal waitlist history is not treated as stale active work', async () => {
  const { res, body } = await runDetailedHealth();

  expect(mockWaitlistIn).toHaveBeenCalledWith('status', ['waiting', 'notified']);
  expect(mockWaitlistLt).toHaveBeenCalledWith('added_at', expect.any(String));
  expect(body.checks.staleData.staleWaitlistEntries).toBe(0);
  expect(res.status).toHaveBeenCalledWith(200);
});

test('a failed stale-data query degrades health instead of silently reporting zero', async () => {
  failStaleWaitlist = true;
  const { res, body } = await runDetailedHealth();

  expect(body.checks.staleData.status).toBe('error');
  expect(res.status).toHaveBeenCalledWith(503);
});
