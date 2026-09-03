var mockSchemaFrom = jest.fn();
var mockSupabaseAdmin = {
  from: jest.fn(),
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};
var mockProcessAllTriggers = jest.fn();

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_services/automatedCampaignService', () => ({
  processAllTriggers: (...a) => mockProcessAllTriggers(...a),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../_crons/automated-campaigns');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/automated-campaigns', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 405 for non-GET method', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 200 with 0 when no enabled automations', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, restaurants: 0, totalSent: 0 }));
  });

  test('processes triggers for restaurants with enabled automations', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ restaurant_id: 'rest-1' }, { restaurant_id: 'rest-1' }, { restaurant_id: 'rest-2' }],
          error: null,
        }),
      }),
    });
    mockProcessAllTriggers.mockResolvedValue({ total: 3 });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.restaurants).toBe(2); // deduplicated
    expect(json.totalSent).toBe(6); // 3 per restaurant * 2
  });

  test('handles table-not-found gracefully', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST205', message: 'Table does not exist' },
        }),
      }),
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, restaurants: 0, totalSent: 0 }));
  });

  test('returns 500 on unexpected database error', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: { code: '42000', message: 'Unexpected error' },
        }),
      }),
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
