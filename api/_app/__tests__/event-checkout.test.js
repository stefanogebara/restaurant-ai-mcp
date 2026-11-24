// Set env vars before any require
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// --- Supabase mock ---
const mockSingle = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
const mockInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSingle }) });
const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle });
const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
const mockSelectChain = jest.fn().mockReturnValue({ eq: mockEq1 });
const mockFrom = jest.fn().mockReturnValue({
  select: mockSelectChain,
  insert: mockInsert,
});
const mockSchema = jest.fn().mockReturnValue({ from: mockFrom });

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: (...args) => mockSchema(...args) },
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

// --- Stripe mock ---
const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsCancel = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      cancel: mockPaymentIntentsCancel,
    },
  }));
});

const handler = require('../event-checkout');

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

const validBody = {
  event_id: 'evt-123',
  customer_name: 'John Doe',
  customer_email: 'john@example.com',
  customer_phone: '+5511999999999',
  party_size: 2,
  special_requests: 'Vegetarian',
};

const mockEvent = {
  id: 'evt-123',
  restaurant_id: 'rest-456',
  title: 'Wine Tasting',
  event_date: '2026-12-31',
  event_time: '19:00:00',
  max_capacity: 20,
  current_bookings: 5,
  price: 150.00,
  is_active: true,
};

describe('event-checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-POST methods', async () => {
    const { req, res } = mkReqRes({ method: 'GET' });
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns 400 when event_id is missing', async () => {
    const { req, res } = mkReqRes({ body: { ...validBody, event_id: undefined } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('event_id');
  });

  it('returns 400 when customer_name is missing', async () => {
    const { req, res } = mkReqRes({ body: { ...validBody, customer_name: '' } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('customer_name');
  });

  it('returns 400 when customer_email is invalid', async () => {
    const { req, res } = mkReqRes({ body: { ...validBody, customer_email: 'not-an-email' } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('customer_email');
  });

  it('returns 400 when party_size is 0', async () => {
    const { req, res } = mkReqRes({ body: { ...validBody, party_size: 0 } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('party_size');
  });

  it('returns 400 when party_size exceeds 50', async () => {
    const { req, res } = mkReqRes({ body: { ...validBody, party_size: 51 } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('party_size');
  });

  it('handles OPTIONS preflight', async () => {
    const { req, res } = mkReqRes({ method: 'OPTIONS' });
    res.end = jest.fn().mockReturnValue(res);
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});
