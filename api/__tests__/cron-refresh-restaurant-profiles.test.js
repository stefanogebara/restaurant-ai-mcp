var mockSchemaFrom = jest.fn();
var mockSupabaseAdmin = {
  from: jest.fn(),
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};
var mockRegeneratePersona = jest.fn();

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_services/personaGenerator', () => ({
  regeneratePersona: (...a) => mockRegeneratePersona(...a),
}));
jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../_crons/refresh-restaurant-profiles');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/refresh-restaurant-profiles', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 405 for unsupported method', async () => {
    const req = { method: 'DELETE', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 200 gracefully when intelligence table not found', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST204', message: 'Table not found' },
        }),
      }),
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, refreshed: 0 }));
  });

  test('returns 200 with refreshed=0 when no restaurants need refresh', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, refreshed: 0 }));
  });

  test('regenerates profiles for stale restaurants', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockResolvedValue({
          data: [{
            restaurant_config_id: 'rest-1',
            last_gathered_at: '2026-04-07T00:00:00Z',
            restaurant_config: { id: 'rest-1', restaurant_name: 'Test', profile_generated_at: '2026-04-01T00:00:00Z' },
          }],
          error: null,
        }),
      }),
    });
    mockRegeneratePersona.mockResolvedValue({ success: true });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.refreshed).toBe(1);
    expect(mockRegeneratePersona).toHaveBeenCalledWith('rest-1');
  });

  test('skips restaurants with up-to-date profiles', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockResolvedValue({
          data: [{
            restaurant_config_id: 'rest-1',
            last_gathered_at: '2026-04-01T00:00:00Z',
            restaurant_config: { id: 'rest-1', restaurant_name: 'Test', profile_generated_at: '2026-04-05T00:00:00Z' },
          }],
          error: null,
        }),
      }),
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ refreshed: 0 }));
    expect(mockRegeneratePersona).not.toHaveBeenCalled();
  });
});
