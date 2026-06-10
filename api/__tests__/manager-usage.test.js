'use strict';

var mockVerifyJWT = jest.fn();
var mockSupabaseFrom = jest.fn();
var mockGetPlanLimits = jest.fn((plan) => {
  const caps = { free: 0, starter: 100, growth: 500, professional: 500, scale: -1 };
  return { managerAICallsMonthly: caps[plan] ?? 0 };
});

jest.mock('../_lib/auth', () => ({ verifyJWT: mockVerifyJWT }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: mockSupabaseFrom }
}));
jest.mock('../_services/subscription-limits', () => ({
  getPlanLimits: mockGetPlanLimits
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() })
}));

const handler = require('../manager-usage');

describe('GET /api/manager-usage', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
    res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), getHeader: jest.fn() };
    // Default: starter plan, 47 usage count
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'subscriptions') {
        return {
          select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: [{ plan_name: 'starter' }], error: null }) }) }) }) })
        };
      }
      // usage_tracking
      return {
        select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ lte: async () => ({ data: [{ count: 47 }], error: null }) }) }) }) })
      };
    });
  });

  test('rejects non-GET', async () => {
    req = { method: 'POST', headers: {} };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 401 without auth', async () => {
    mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
    req = { method: 'GET', headers: {} };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns used/limit/plan/resets_at for starter plan', async () => {
    req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    await handler(req, res);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.used).toBe(47);
    expect(body.limit).toBe(100);
    expect(body.plan).toBe('starter');
    expect(body.resets_at).toMatch(/^\d{4}-\d{2}-01$/);
  });

  test('returns limit: null for scale plan', async () => {
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'subscriptions') {
        return {
          select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: [{ plan_name: 'scale' }], error: null }) }) }) }) })
        };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ lte: async () => ({ data: [], error: null }) }) }) }) })
      };
    });
    req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    await handler(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.limit).toBeNull();
    expect(body.used).toBe(0);
  });

  test('sums multiple usage rows', async () => {
    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'subscriptions') {
        return {
          select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: [{ plan_name: 'growth' }], error: null }) }) }) }) })
        };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ lte: async () => ({ data: [{ count: 30 }, { count: 25 }], error: null }) }) }) }) })
      };
    });
    req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    await handler(req, res);
    const body = res.json.mock.calls[0][0];
    expect(body.used).toBe(55);
    expect(body.limit).toBe(500);
  });
});
