/**
 * Tests for api/analytics.js
 * Authenticated GET-only analytics endpoint
 */

// --- Mock dependencies ---
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

function mockCreateChainableMock(returnData = { data: [], error: null }) {
  const chain = new Proxy({}, {
    get(target, prop) {
      if (prop === 'select') return (...args) => { mockSelect(...args); return chain; };
      if (prop === 'eq') return (...args) => { mockEq(...args); return chain; };
      if (prop === 'then') return (resolve) => resolve(returnData);
      return () => chain;
    },
  });
  return chain;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args) => {
      mockFrom(...args);
      return mockCreateChainableMock();
    },
  },
  getAllTables: jest.fn().mockResolvedValue({
    success: true,
    tables: [
      { table_number: '1', capacity: 4, location: 'Main' },
      { table_number: '2', capacity: 6, location: 'Patio' },
    ],
  }),
  getActiveServiceRecords: jest.fn().mockResolvedValue({
    success: true,
    service_records: [],
  }),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn().mockImplementation((req, res, next) => next()),
  requireFeature: jest.fn().mockReturnValue((req, res, next) => next()),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const handler = require('../analytics');
const { verifyAuth } = require('../_lib/auth');

function createMockReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
    query: overrides.query || {},
    body: overrides.body || {},
    headers: overrides.headers || { authorization: 'Bearer test-token' },
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn(),
    setHeader: jest.fn(),
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// CORS & Method checks
// ============================================================
describe('Analytics: CORS and methods', () => {
  test('handles OPTIONS request', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejects non-GET methods', async () => {
    const { req, res } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ============================================================
// Authentication
// ============================================================
describe('Analytics: Authentication', () => {
  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValueOnce({
      error: 'Not authenticated',
      status: 401,
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Not authenticated',
    }));
  });

  test('proceeds when authenticated', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes({ query: { period: '7d' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// Analytics data
// ============================================================
describe('Analytics: Data response', () => {
  test('returns analytics object with expected structure', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.success).toBe(true);
    expect(responseData.analytics).toBeDefined();
    expect(responseData.analytics.overview).toBeDefined();
    expect(responseData.analytics.overview.total_reservations).toBeDefined();
    expect(responseData.analytics.overview.total_capacity).toBeDefined();
    expect(responseData.analytics.reservations_by_status).toBeDefined();
    expect(responseData.analytics.reservations_by_day).toBeDefined();
    expect(responseData.analytics.reservations_by_time_slot).toBeDefined();
    expect(responseData.analytics.table_utilization).toBeDefined();
    expect(responseData.analytics.daily_trend).toBeDefined();
  });

  test('daily_trend has 7 entries', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.analytics.daily_trend.length).toBe(7);
  });

  test('uses period query param', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes({ query: { period: 'today' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
