/**
 * Tests for api/cron/sync-stripe-connect-accounts.js
 *
 * Coverage:
 *   - CRON_SECRET auth guard (missing/wrong → 401)
 *   - kill switch (isCronEnabled=false → 200 skipped)
 *   - no rows → checked=0
 *   - row matches Stripe → no drift, no update
 *   - row drifted on charges_enabled → drift detected + update fired
 *   - row drifted on status → drift detected + update fired
 *   - revoked rows excluded from query (the .neq filter)
 *   - Stripe accounts.retrieve throws → counted as error, loop continues
 *   - DB update throws → counted as error, loop continues
 */

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.CRON_SECRET = 'test-cron-secret';

const mockAccountsRetrieve = jest.fn();
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({
  accounts: { retrieve: mockAccountsRetrieve },
})));

const mockRowsQuery = jest.fn();
const mockNeq = jest.fn(() => mockRowsQuery());
const mockSelect = jest.fn(() => ({ neq: mockNeq }));
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect, update: mockUpdate }));
const mockSchema = jest.fn(() => ({ from: mockFrom }));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: mockSchema },
}));

const mockLogCronRun = jest.fn().mockResolvedValue(undefined);
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: (...args) => mockLogCronRun(...args),
}));

const mockIsCronEnabled = jest.fn().mockResolvedValue(true);
jest.mock('../_lib/cron-config', () => ({
  isCronEnabled: (...args) => mockIsCronEnabled(...args),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const handler = require('../_crons/sync-stripe-connect-accounts');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function makeReq({ authHeader = 'Bearer test-cron-secret' } = {}) {
  return { method: 'GET', headers: { authorization: authHeader } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsCronEnabled.mockResolvedValue(true);
  mockUpdateEq.mockResolvedValue({ error: null });
});

describe('auth + kill switch', () => {
  test('wrong CRON_SECRET → 401', async () => {
    const res = makeRes();
    await handler(makeReq({ authHeader: 'Bearer nope' }), res);
    expect(res.statusCode).toBe(401);
    expect(mockRowsQuery).not.toHaveBeenCalled();
  });

  test('missing CRON_SECRET → 401', async () => {
    const res = makeRes();
    await handler(makeReq({ authHeader: '' }), res);
    expect(res.statusCode).toBe(401);
  });

  test('kill switch off → 200 skipped, no Stripe calls', async () => {
    mockIsCronEnabled.mockResolvedValue(false);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe('disabled_by_ops');
    expect(mockAccountsRetrieve).not.toHaveBeenCalled();
  });
});

describe('reconcile loop', () => {
  test('no rows → checked=0, drifted=0', async () => {
    mockRowsQuery.mockResolvedValue({ data: [], error: null });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checked).toBe(0);
    expect(res.body.drifted).toBe(0);
    expect(mockAccountsRetrieve).not.toHaveBeenCalled();
  });

  test('row matches Stripe → no drift, no update', async () => {
    mockRowsQuery.mockResolvedValue({
      data: [{
        id: 'row-1',
        restaurant_id: 'rest-1',
        stripe_account_id: 'acct_active',
        status: 'active',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        default_currency: 'brl',
      }],
      error: null,
    });
    mockAccountsRetrieve.mockResolvedValue({
      id: 'acct_active',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: 'brl',
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body.drifted).toBe(0);
    expect(res.body.updated).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('charges_enabled drifted → update fires with new flags + computed status', async () => {
    mockRowsQuery.mockResolvedValue({
      data: [{
        id: 'row-2',
        restaurant_id: 'rest-2',
        stripe_account_id: 'acct_drift',
        status: 'pending',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        default_currency: 'brl',
      }],
      error: null,
    });
    mockAccountsRetrieve.mockResolvedValue({
      id: 'acct_drift',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: 'brl',
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body.drifted).toBe(1);
    expect(res.body.updated).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      status: 'active',
      default_currency: 'brl',
    }));
  });

  test('status drifted alone → update fires', async () => {
    mockRowsQuery.mockResolvedValue({
      data: [{
        id: 'row-3',
        restaurant_id: 'rest-3',
        stripe_account_id: 'acct_restricted',
        status: 'active',
        charges_enabled: false, // flags already in sync with the computed remote
        payouts_enabled: false,
        details_submitted: true,
        default_currency: 'brl',
      }],
      error: null,
    });
    mockAccountsRetrieve.mockResolvedValue({
      id: 'acct_restricted',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      default_currency: 'brl',
    });
    const res = makeRes();
    await handler(makeReq(), res);
    // computeStatus(charges_enabled=false, details_submitted=true) = 'restricted'
    expect(res.body.drifted).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'restricted',
    }));
  });

  test('query excludes revoked rows via .neq', async () => {
    mockRowsQuery.mockResolvedValue({ data: [], error: null });
    await handler(makeReq(), makeRes());
    expect(mockNeq).toHaveBeenCalledWith('status', 'revoked');
  });

  test('Stripe accounts.retrieve throws → counted as error, no update, loop continues', async () => {
    mockRowsQuery.mockResolvedValue({
      data: [
        { id: 'row-a', restaurant_id: 'r-a', stripe_account_id: 'acct_bad', status: 'active', charges_enabled: true, payouts_enabled: true, details_submitted: true, default_currency: 'brl' },
        { id: 'row-b', restaurant_id: 'r-b', stripe_account_id: 'acct_ok',  status: 'pending', charges_enabled: false, payouts_enabled: false, details_submitted: false, default_currency: 'brl' },
      ],
      error: null,
    });
    mockAccountsRetrieve
      .mockRejectedValueOnce(new Error('account does not exist'))
      .mockResolvedValueOnce({ id: 'acct_ok', charges_enabled: false, payouts_enabled: false, details_submitted: false, default_currency: 'brl' });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body.checked).toBe(2);
    expect(res.body.errors).toBe(1);
    // acct_ok matches its row exactly → no drift, no update.
    expect(res.body.drifted).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('update throws → counted as error, loop continues', async () => {
    mockRowsQuery.mockResolvedValue({
      data: [{
        id: 'row-e',
        restaurant_id: 'r-e',
        stripe_account_id: 'acct_drift',
        status: 'pending',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        default_currency: 'brl',
      }],
      error: null,
    });
    mockAccountsRetrieve.mockResolvedValue({
      id: 'acct_drift',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: 'brl',
    });
    mockUpdateEq.mockResolvedValue({ error: { message: 'db boom' } });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body.drifted).toBe(1);
    expect(res.body.updated).toBe(0);
    expect(res.body.errors).toBe(1);
  });
});
