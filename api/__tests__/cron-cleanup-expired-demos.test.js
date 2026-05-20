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
jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../cron/cleanup-expired-demos');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/cleanup-expired-demos', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with 0 deleted when no expired demos', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, deleted_demos: 0 }));
  });

  test('deletes expired demos and dependent data', async () => {
    // First call to schema: fetch expired demos
    // Subsequent calls: delete restaurant_config
    let schemaCallCount = 0;
    mockSupabaseAdmin.schema.mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => {
        schemaCallCount++;
        if (schemaCallCount === 1) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                lt: jest.fn().mockResolvedValue({
                  data: [{ id: 'demo-1', restaurant_name: 'Demo', demo_expires_at: '2026-01-01', demo_contact_email: 'a@b.com' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        // Delete restaurant_config
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }),
    }));

    // Mock per-table to cover BOTH shapes the cron uses on public schema:
    //  - delete().eq()       — dependent tables + reservations + tables
    //  - delete().in()       — ml_interventions (by reservation_id list)
    //  - select('id').eq()   — reservations lookup that feeds ml_interventions
    //  - select.eq.maybeSingle — V.5 cron_config kill-switch probe
    mockFrom.mockImplementation((table) => {
      if (table === 'cron_config') {
        // V.5 kill switch: return a chain whose maybeSingle resolves
        // to no row → fail-open, cron stays enabled.
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === 'reservations') {
        // Cron calls both `.select('id').eq(...)` (to feed ml_interventions
        // cleanup) AND `.delete({count}).eq(...)` (to delete rows).
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ id: 'res-1' }, { id: 'res-2' }],
              error: null,
            }),
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null, count: 2 }),
          }),
        };
      }
      if (table === 'ml_interventions') {
        return {
          delete: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      // All other dependent tables + final `tables` delete.
      return {
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null, count: 5 }),
        }),
      };
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.deleted_demos).toBe(1);
  });

  test('returns 500 on database fetch error', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
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
