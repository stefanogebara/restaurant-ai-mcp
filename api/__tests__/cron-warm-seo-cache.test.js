var mockSchemaFrom = jest.fn();
var mockFrom = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/seo-html', () => ({
  slugify: jest.fn((s) => s ? s.toLowerCase().replace(/\s+/g, '-') : ''),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../seo/city-cuisine', () => jest.fn().mockResolvedValue(undefined));

const handler = require('../cron/warm-seo-cache');
const cityHandler = require('../seo/city-cuisine');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/warm-seo-cache', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 500 on restaurant fetch error', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
            }),
          }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('returns 200 with warmed=0 when all pairs already cached', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({
                data: [{ city: 'Sao Paulo', restaurant_type: 'Italian' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({
          data: [{ cache_key: 'city:sao-paulo:italian' }],
          error: null,
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ warmed: 0, alreadyCached: 1 }));
  });

  test('warms missing cache pairs', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({
                data: [{ city: 'Rio', restaurant_type: 'Brazilian' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    // cityHandler calls fakeRes.send() which increments warmed
    cityHandler.mockImplementation((fakeReq, fakeRes) => {
      fakeRes.send();
      return Promise.resolve();
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ warmed: 1, alreadyCached: 0 }));
  });
});
