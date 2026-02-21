/**
 * Tests for api/usage-stats.js
 * Auth-gated GET endpoint returning usage metrics for current month or date range
 */

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn().mockReturnValue(false),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/usage-tracking', () => ({
  getMonthlyUsage: jest.fn(),
  getUsageSummary: jest.fn(),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const handler = require('../usage-stats');
const { verifyAuth } = require('../_lib/auth');
const { handlePreflight } = require('../_lib/cors');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { getMonthlyUsage, getUsageSummary } = require('../_lib/usage-tracking');

function createMockReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
    query: overrides.query || {},
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
  handlePreflight.mockReturnValue(false);
  checkAndApplyRateLimit.mockResolvedValue(false);
});

// ============================================================
// CORS & Method checks
// ============================================================
describe('UsageStats: CORS and methods', () => {
  test('handles OPTIONS preflight via handlePreflight', async () => {
    handlePreflight.mockReturnValueOnce(true);
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    // handlePreflight returned true → handler exits early, no auth called
    expect(verifyAuth).not.toHaveBeenCalled();
  });

  test('rejects non-GET methods with 405', async () => {
    const { req, res } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Method not allowed' }));
  });
});

// ============================================================
// Rate limiting
// ============================================================
describe('UsageStats: Rate limiting', () => {
  test('stops processing when rate limited', async () => {
    checkAndApplyRateLimit.mockResolvedValueOnce(true);

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(verifyAuth).not.toHaveBeenCalled();
  });
});

// ============================================================
// Authentication
// ============================================================
describe('UsageStats: Authentication', () => {
  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });

  test('returns 400 when no restaurant_id on user', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { email: 'test@test.com' } }); // no restaurant_id

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'No restaurant associated with this account',
    }));
  });
});

// ============================================================
// Data fetching
// ============================================================
describe('UsageStats: Data fetching', () => {
  test('returns current month usage when no date params', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    getMonthlyUsage.mockResolvedValueOnce({
      success: true,
      data: { reservations: 42, ai_calls: 100 },
    });

    const { req, res } = createMockReqRes({ query: {} });
    await handler(req, res);

    expect(getMonthlyUsage).toHaveBeenCalledWith('rest-1');
    expect(getUsageSummary).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.period).toBe('current_month');
    expect(data.usage).toEqual({ reservations: 42, ai_calls: 100 });
  });

  test('returns custom date range usage when start and end provided', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    getUsageSummary.mockResolvedValueOnce({
      success: true,
      data: { reservations: 15, ai_calls: 30 },
    });

    const { req, res } = createMockReqRes({
      query: { start: '2026-02-01', end: '2026-02-15' },
    });
    await handler(req, res);

    expect(getUsageSummary).toHaveBeenCalledWith('rest-1', '2026-02-01', '2026-02-15');
    expect(getMonthlyUsage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.period).toEqual({ start: '2026-02-01', end: '2026-02-15' });
  });

  test('returns 500 when data fetch fails', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    getMonthlyUsage.mockResolvedValueOnce({ success: false, error: 'DB error' });

    const { req, res } = createMockReqRes({ query: {} });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'DB error' }));
  });

  test('returns 500 on unexpected exception', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    getMonthlyUsage.mockRejectedValueOnce(new Error('Network error'));

    const { req, res } = createMockReqRes({ query: {} });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Internal server error',
    }));
  });
});
