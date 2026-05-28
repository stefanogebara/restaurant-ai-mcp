/**
 * Tests for api/stripe-connect-webhook.js
 * Stripe Connect (platform-side) webhook handler.
 */

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect';

// --- Stripe SDK mock ---
const mockConstructEvent = jest.fn();
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({
  webhooks: { constructEvent: mockConstructEvent },
})));

// --- Supabase mock chain ---
// All factory-referenced names MUST be prefixed `mock` (jest hoist guard).
const mockIdempInsert = jest.fn();
const mockConnectUpdateSelect = jest.fn();
const mockConnectUpdateEq = jest.fn(() => ({ select: mockConnectUpdateSelect }));
const mockDeauthUpdateEq = jest.fn();
const mockConnectUpdate = jest.fn(() => ({ eq: mockConnectUpdateEq }));
const mockDeauthUpdate = jest.fn(() => ({ eq: mockDeauthUpdateEq }));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn((tableName) => {
      if (tableName === 'stripe_webhook_events_processed') {
        return { insert: mockIdempInsert };
      }
      throw new Error(`Unexpected from('${tableName}')`);
    }),
    schema: jest.fn((schemaName) => ({
      from: jest.fn((tableName) => {
        if (schemaName === 'restaurant' && tableName === 'stripe_connect_accounts') {
          return {
            // Branch on the status field to tell `account.updated` (computed status)
            // from `account.application.deauthorized` (status='revoked').
            update: jest.fn((fields) => {
              return fields.status === 'revoked'
                ? mockDeauthUpdate(fields)
                : mockConnectUpdate(fields);
            }),
          };
        }
        throw new Error(`Unexpected ${schemaName}.${tableName}`);
      }),
    })),
  },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../_lib/cors', () => ({
  setWebhookCors: jest.fn(),
}));

const handler = require('../stripe-connect-webhook');

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
// Handler now reads raw bytes via the Node stream API (bodyParser: false).
// Build a minimal EventEmitter that emits the payload bytes synchronously.
function makeReq({ method = 'POST', body = '{}', headers = {} } = {}) {
  const handlers = { data: [], end: [], error: [] };
  return {
    method,
    headers: { 'stripe-signature': 't=1,v1=valid', ...headers },
    on(event, fn) {
      if (handlers[event]) handlers[event].push(fn);
      // Once 'end' is registered, fire data then end on next tick so the
      // awaited Promise resolves naturally.
      if (event === 'end') {
        process.nextTick(() => {
          if (body !== null && body !== undefined) {
            for (const fn of handlers.data) fn(Buffer.from(body));
          }
          for (const fn of handlers.end) fn();
        });
      }
      return this;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdempInsert.mockResolvedValue({ error: null });
  mockConnectUpdateSelect.mockResolvedValue({ data: [{ id: 'row-1' }], error: null });
  mockDeauthUpdateEq.mockResolvedValue({ error: null });
});

describe('method + CORS guards', () => {
  test('OPTIONS preflight returns 200 without processing', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'OPTIONS' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  test('GET is rejected with 405', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toMatch(/Method not allowed/);
  });
});

describe('signature verification', () => {
  test('empty body → 400 (no_raw_body)', async () => {
    const res = makeRes();
    await handler(makeReq({ body: null }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.reason).toBe('no_raw_body');
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  test('invalid signature → 400', async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error('No signatures found'); });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid webhook/);
    expect(res.body.reason).toBe('bad_signature');
  });

  test('stream is read into UTF-8 string before signature verify', async () => {
    let observedBody = null;
    mockConstructEvent.mockImplementation((body) => {
      observedBody = body;
      return {
        id: 'evt_str',
        type: 'capability.updated',
        account: 'acct_x',
        data: { object: { id: 'cap_a', status: 'active', requested: true } },
      };
    });
    const res = makeRes();
    await handler(makeReq({ body: '{"hello":"world"}' }), res);
    expect(res.statusCode).toBe(200);
    expect(observedBody).toBe('{"hello":"world"}');
  });
});

describe('idempotency', () => {
  test('duplicate event (23505) → 200 with deduplicated:true and no handler dispatch', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'account.updated',
      data: { object: { id: 'acct_1', charges_enabled: true, payouts_enabled: true, details_submitted: true } },
    });
    mockIdempInsert.mockResolvedValue({ error: { code: '23505', message: 'dup key' } });

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, deduplicated: true });
    expect(mockConnectUpdate).not.toHaveBeenCalled();
  });

  test('non-23505 insert error → continues and processes event', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_idem_err',
      type: 'account.updated',
      data: { object: { id: 'acct_2', charges_enabled: false, payouts_enabled: false, details_submitted: false } },
    });
    mockIdempInsert.mockResolvedValue({ error: { code: '99999', message: 'transient' } });

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(mockConnectUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('account.updated', () => {
  test('charges_enabled + details_submitted → status=active', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_a1',
      type: 'account.updated',
      data: { object: {
        id: 'acct_active',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        default_currency: 'brl',
      }},
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(mockConnectUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: 'brl',
    }));
    expect(mockConnectUpdateEq).toHaveBeenCalledWith('stripe_account_id', 'acct_active');
  });

  test('details_submitted only → status=restricted', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_a2',
      type: 'account.updated',
      data: { object: {
        id: 'acct_restricted',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
      }},
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(mockConnectUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'restricted' }));
  });

  test('nothing submitted → status=pending', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_a3',
      type: 'account.updated',
      data: { object: {
        id: 'acct_pending',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      }},
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(mockConnectUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  test('row not found → 200 with warn (no Stripe retry storm)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_a4',
      type: 'account.updated',
      data: { object: { id: 'acct_unknown', charges_enabled: true, details_submitted: true } },
    });
    mockConnectUpdateSelect.mockResolvedValue({ data: [], error: null });

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
  });

  test('DB error → 500 so Stripe retries', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_a5',
      type: 'account.updated',
      data: { object: { id: 'acct_dberr', charges_enabled: true, details_submitted: true } },
    });
    mockConnectUpdateSelect.mockResolvedValue({ data: null, error: { message: 'connection lost' } });

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('account.application.deauthorized', () => {
  test('marks row as revoked with charges/payouts disabled', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_deauth',
      type: 'account.application.deauthorized',
      account: 'acct_gone',
      data: { object: { id: 'ca_app' } },
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(mockDeauthUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'revoked',
      charges_enabled: false,
      payouts_enabled: false,
    }));
    expect(mockDeauthUpdateEq).toHaveBeenCalledWith('stripe_account_id', 'acct_gone');
  });

  test('DB error on deauthorize → 500', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_deauth_err',
      type: 'account.application.deauthorized',
      account: 'acct_gone',
      data: { object: { id: 'ca_app' } },
    });
    mockDeauthUpdateEq.mockResolvedValue({ error: { message: 'db down' } });

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('capability.updated', () => {
  test('logs only, no DB write', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_cap',
      type: 'capability.updated',
      account: 'acct_x',
      data: { object: { id: 'card_payments', status: 'active', requested: true } },
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(mockConnectUpdate).not.toHaveBeenCalled();
    expect(mockDeauthUpdate).not.toHaveBeenCalled();
  });
});

describe('unknown event types', () => {
  test('return 200 without side-effects', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_unknown',
      type: 'invoice.created',
      data: { object: {} },
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(mockConnectUpdate).not.toHaveBeenCalled();
    expect(mockDeauthUpdate).not.toHaveBeenCalled();
  });
});
