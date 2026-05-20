var mockFrom = jest.fn();
var mockSchema = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: mockSchema,
};

// V.2 fetches each reservation's restaurant timezone via
//   supabaseAdmin.schema('restaurant').from('restaurant_info')...
// Default the schema mock to return UTC for every restaurant_id so
// tests don't need to wire it up per case.
function defaultSchemaMock() {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({
          data: [{ id: 'rest-1', timezone: 'UTC' }],
          error: null,
        }),
      }),
    }),
  };
}

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../cron/check-late-reservations');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => {
  jest.clearAllMocks();
  mockSchema.mockImplementation(defaultSchemaMock);
});

describe('cron/check-late-reservations', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with 0 no-shows when no late reservations', async () => {
    // V.2 chain: select → in → eq → is (no .lte — that filtered local
    // time-of-day against UTC wall clock, which was the timezone bug).
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.marked_as_no_show).toBe(0);
  });

  test('marks late reservations as no-show and releases tables', async () => {
    const lateRes = [{
      id: 'uuid-1', reservation_id: 'RES-001', customer_name: 'Ana',
      time: '18:00', table_ids: ['t1'], restaurant_id: 'rest-1', status: 'confirmed', date: '2026-04-08',
    }];

    // For the SELECT query — V.2 chain is select→in→eq→is (no .lte).
    mockFrom.mockImplementation((table) => {
      if (table === 'reservations') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ data: lateRes, error: null }),
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      if (table === 'tables') {
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data: null, error: null }) };
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.marked_as_no_show).toBe(1);
  });

  test('returns 500 on database fetch error', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockResolvedValue({ data: null, error: { message: 'Connection lost' } }),
          }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
