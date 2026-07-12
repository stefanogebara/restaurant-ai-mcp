/**
 * Tests for api/cron/warm-seo-cache.js
 *
 * Contract (Fase A do motor SEO, 2026-07-12): the warm list is the curated
 * buyer-intent matrix from _lib/seo-matrix.js — NOT customer (city, type)
 * pairs, and the warmed handler is /api/seo/reservas. Page existence never
 * depends on customer rows, so there is no restaurant fetch (and no 500 path
 * for it) anymore.
 */

var mockFrom = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: jest.fn().mockReturnValue({ from: jest.fn() }),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../seo/reservas', () => jest.fn().mockResolvedValue(undefined));

const handler = require('../cron/warm-seo-cache');
const reservasHandler = require('../seo/reservas');
const { getMatrixEntries } = require('../_lib/seo-matrix');

const MATRIX = getMatrixEntries();

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

/** seo_page_cache lookup returns the given cache_key rows */
function mockCacheRows(rows) {
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  });
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

  test('returns 200 with warmed=0 when the whole matrix is already cached', async () => {
    mockCacheRows(MATRIX.map((e) => ({ cache_key: e.cacheKey })));

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ warmed: 0, alreadyCached: MATRIX.length }),
    );
    expect(reservasHandler).not.toHaveBeenCalled();
  });

  test('warms only the missing matrix entries via the reservas handler', async () => {
    // Everything cached except sao-paulo/japones
    const missing = MATRIX.find(
      (e) => e.city.slug === 'sao-paulo' && e.cuisine.slug === 'japones',
    );
    mockCacheRows(
      MATRIX.filter((e) => e !== missing).map((e) => ({ cache_key: e.cacheKey })),
    );

    reservasHandler.mockImplementation((fakeReq, fakeRes) => {
      fakeRes.send();
      return Promise.resolve();
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ warmed: 1, alreadyCached: MATRIX.length - 1 }),
    );
    expect(reservasHandler).toHaveBeenCalledTimes(1);
    expect(reservasHandler.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      query: { city: 'sao-paulo', cuisine: 'japones' },
    });
  });

  test('cold start: warms the whole matrix when nothing is cached', async () => {
    mockCacheRows([]);
    reservasHandler.mockImplementation((fakeReq, fakeRes) => {
      fakeRes.send();
      return Promise.resolve();
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ warmed: MATRIX.length, alreadyCached: 0 }),
    );
  });
});
