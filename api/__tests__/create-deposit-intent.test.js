/**
 * Tests for api/create-deposit-intent.js focusing on the Stripe Connect
 * routing decision tree.
 *
 * Coverage:
 *   - No connected account → platform-only PaymentIntent (no on_behalf_of)
 *   - Status='active' + charges_enabled=true → destination charge
 *   - Status='pending' → platform-only (charges_enabled false)
 *   - Status='revoked' → platform-only
 *   - Currency mismatch with connected account → platform-only (logged)
 *   - Connect lookup throws → platform-only fallback
 *   - metadata.routed_to flag set correctly in both paths
 */

// --- Stripe SDK mock ---
const mockPaymentIntentCreate = jest.fn();
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({
  paymentIntents: { create: mockPaymentIntentCreate },
})));

// --- Supabase chain mocks ---
// restaurant_config single() returns deposit_config + name + country
// stripe_connect_accounts maybeSingle() returns the connect row (or null)
const mockConfigSingle = jest.fn();
const mockConnectMaybeSingle = jest.fn();

const mockConfigEq = jest.fn(() => ({ single: mockConfigSingle }));
const mockConfigSelect = jest.fn(() => ({ eq: mockConfigEq }));
const mockConnectEq = jest.fn(() => ({ maybeSingle: mockConnectMaybeSingle }));
const mockConnectSelect = jest.fn(() => ({ eq: mockConnectEq }));

const mockFrom = jest.fn((tableName) => {
  if (tableName === 'restaurant_config') {
    return { select: mockConfigSelect };
  }
  if (tableName === 'stripe_connect_accounts') {
    return { select: mockConnectSelect };
  }
  throw new Error(`Unexpected from('${tableName}')`);
});

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: jest.fn(() => ({ from: mockFrom })),
  },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn().mockReturnValue(false),
}));

const mockVerifyBookingToken = jest.fn();
jest.mock('../booking-token', () => ({
  verifyBookingToken: (...args) => mockVerifyBookingToken(...args),
}));

jest.mock('../_lib/currency', () => ({
  resolveDepositCurrency: jest.fn((_country, override) => override || 'brl'),
  minChargeAmount: jest.fn(() => 1),
}));

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
const handler = require('../create-deposit-intent');

// --- Helpers ---
function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

function makeReq(body) {
  return {
    method: 'POST',
    headers: {},
    body: {
      restaurant_id: 'rest-1',
      party_size: 2,
      booking_token: 'tok',
      ...body,
    },
  };
}

const DEFAULT_CONFIG = {
  deposit_config: { enabled: true, type: 'flat', amount: 50, currency: 'brl' },
  restaurant_name: 'Test Bistro',
  country: 'BR',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyBookingToken.mockReturnValue(true);
  mockConfigSingle.mockResolvedValue({ data: DEFAULT_CONFIG, error: null });
  mockConnectMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockPaymentIntentCreate.mockResolvedValue({
    id: 'pi_test_123',
    client_secret: 'pi_test_123_secret',
    amount: 5000,
  });
});

describe('Connect routing — no connected account', () => {
  test('no row → platform-only, routed_to=platform, no on_behalf_of', async () => {
    mockConnectMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const args = mockPaymentIntentCreate.mock.calls[0][0];
    expect(args.on_behalf_of).toBeUndefined();
    expect(args.transfer_data).toBeUndefined();
    expect(args.metadata.routed_to).toBe('platform');
    expect(args.metadata.connect_account_id).toBeUndefined();
  });
});

describe('Connect routing — active + charges_enabled', () => {
  test('active + charges_enabled → on_behalf_of + transfer_data set, routed_to=connect', async () => {
    mockConnectMaybeSingle.mockResolvedValue({
      data: {
        stripe_account_id: 'acct_connect_abc',
        status: 'active',
        charges_enabled: true,
        default_currency: 'brl',
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const args = mockPaymentIntentCreate.mock.calls[0][0];
    expect(args.on_behalf_of).toBe('acct_connect_abc');
    expect(args.transfer_data).toEqual({ destination: 'acct_connect_abc' });
    expect(args.metadata.routed_to).toBe('connect');
    expect(args.metadata.connect_account_id).toBe('acct_connect_abc');
    // We deliberately do NOT add application_fee_amount — restaurants keep 100%.
    expect(args.application_fee_amount).toBeUndefined();
  });
});

describe('Connect routing — not eligible', () => {
  test('status=pending → platform-only', async () => {
    mockConnectMaybeSingle.mockResolvedValue({
      data: {
        stripe_account_id: 'acct_pending',
        status: 'pending',
        charges_enabled: false,
        default_currency: 'brl',
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);

    const args = mockPaymentIntentCreate.mock.calls[0][0];
    expect(args.on_behalf_of).toBeUndefined();
    expect(args.metadata.routed_to).toBe('platform');
  });

  test('status=revoked → platform-only', async () => {
    mockConnectMaybeSingle.mockResolvedValue({
      data: {
        stripe_account_id: 'acct_gone',
        status: 'revoked',
        charges_enabled: false,
        default_currency: 'brl',
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);

    const args = mockPaymentIntentCreate.mock.calls[0][0];
    expect(args.on_behalf_of).toBeUndefined();
    expect(args.metadata.routed_to).toBe('platform');
  });

  test('active but charges_enabled=false → platform-only', async () => {
    mockConnectMaybeSingle.mockResolvedValue({
      data: {
        stripe_account_id: 'acct_restricted',
        status: 'active',
        charges_enabled: false,
        default_currency: 'brl',
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);

    const args = mockPaymentIntentCreate.mock.calls[0][0];
    expect(args.on_behalf_of).toBeUndefined();
    expect(args.metadata.routed_to).toBe('platform');
  });

  test('currency mismatch (eur deposit vs brl connect acct) → platform-only', async () => {
    // Override resolveDepositCurrency to return eur for this case
    const currencyModule = require('../_lib/currency');
    currencyModule.resolveDepositCurrency.mockReturnValueOnce('eur');
    mockConnectMaybeSingle.mockResolvedValue({
      data: {
        stripe_account_id: 'acct_brl_only',
        status: 'active',
        charges_enabled: true,
        default_currency: 'brl',
      },
      error: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);

    const args = mockPaymentIntentCreate.mock.calls[0][0];
    expect(args.on_behalf_of).toBeUndefined();
    expect(args.metadata.routed_to).toBe('platform');
    expect(args.currency).toBe('eur');
  });

  test('Connect lookup throws → platform-only fallback (booking flow not broken)', async () => {
    mockConnectMaybeSingle.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const args = mockPaymentIntentCreate.mock.calls[0][0];
    expect(args.on_behalf_of).toBeUndefined();
    expect(args.metadata.routed_to).toBe('platform');
  });
});
