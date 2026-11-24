// Set env vars before any require
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';

// --- Supabase mock ---
const mockSingle = jest.fn();
const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
const mockSelectChain = jest.fn().mockReturnValue({ eq: mockEq1 });
const mockFrom = jest.fn().mockReturnValue({
  select: mockSelectChain,
  update: jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
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
}));

// Mock resend to prevent import errors
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({}) },
  })),
}));

const handler = require('../event-booking-confirm');

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

describe('event-booking-confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-POST methods', async () => {
    const { req, res } = mkReqRes({ method: 'GET' });
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns 400 when booking_id is missing', async () => {
    const { req, res } = mkReqRes({ body: { payment_intent_id: 'pi_123' } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('booking_id');
  });

  it('returns 400 when payment_intent_id is missing', async () => {
    const { req, res } = mkReqRes({ body: { booking_id: 'bk_123' } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('payment_intent_id');
  });

  it('handles OPTIONS preflight', async () => {
    const { req, res } = mkReqRes({ method: 'OPTIONS' });
    res.end = jest.fn().mockReturnValue(res);
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});
