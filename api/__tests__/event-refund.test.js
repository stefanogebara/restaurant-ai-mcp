// Set env vars before any require
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// --- Auth mock ---
const mockVerifyAuth = jest.fn();

jest.mock('../_lib/auth', () => ({
  verifyAuth: (...args) => mockVerifyAuth(...args),
}));

// --- Supabase mock ---
const mockSingle = jest.fn();
const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
const mockSelectChain = jest.fn().mockReturnValue({ eq: mockEq1 });
const mockFrom = jest.fn().mockReturnValue({
  select: mockSelectChain,
});
const mockSchema = jest.fn().mockReturnValue({ from: mockFrom });
const mockRpc = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args) => mockSchema(...args),
    rpc: (...args) => mockRpc(...args),
  },
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn().mockReturnValue(false),
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_123' }),
    },
  }));
});

const handler = require('../event-refund');

function mkReqRes(overrides = {}) {
  const res = {
    _status: null,
    _body: null,
    setHeader: jest.fn(),
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
  };
  const req = { method: 'POST', query: {}, body: {}, headers: {}, ...overrides };
  return { req, res };
}

describe('event-refund', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({
      user: { restaurant_id: 'rest-456' },
    });
  });

  it('rejects non-POST methods', async () => {
    const { req, res } = mkReqRes({ method: 'GET' });
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns 401 when not authenticated', async () => {
    mockVerifyAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const { req, res } = mkReqRes({ body: { booking_id: 'bk_123' } });
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it('returns 400 when booking_id is missing', async () => {
    const { req, res } = mkReqRes({ body: {} });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('booking_id');
  });

  it('handles OPTIONS preflight', async () => {
    const { handlePreflight } = require('../_lib/cors');
    handlePreflight.mockReturnValueOnce(true);
    const { req, res } = mkReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    // handlePreflight returned true, so handler should have returned early
    expect(handlePreflight).toHaveBeenCalled();
  });
});
