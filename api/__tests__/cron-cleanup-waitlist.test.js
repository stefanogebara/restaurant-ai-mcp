var mockFrom = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: jest.fn(),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../cron/cleanup-waitlist');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/cleanup-waitlist', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with cancelled=0 when no stale entries', async () => {
    mockFrom.mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
          }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, cancelled: 0 });
  });

  test('cancels stale waitlist entries and returns count', async () => {
    mockFrom.mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: [{ id: 'w1' }, { id: 'w2' }],
              error: null,
              count: 2,
            }),
          }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, cancelled: 2 });
  });

  test('returns 500 on database error', async () => {
    mockFrom.mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' }, count: null }),
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

  test('returns 500 when supabaseAdmin is null', async () => {
    // Temporarily override supabaseAdmin
    const mod = require('../_lib/supabase');
    const orig = mod.supabaseAdmin;
    mod.supabaseAdmin = null;

    // Need to re-require the handler to pick up the null
    jest.resetModules();
    jest.mock('../_lib/supabase', () => ({ supabaseAdmin: null }));
    jest.mock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
    }));
    jest.mock('../_lib/cron-tracker', () => ({
      logCronRun: jest.fn().mockResolvedValue(undefined),
    }));
    const freshHandler = require('../cron/cleanup-waitlist');

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await freshHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
