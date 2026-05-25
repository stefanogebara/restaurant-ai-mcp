/**
 * Tests for Phase 8-10 API endpoints that had zero coverage:
 *   - table-suggestion.js
 *   - push-subscribe.js
 *   - deposit-config.js
 *   - create-deposit-intent.js
 *   - capture-deposit.js
 *   - release-deposit.js
 *
 * Note: staffing-forecast, staffing-config, revenue-stats, and voice-persona
 * already have dedicated test files and are excluded here.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// TABLE-SUGGESTION
// ---------------------------------------------------------------------------

describe('table-suggestion', () => {
  let mockVerifyAuth;
  let mockGetAllTables;
  let mockSuggestTable;
  let handler;

  beforeEach(() => {
    jest.resetModules();

    mockVerifyAuth = jest.fn().mockResolvedValue({
      user: { restaurant_id: 'rest-1' },
    });
    mockGetAllTables = jest.fn().mockResolvedValue({
      success: true,
      tables: [
        { id: 't1', table_number: 1, capacity: 4, status: 'available', location: 'Main', position_x: 0, position_y: 0 },
        { id: 't2', table_number: 2, capacity: 2, status: 'occupied', location: 'Main', position_x: 5, position_y: 5 },
      ],
    });
    mockSuggestTable = jest.fn().mockReturnValue({
      suggested_table_id: 't1',
      table_name: 'Table 1',
      reasoning: 'Seats 4, perfect fit for party of 4',
      score: 80,
    });

    jest.mock('../_lib/auth', () => ({ verifyAuth: (...a) => mockVerifyAuth(...a) }));
    jest.mock('../_lib/supabase', () => ({ getAllTables: (...a) => mockGetAllTables(...a) }));
    jest.mock('../services/tableAssignmentService', () => ({ suggestTable: (...a) => mockSuggestTable(...a) }));
    jest.mock('../_lib/cors', () => ({
      setInternalCors: jest.fn(),
      handlePreflight: jest.fn(() => false),
    }));
    jest.mock('../_lib/rate-limit', () => ({
      checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
    }));
    jest.mock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
    }));

    handler = require('../table-suggestion');
  });

  it('returns suggestion for valid party_size', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { party_size: '4' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      suggestion: expect.objectContaining({
        suggested_table_id: 't1',
        table_name: 'Table 1',
        score: 80,
      }),
    }));
  });

  it('returns 401 when auth fails', async () => {
    mockVerifyAuth.mockResolvedValue({ error: 'UNAUTHORIZED', status: 401 });
    const req = { method: 'GET', headers: {}, query: { party_size: '4' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when party_size is missing', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, query: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when party_size is out of range', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { party_size: '25' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for POST', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, query: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns null suggestion when no table fits', async () => {
    mockSuggestTable.mockReturnValue(null);
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { party_size: '15' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.suggestion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PUSH-SUBSCRIBE
// ---------------------------------------------------------------------------

describe('push-subscribe', () => {
  let mockSupabaseAdmin;
  let handler;

  const validSubscription = {
    endpoint: 'https://fcm.googleapis.com/test',
    keys: { p256dh: 'key123', auth: 'auth456' },
  };

  beforeEach(() => {
    jest.resetModules();

    mockSupabaseAdmin = {
      from: jest.fn(),
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { id: 'rest-1' }, error: null }),
              maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'rest-1' }, error: null }),
            }),
          }),
        }),
      }),
    };

    jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
    jest.mock('../_lib/cors', () => ({
      setInternalCors: jest.fn(),
      handlePreflight: jest.fn(() => false),
    }));
    jest.mock('../_lib/rate-limit', () => ({
      checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
    }));
    jest.mock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
    }));

    handler = require('../push-subscribe');
  });

  it('stores subscription and returns 201', async () => {
    const countChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const insertChain = { insert: jest.fn().mockResolvedValue({ error: null }) };
    mockSupabaseAdmin.from
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(insertChain);

    const req = {
      method: 'POST',
      body: { subscription: validSubscription, restaurant_id: 'rest-1', reservation_id: 'res-1' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 400 when subscription is missing', async () => {
    const req = {
      method: 'POST',
      body: { restaurant_id: 'rest-1' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when restaurant_id is missing', async () => {
    const req = {
      method: 'POST',
      body: { subscription: validSubscription },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when subscription keys are missing', async () => {
    const req = {
      method: 'POST',
      body: {
        subscription: { endpoint: 'https://fcm.test' }, // no keys
        restaurant_id: 'rest-1',
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for GET', async () => {
    const req = { method: 'GET', body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ---------------------------------------------------------------------------
// DEPOSIT-CONFIG
// ---------------------------------------------------------------------------

describe('deposit-config', () => {
  let mockVerifyAuth;
  let mockSupabaseAdmin;
  let handler;

  beforeEach(() => {
    jest.resetModules();

    mockVerifyAuth = jest.fn().mockResolvedValue({
      user: { restaurant_id: 'rest-1' },
    });

    const schemaChain = { from: jest.fn() };
    mockSupabaseAdmin = {
      schema: jest.fn().mockReturnValue(schemaChain),
    };
    mockSupabaseAdmin._schemaChain = schemaChain;

    jest.mock('../_lib/auth', () => ({ verifyAuth: (...a) => mockVerifyAuth(...a) }));
    jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
    jest.mock('../_lib/cors', () => ({
      setInternalCors: jest.fn(),
      handlePreflight: jest.fn(() => false),
    }));
    jest.mock('../_lib/rate-limit', () => ({
      checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
    }));
    jest.mock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
    }));

    handler = require('../deposit-config');
  });

  function makeChain(data, updateError = null) {
    const chain = {
      from: jest.fn(),
      select: jest.fn(),
      eq: jest.fn(),
      single: jest.fn(),
      update: jest.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data, error: null });
    // update().eq() chain for PATCH
    const updateChain = { eq: jest.fn().mockResolvedValue({ error: updateError }) };
    chain.update.mockReturnValue(updateChain);
    return chain;
  }

  it('GET returns deposit_config', async () => {
    const depositConfig = { enabled: true, type: 'flat', amount: 20 };
    const chain = makeChain({ deposit_config: depositConfig });
    mockSupabaseAdmin._schemaChain.from.mockReturnValue(chain);

    const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, deposit_config: depositConfig }));
  });

  it('PATCH enables deposit config with valid params', async () => {
    // GET call (read existing) + update call — both use same chain
    const chain = makeChain({ deposit_config: { enabled: false, type: 'flat', amount: 0 } });
    mockSupabaseAdmin._schemaChain.from.mockReturnValue(chain);

    const req = {
      method: 'PATCH',
      headers: { authorization: 'Bearer tok' },
      body: { enabled: true, type: 'flat', amount: 25 },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.deposit_config.enabled).toBe(true);
    expect(body.deposit_config.type).toBe('flat');
  });

  it('PATCH returns 400 when enabled is not boolean', async () => {
    const req = {
      method: 'PATCH',
      headers: { authorization: 'Bearer tok' },
      body: { enabled: 'yes' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('PATCH returns 400 when type is invalid', async () => {
    const req = {
      method: 'PATCH',
      headers: { authorization: 'Bearer tok' },
      body: { enabled: true, type: 'invalid', amount: 20 },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('PATCH returns 400 when amount is out of range', async () => {
    const req = {
      method: 'PATCH',
      headers: { authorization: 'Bearer tok' },
      body: { enabled: true, type: 'flat', amount: 600 },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when auth fails', async () => {
    mockVerifyAuth.mockResolvedValue({ error: 'UNAUTHORIZED', status: 401 });
    const req = { method: 'GET', headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 405 for DELETE', async () => {
    const req = { method: 'DELETE', headers: { authorization: 'Bearer tok' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ---------------------------------------------------------------------------
// CREATE-DEPOSIT-INTENT
// ---------------------------------------------------------------------------

describe('create-deposit-intent', () => {
  let mockSupabaseAdmin;
  let mockStripePaymentIntentsCreate;
  let handler;

  beforeEach(() => {
    jest.resetModules();

    mockStripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_test123',
      client_secret: 'pi_test123_secret',
    });

    const schemaChain = { from: jest.fn() };
    mockSupabaseAdmin = { schema: jest.fn().mockReturnValue(schemaChain) };
    mockSupabaseAdmin._schemaChain = schemaChain;

    jest.mock('stripe', () => {
      return jest.fn().mockReturnValue({
        paymentIntents: { create: (...a) => mockStripePaymentIntentsCreate(...a) },
      });
    });
    jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
    jest.mock('../_lib/rate-limit', () => ({
      checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
    }));
    jest.mock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
    }));
    // Source added booking-token auth gate (line 35: verifyBookingToken).
    // Without a real token the handler 403s. Mock it to always pass — tests
    // here exercise the deposit math + Stripe call, not the token guard
    // (which has its own coverage elsewhere).
    jest.mock('../booking-token', () => ({
      verifyBookingToken: jest.fn().mockReturnValue(true),
    }));

    handler = require('../create-deposit-intent');
  });

  function makeConfigChain(depositConfig, restaurantName = 'Test Restaurant') {
    const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.single.mockResolvedValue({
      data: { deposit_config: depositConfig, restaurant_name: restaurantName },
      error: null,
    });
    return chain;
  }

  it('creates payment intent and returns client_secret', async () => {
    const depositConfig = { enabled: true, type: 'flat', amount: 30 };
    mockSupabaseAdmin._schemaChain.from.mockReturnValue(makeConfigChain(depositConfig));

    const req = {
      method: 'POST',
      body: { restaurant_id: 'rest-1', party_size: 2, customer_email: 'test@test.com' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.client_secret).toBe('pi_test123_secret');
    expect(body.payment_intent_id).toBe('pi_test123');
    expect(body.deposit_amount).toBe(30);
  });

  it('calculates per_person deposit correctly', async () => {
    const depositConfig = { enabled: true, type: 'per_person', amount: 10 };
    mockSupabaseAdmin._schemaChain.from.mockReturnValue(makeConfigChain(depositConfig));

    const req = {
      method: 'POST',
      body: { restaurant_id: 'rest-1', party_size: 4 },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.deposit_amount).toBe(40); // 10 * 4
  });

  it('returns 400 when restaurant_id is missing', async () => {
    const req = { method: 'POST', body: { party_size: 2 } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when party_size is invalid', async () => {
    const req = { method: 'POST', body: { restaurant_id: 'rest-1', party_size: 0 } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when deposits are not enabled', async () => {
    const depositConfig = { enabled: false };
    mockSupabaseAdmin._schemaChain.from.mockReturnValue(makeConfigChain(depositConfig));

    const req = { method: 'POST', body: { restaurant_id: 'rest-1', party_size: 2 } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for GET', async () => {
    const req = { method: 'GET', body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ---------------------------------------------------------------------------
// CAPTURE-DEPOSIT
// ---------------------------------------------------------------------------

describe('capture-deposit', () => {
  let mockVerifyAuth;
  let mockSupabaseAdmin;
  let mockStripePaymentIntentsCapture;
  let handler;

  beforeEach(() => {
    jest.resetModules();

    mockVerifyAuth = jest.fn().mockResolvedValue({
      user: { restaurant_id: 'rest-1' },
    });
    mockStripePaymentIntentsCapture = jest.fn().mockResolvedValue({
      id: 'pi_test123',
      amount_received: 3000,
    });

    const fromChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn(), update: jest.fn() };
    fromChain.select.mockReturnValue(fromChain);
    fromChain.eq.mockReturnValue(fromChain);
    fromChain.update.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({
      data: {
        id: 'internal-id-1',
        deposit_payment_intent_id: 'pi_test123',
        deposit_amount: 30,
        restaurant_id: 'rest-1',
      },
      error: null,
    });

    mockSupabaseAdmin = { from: jest.fn().mockReturnValue(fromChain) };

    jest.mock('stripe', () => {
      return jest.fn().mockReturnValue({
        paymentIntents: { capture: (...a) => mockStripePaymentIntentsCapture(...a) },
      });
    });
    jest.mock('../_lib/auth', () => ({ verifyAuth: (...a) => mockVerifyAuth(...a) }));
    jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
    jest.mock('../_lib/cors', () => ({
      setInternalCors: jest.fn(),
      handlePreflight: jest.fn(() => false),
    }));
    jest.mock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
    }));

    handler = require('../capture-deposit');
  });

  it('captures deposit and returns amount_captured', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: { reservation_id: 'res-1' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.amount_captured).toBe(30); // 3000 / 100
    expect(body.payment_intent_id).toBe('pi_test123');
  });

  it('returns 401 when auth fails', async () => {
    mockVerifyAuth.mockResolvedValue({ error: 'UNAUTHORIZED', status: 401 });
    const req = { method: 'POST', headers: {}, body: { reservation_id: 'res-1' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when reservation_id is missing', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when reservation is not found', async () => {
    const fromChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    fromChain.select.mockReturnValue(fromChain);
    fromChain.eq.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });
    mockSupabaseAdmin.from.mockReturnValue(fromChain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { reservation_id: 'bad-id' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when no deposit is held', async () => {
    const fromChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    fromChain.select.mockReturnValue(fromChain);
    fromChain.eq.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({
      data: { id: 'internal-id-1', deposit_payment_intent_id: null, restaurant_id: 'rest-1' },
      error: null,
    });
    mockSupabaseAdmin.from.mockReturnValue(fromChain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { reservation_id: 'res-1' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for GET', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ---------------------------------------------------------------------------
// RELEASE-DEPOSIT
// ---------------------------------------------------------------------------

describe('release-deposit', () => {
  let mockVerifyAuth;
  let mockSupabaseAdmin;
  let mockStripePaymentIntentsCancel;
  let handler;

  beforeEach(() => {
    jest.resetModules();

    mockVerifyAuth = jest.fn().mockResolvedValue({
      user: { restaurant_id: 'rest-1' },
    });
    mockStripePaymentIntentsCancel = jest.fn().mockResolvedValue({
      id: 'pi_test123',
      status: 'canceled',
    });

    const fromChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn(), update: jest.fn() };
    fromChain.select.mockReturnValue(fromChain);
    fromChain.eq.mockReturnValue(fromChain);
    fromChain.update.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({
      data: {
        id: 'internal-id-1',
        deposit_payment_intent_id: 'pi_test123',
        deposit_amount: 30,
        restaurant_id: 'rest-1',
      },
      error: null,
    });

    mockSupabaseAdmin = { from: jest.fn().mockReturnValue(fromChain) };

    jest.mock('stripe', () => {
      return jest.fn().mockReturnValue({
        paymentIntents: { cancel: (...a) => mockStripePaymentIntentsCancel(...a) },
      });
    });
    jest.mock('../_lib/auth', () => ({ verifyAuth: (...a) => mockVerifyAuth(...a) }));
    jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
    jest.mock('../_lib/cors', () => ({
      setInternalCors: jest.fn(),
      handlePreflight: jest.fn(() => false),
    }));
    jest.mock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
    }));

    handler = require('../release-deposit');
  });

  it('cancels payment intent and returns success', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: { reservation_id: 'res-1' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.message).toContain('released');
    expect(body.payment_intent_id).toBe('pi_test123');
  });

  it('returns 401 when auth fails', async () => {
    mockVerifyAuth.mockResolvedValue({ error: 'UNAUTHORIZED', status: 401 });
    const req = { method: 'POST', headers: {}, body: { reservation_id: 'res-1' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when reservation_id is missing', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when reservation is not found', async () => {
    const fromChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    fromChain.select.mockReturnValue(fromChain);
    fromChain.eq.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });
    mockSupabaseAdmin.from.mockReturnValue(fromChain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { reservation_id: 'bad-id' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when no deposit is held', async () => {
    const fromChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    fromChain.select.mockReturnValue(fromChain);
    fromChain.eq.mockReturnValue(fromChain);
    fromChain.single.mockResolvedValue({
      data: { id: 'internal-id-1', deposit_payment_intent_id: null, restaurant_id: 'rest-1' },
      error: null,
    });
    mockSupabaseAdmin.from.mockReturnValue(fromChain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { reservation_id: 'res-1' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for GET', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
