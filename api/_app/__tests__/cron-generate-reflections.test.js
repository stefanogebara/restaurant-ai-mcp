var mockFrom = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: jest.fn(),
};
var mockGetAI = jest.fn();
var mockCreateMemory = jest.fn();

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/ai-client', () => ({
  getAI: () => mockGetAI(),
  AI_MODEL_FAST: 'test-model',
}));
jest.mock('../_services/guestMemory', () => ({
  createMemory: (...a) => mockCreateMemory(...a),
}));
jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../_crons/generate-reflections');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/generate-reflections', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with reflections=0 when no candidates', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, reflections: 0 }));
  });

  test('returns 500 on database query error', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
              }),
            }),
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

  test('finds eligible guests and returns reflection count', async () => {
    // Build 5+ observations for one guest so they pass the threshold
    const candidates = Array.from({ length: 6 }, () => ({
      restaurant_id: 'rest-1',
      guest_phone: '+5511999',
    }));

    // First call: candidate query
    const candidateChain = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: candidates, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    // Observation fetch chain + recent reflection check chain
    const observationChain = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({
                    data: candidates.map((_, i) => ({ content: `Obs ${i}`, importance: 5, created_at: new Date().toISOString() })),
                    error: null,
                  }),
                }),
                // For reflection check (memory_type = 'reflection')
                gte: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    // Phase V.5 adds an isCronEnabled() lookup that hits
    // supabaseAdmin.from('cron_config') BEFORE the real queries. The
    // kill-switch helper is fail-open, so any chain that doesn't match
    // (or that throws) just defaults to enabled=true — we ignore that
    // call here and count only the queries the cron actually cares
    // about. Filter by table name so the test stays stable across new
    // pre-query hooks.
    let callCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'cron_config') {
        // Fail-open path: return a chain that won't match maybeSingle().
        // The thrown TypeError is swallowed by getCronConfig().
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      }
      callCount++;
      if (callCount === 1) return candidateChain;
      return observationChain;
    });

    mockGetAI.mockReturnValue({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: JSON.stringify([{ content: 'Guest loves seafood', importance: 8 }]) }],
        }),
      },
    });
    mockCreateMemory.mockResolvedValue({ id: 'mem-1' });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.eligible).toBeGreaterThanOrEqual(1);
  });
});
