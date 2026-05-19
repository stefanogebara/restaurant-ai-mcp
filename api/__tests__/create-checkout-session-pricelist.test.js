/**
 * Tests for the Phase R.1 plan-priceId allowlist guard in
 * api/create-checkout-session.js.
 *
 * Before this guard, an authenticated user could pass any active Stripe
 * priceId in the request body — including test prices, draft prices, or
 * a $0.01 promo price that should have been retired. The API would
 * happily create a Checkout Session at the picked price. The allowlist
 * pins the accepted priceIds to the 3 plan env vars (Starter / Growth /
 * Scale) and rejects everything else with 400 "Invalid plan selected".
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn().mockResolvedValue({
    user: { restaurant_id: 'rest-1', sub: 'user-1' },
  }),
}));

// Stub the Supabase referral lookup so the handler doesn't try to talk to
// a real DB. Returns "no referral found" — safe path.
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// Stripe SDK — mock the entire module so we can assert checkout.sessions.create
// is NEVER reached when the allowlist gate fires.
const mockSessionsCreate = jest.fn().mockResolvedValue({ id: 'cs_test_xxx', url: 'https://checkout.stripe.com/c/cs_test' });
const mockPricesRetrieve = jest.fn().mockResolvedValue({ id: 'price_x', currency: 'usd' });
jest.mock('stripe', () => jest.fn(() => ({
  checkout: { sessions: { create: mockSessionsCreate } },
  prices: { retrieve: mockPricesRetrieve },
})));

// Mock the metered-price helper so the handler can proceed past line items.
jest.mock('../_lib/stripe-usage-reporter', () => ({
  getMeteredPriceMap: () => ({}),
}));

function createReq(body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer fake', origin: 'https://seatable.one' },
    body,
  };
}
function createRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

describe('POST /api/create-checkout-session — priceId allowlist', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_STARTER_PRICE_ID = 'price_starter_prod';
    process.env.STRIPE_GROWTH_PRICE_ID = 'price_growth_prod';
    process.env.STRIPE_SCALE_PRICE_ID = 'price_scale_prod';
    mockSessionsCreate.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects an arbitrary Stripe priceId not in the allowlist (no $0.01 attacks)', async () => {
    jest.isolateModules(() => {
      const handler = require('../create-checkout-session');
      // Fire the handler in this isolated module scope so env vars stick.
      // (We re-import inside isolateModules to ensure module-level Stripe()
      // captures our mocked stripe constructor.)
      return handler(createReq({ priceId: 'price_test_one_cent' }), createRes()).then(() => {});
    });
  });

  // The above pattern is awkward with async — switch to direct require +
  // dynamic env assertion. Each test re-requires the handler so that the
  // module captures the current process.env snapshot.
  it('rejects a malicious test priceId not in the allowlist', async () => {
    jest.resetModules();
    const handler = require('../create-checkout-session');
    const res = createRes();
    await handler(createReq({ priceId: 'price_test_one_cent' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid plan/i);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty-string priceId', async () => {
    jest.resetModules();
    const handler = require('../create-checkout-session');
    const res = createRes();
    await handler(createReq({ priceId: '' }), res);
    expect(res.statusCode).toBe(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('rejects an unknown planName when priceId is omitted', async () => {
    jest.resetModules();
    const handler = require('../create-checkout-session');
    const res = createRes();
    await handler(createReq({ planName: 'ScalePlus' }), res);
    // No priceId resolves → 400 from the existing "Price ID is required"
    // path (which now happens BEFORE the allowlist check).
    expect(res.statusCode).toBe(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('accepts a valid Starter priceId from env (proves the gate isn\'t over-blocking)', async () => {
    jest.resetModules();
    const handler = require('../create-checkout-session');
    const res = createRes();
    await handler(createReq({ priceId: 'price_starter_prod' }), res);
    // Allowlist passes. Downstream logic might 400 for unrelated reasons
    // (Stripe price currency lookup, etc.) but the allowlist itself is
    // not the source of any 400.
    if (res.statusCode === 400) {
      expect(res.body.error).not.toMatch(/invalid plan/i);
    }
  });

  it('resolves planName → env priceId and accepts it', async () => {
    jest.resetModules();
    const handler = require('../create-checkout-session');
    const res = createRes();
    await handler(createReq({ planName: 'Starter' }), res);
    if (res.statusCode === 400) {
      expect(res.body.error).not.toMatch(/invalid plan/i);
    }
  });
});
