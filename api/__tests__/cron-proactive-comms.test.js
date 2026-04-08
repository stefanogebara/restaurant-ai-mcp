var mockFrom = jest.fn();
var mockSchemaFrom = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../services/guestMemory', () => ({
  buildGuestContext: jest.fn().mockResolvedValue({}),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../cron/proactive-comms');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

function mockQueryChain(data, error = null) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
      gte: jest.fn().mockReturnValue({
        gte: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
    }),
  };
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/proactive-comms', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with zero opportunities when no data', async () => {
    mockFrom.mockReturnValue(mockQueryChain([], null));
    mockSchemaFrom.mockReturnValue(mockQueryChain([], null));

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      opportunities: 0,
    }));
  });

  test('finds at-risk customers and returns opportunity count', async () => {
    // guest_memories returns empty
    mockFrom.mockReturnValue(mockQueryChain([], null));
    // customer_ltv returns at-risk customers
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        gte: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  { customer_id: 'c1', customer_phone: '+5511999', churn_risk_score: 85, customer_tier: 'regular', last_visit_date: '2026-01-01', total_visits: 5, restaurant_id: 'r1' },
                ],
                error: null,
              }),
            }),
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
    expect(json.opportunities).toBeGreaterThanOrEqual(1);
  });

  test('handles DB error gracefully in sub-queries', async () => {
    mockFrom.mockReturnValue(mockQueryChain(null, { message: 'DB error' }));
    mockSchemaFrom.mockReturnValue(mockQueryChain(null, { message: 'DB error' }));

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    // Sub-queries catch errors and return [], so handler returns 200 with 0 opportunities
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, opportunities: 0 }));
  });
});
