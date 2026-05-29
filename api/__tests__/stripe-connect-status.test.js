/**
 * Tests for api/stripe-connect-status.js
 *
 * Coverage:
 *   - method guard (only GET)
 *   - auth guard (missing/invalid JWT → 401)
 *   - no row → { connected: false }
 *   - row exists → full payload, booleans coerced
 *   - DB error → 500 db_error
 */

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));
const mockSchema = jest.fn(() => ({ from: mockFrom }));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: mockSchema },
}));

const mockVerifyJWT = jest.fn();
jest.mock('../_lib/auth', () => ({
  verifyJWT: (...args) => mockVerifyJWT(...args),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

const handler = require('../stripe-connect-status');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function makeReq({ method = 'GET', authHeader = 'Bearer valid-jwt' } = {}) {
  return {
    method,
    headers: { authorization: authHeader },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockResolvedValue({ restaurant_id: 'rest-1' });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

describe('method + auth guards', () => {
  test('POST is rejected with 405', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('missing JWT → 401', async () => {
    mockVerifyJWT.mockRejectedValue(new Error('no token'));
    const res = makeRes();
    await handler(makeReq({ authHeader: '' }), res);
    expect(res.statusCode).toBe(401);
  });

  test('JWT without restaurant_id → 401', async () => {
    mockVerifyJWT.mockResolvedValue({ /* no restaurant_id */ });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('status read-back', () => {
  test('no row → { connected: false }', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, connected: false });
  });

  test('row exists → full payload with coerced booleans', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        stripe_account_id: 'acct_abc',
        status: 'active',
        // Postgres often returns these as actual bools, but cover the
        // case where the driver hands back truthy/falsy non-bool too.
        charges_enabled: true,
        payouts_enabled: 1,
        details_submitted: 'yes',
        default_currency: 'brl',
        country: 'BR',
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      connected: true,
      account_id: 'acct_abc',
      status: 'active',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: 'brl',
      country: 'BR',
    });
  });

  test('pending account → flags false', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        stripe_account_id: 'acct_pending',
        status: 'pending',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        default_currency: null,
        country: 'BR',
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.status).toBe('pending');
    expect(res.body.charges_enabled).toBe(false);
    expect(res.body.payouts_enabled).toBe(false);
    expect(res.body.details_submitted).toBe(false);
  });

  test('DB error → 500 db_error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'db_error' });
  });
});

describe('multi-tenancy scoping', () => {
  test('query is filtered by restaurant_id from JWT', async () => {
    mockVerifyJWT.mockResolvedValue({ restaurant_id: 'rest-from-jwt' });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(mockSchema).toHaveBeenCalledWith('restaurant');
    expect(mockFrom).toHaveBeenCalledWith('stripe_connect_accounts');
    expect(mockEq).toHaveBeenCalledWith('restaurant_id', 'rest-from-jwt');
  });
});
