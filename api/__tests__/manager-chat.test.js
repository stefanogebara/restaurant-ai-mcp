// mockSupabaseAdmin must be declared with var so it is hoisted above jest.mock() calls
// (jest.mock factories run before const/let declarations are initialized)
var mockSupabaseAdmin = { from: jest.fn() };

const managerChat = require('../manager-chat');

jest.mock('../_lib/auth', () => ({
  verifyJWT: jest.fn().mockResolvedValue({ restaurant_id: 'rest-1' }),
}));
jest.mock('../_lib/manager-agent', () => {
  class ManagerQuotaError extends Error {
    constructor(type, data = {}) {
      super(type);
      this.name = 'ManagerQuotaError';
      this.type = type;
      this.used = data.used;
      this.limit = data.limit;
      this.plan = data.plan;
    }
  }
  return {
    runManagerAgent: jest.fn().mockResolvedValue('You have 2 reservations tonight.'),
    ManagerQuotaError,
  };
});
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
}));

jest.mock('../_lib/security-headers', () => ({
  applySecurityHeaders: jest.fn(),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/subscription-middleware', () => ({
  inlineCheckSubscription: jest.fn().mockResolvedValue(false),
  softCheckSubscription: jest.fn().mockResolvedValue(false),
  checkSubscriptionByRestaurantId: jest.fn().mockResolvedValue({ active: true, plan: 'growth', status: 'active' }),
  inlineRequireFeature: jest.fn().mockReturnValue(false),
  checkSubscription: jest.fn((req, res, next) => next()),
  requireFeature: jest.fn(() => (req, res, next) => next()),
  checkReservationLimits: jest.fn((req, res, next) => next()),
  isDemoRestaurant: jest.fn().mockResolvedValue(false),
}));

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/manager-chat', () => {
  it('returns reply from runManagerAgent', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { message: 'Who is coming tonight?' } };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reply: 'You have 2 reservations tonight.' }));
  });

  it('returns 400 when message is missing', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for non-POST/GET', async () => {
    const req = { method: 'DELETE', headers: {}, body: {} };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 401 when JWT is invalid', async () => {
    const { verifyJWT } = require('../_lib/auth');
    verifyJWT.mockResolvedValueOnce(null);
    const req = { method: 'POST', headers: { authorization: 'Bearer bad' }, body: { message: 'Hi' } };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
  });

  it('returns 403 when plan is free (upgrade_required)', async () => {
    const { runManagerAgent, ManagerQuotaError } = require('../_lib/manager-agent');
    const quotaErr = new ManagerQuotaError('upgrade_required', { plan: 'free' });
    runManagerAgent.mockRejectedValueOnce(quotaErr);
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { message: 'Hi' } };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Manager AI requires a paid plan', upgrade_required: true });
  });

  it('returns 429 when quota exceeded', async () => {
    const { runManagerAgent, ManagerQuotaError } = require('../_lib/manager-agent');
    const quotaErr = new ManagerQuotaError('quota_exceeded', { used: 100, limit: 100 });
    runManagerAgent.mockRejectedValueOnce(quotaErr);
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { message: 'Hi' } };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Monthly Manager AI limit reached', used: 100, limit: 100 });
  });
});

describe('GET /api/manager-chat', () => {
  it('returns conversation history', async () => {
    const chain = { select: jest.fn(), eq: jest.fn(), order: jest.fn(), limit: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: [{ role: 'manager', content: 'Hi', created_at: '2026-03-01T10:00:00Z' }], error: null });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ history: expect.any(Array) }));
  });

  it('returns 500 when Supabase query fails', async () => {
    const chain = { select: jest.fn(), eq: jest.fn(), order: jest.fn(), limit: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: null, error: { message: 'DB timeout' } });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
