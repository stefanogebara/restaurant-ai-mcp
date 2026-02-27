/**
 * Tests for api/subscription-status.js
 * Auth-gated GET endpoint returning subscription data by email
 */

jest.mock('../_lib/supabase', () => ({
  getSubscriptionByEmail: jest.fn(),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const handler = require('../subscription-status');
const { verifyAuth } = require('../_lib/auth');
const { getSubscriptionByEmail } = require('../_lib/supabase');

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
});

// ============================================================
// CORS & Method checks
// ============================================================
describe('SubscriptionStatus: CORS and methods', () => {
  test('handles OPTIONS preflight request', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  test('rejects non-GET methods with 405', async () => {
    const { req, res } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Method not allowed' }));
  });
});

// ============================================================
// Authentication
// ============================================================
describe('SubscriptionStatus: Authentication', () => {
  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });

  test('returns 403 when auth returns different status', async () => {
    verifyAuth.mockResolvedValueOnce({ error: 'Forbidden', status: 403 });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ============================================================
// Input validation
// ============================================================
describe('SubscriptionStatus: Input validation', () => {
  test('returns 400 when user email is missing from JWT', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: null },
    });

    const { req, res } = createMockReqRes({ query: {} });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Missing email',
    }));
  });
});

// ============================================================
// Data fetching
// ============================================================
describe('SubscriptionStatus: Data fetching', () => {
  test('returns 404 when subscription not found', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    getSubscriptionByEmail.mockResolvedValueOnce({ success: false });

    const { req, res } = createMockReqRes({ query: { email: 'customer@test.com' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      has_subscription: false,
    }));
  });

  test('returns 200 with subscription data on success', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    getSubscriptionByEmail.mockResolvedValueOnce({
      success: true,
      subscription: {
        plan_name: 'Growth',
        status: 'active',
        current_period_end: '2026-03-21',
        trial_end: null,
      },
    });

    const { req, res } = createMockReqRes({ query: { email: 'customer@test.com' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.has_subscription).toBe(true);
    expect(data.subscription.plan).toBe('Growth');
    expect(data.subscription.status).toBe('active');
    expect(data.subscription.is_active).toBe(true);
    expect(data.subscription.is_trial).toBe(false);
  });

  test('marks trialing subscriptions correctly', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    getSubscriptionByEmail.mockResolvedValueOnce({
      success: true,
      subscription: {
        plan_name: 'Growth',
        status: 'trialing',
        current_period_end: '2026-03-21',
        trial_end: '2026-03-07',
      },
    });

    const { req, res } = createMockReqRes({ query: { email: 'trial@test.com' } });
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.subscription.is_trial).toBe(true);
    expect(data.subscription.is_active).toBe(true);
  });

  test('returns 500 on unexpected error', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    getSubscriptionByEmail.mockRejectedValueOnce(new Error('DB connection failed'));

    const { req, res } = createMockReqRes({ query: { email: 'customer@test.com' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Failed to fetch subscription status',
    }));
  });
});
