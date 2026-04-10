/**
 * Tests for api/cron/compile-wiki.js
 * Covers: auth guard, active restaurant discovery, per-restaurant compilation, time budget
 */

var mockCompileWikiForRestaurant = jest.fn();
var mockLogCronRun = jest.fn().mockResolvedValue(undefined);

var mockReservationsChain = { select: jest.fn(), gte: jest.fn(), limit: jest.fn() };
mockReservationsChain.select.mockReturnValue(mockReservationsChain);
mockReservationsChain.gte.mockReturnValue(mockReservationsChain);
mockReservationsChain.limit.mockResolvedValue({ data: [], error: null });

var mockSupabaseAdmin = {
  from: jest.fn().mockReturnValue(mockReservationsChain),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: (...a) => mockLogCronRun(...a),
}));
jest.mock('../services/wikiCompiler', () => ({
  compileWikiForRestaurant: (...a) => mockCompileWikiForRestaurant(...a),
}));

const handler = require('../cron/compile-wiki');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => {
  jest.clearAllMocks();
  mockLogCronRun.mockResolvedValue(undefined);
  mockCompileWikiForRestaurant.mockResolvedValue({ compiled: 5, skipped: 0 });

  // Reset chain
  mockReservationsChain.limit.mockResolvedValue({ data: [], error: null });
  mockSupabaseAdmin.from.mockReturnValue(mockReservationsChain);
});

describe('cron/compile-wiki', () => {
  it('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockCompileWikiForRestaurant).not.toHaveBeenCalled();
  });

  it('returns 200 with processed=0 when no active restaurants', async () => {
    mockReservationsChain.limit.mockResolvedValue({ data: [], error: null });

    const req = { headers: { authorization: 'Bearer test-secret' } };
    const res = mockRes();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, processed: 0 }));
    expect(mockCompileWikiForRestaurant).not.toHaveBeenCalled();
  });

  it('compiles wiki for each active restaurant', async () => {
    mockReservationsChain.limit.mockResolvedValue({
      data: [
        { restaurant_id: 'rest-1' },
        { restaurant_id: 'rest-2' },
        { restaurant_id: 'rest-1' }, // duplicate — should be deduped
      ],
      error: null,
    });

    const req = { headers: { authorization: 'Bearer test-secret' } };
    const res = mockRes();
    await handler(req, res);

    // rest-1 and rest-2 only (deduplicated)
    expect(mockCompileWikiForRestaurant).toHaveBeenCalledTimes(2);
    expect(mockCompileWikiForRestaurant).toHaveBeenCalledWith('rest-1');
    expect(mockCompileWikiForRestaurant).toHaveBeenCalledWith('rest-2');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      processed: 2,
      compiled: 10, // 5 per restaurant
      skipped: 0,
    }));
  });

  it('continues processing after a single restaurant fails', async () => {
    mockReservationsChain.limit.mockResolvedValue({
      data: [{ restaurant_id: 'rest-1' }, { restaurant_id: 'rest-2' }],
      error: null,
    });

    mockCompileWikiForRestaurant
      .mockRejectedValueOnce(new Error('AI quota exceeded'))
      .mockResolvedValueOnce({ compiled: 3, skipped: 2 });

    const req = { headers: { authorization: 'Bearer test-secret' } };
    const res = mockRes();
    await handler(req, res);

    expect(mockCompileWikiForRestaurant).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      processed: 1, // only rest-2 succeeded
      errors: 1,
    }));
  });

  it('respects MAX_RESTAURANTS=5 cap', async () => {
    const manyRestaurants = Array.from({ length: 50 }, (_, i) => ({ restaurant_id: `rest-${i}` }));
    mockReservationsChain.limit.mockResolvedValue({ data: manyRestaurants, error: null });

    const req = { headers: { authorization: 'Bearer test-secret' } };
    const res = mockRes();
    await handler(req, res);

    // Should process at most 5 unique restaurants
    expect(mockCompileWikiForRestaurant.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('returns 500 when the reservations query fails', async () => {
    mockReservationsChain.limit.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const req = { headers: { authorization: 'Bearer test-secret' } };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockCompileWikiForRestaurant).not.toHaveBeenCalled();
  });

  it('logs cron run after processing', async () => {
    mockReservationsChain.limit.mockResolvedValue({ data: [{ restaurant_id: 'rest-1' }], error: null });

    const req = { headers: { authorization: 'Bearer test-secret' } };
    const res = mockRes();
    await handler(req, res);

    expect(mockLogCronRun).toHaveBeenCalledWith('compile-wiki', expect.objectContaining({ processed: 1 }));
  });
});
