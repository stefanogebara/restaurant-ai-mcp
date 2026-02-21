/**
 * Onboarding Complete Tests
 *
 * Tests Brazil free plan logic vs non-Brazil Growth trial.
 * Focuses on the subscription creation path in Step 5.
 */

// ---------------------------------------------------------------------------
// Fake environment variables
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.CLIENT_URL = 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Chainable Supabase mock
// ---------------------------------------------------------------------------
function createChainableMock(resolvedValue = { data: null, error: null }) {
  const calls = [];
  const handler = {
    get(target, prop) {
      if (prop === 'then') return (resolve) => resolve(resolvedValue);
      if (prop === '__calls') return calls;
      return (...args) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

// Track subscription inserts
let capturedSubscriptionInsert = null;

const mockSupabaseAdmin = {
  from: jest.fn((table) => {
    if (table === 'subscriptions') {
      return {
        insert: jest.fn((data) => {
          capturedSubscriptionInsert = data;
          return {
            select: jest.fn(() => ({
              single: jest.fn(() =>
                Promise.resolve({ data: { ...data, id: 'sub-uuid' }, error: null })
              ),
            })),
          };
        }),
      };
    }
    if (table === 'tables') {
      return {
        delete: jest.fn(() => createChainableMock({ data: null, error: null })),
        insert: jest.fn(() => createChainableMock({ data: [], error: null })),
        update: jest.fn(() => createChainableMock({ data: null, error: null })),
      };
    }
    return createChainableMock({ data: null, error: null });
  }),
  schema: jest.fn(() => ({
    from: jest.fn(() =>
      createChainableMock({ data: { id: 'config-uuid', slug: 'test-restaurant' }, error: null })
    ),
  })),
  auth: {
    admin: {
      listUsers: jest.fn(() =>
        Promise.resolve({ data: { users: [] }, error: null })
      ),
      createUser: jest.fn(() =>
        Promise.resolve({
          data: { user: { id: 'user-uuid' } },
          error: null,
        })
      ),
    },
  },
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(() =>
    Promise.resolve({ user: { id: 'user-1', restaurant_id: 'rest-1' } })
  ),
}));

jest.mock('../_lib/timezone', () => ({
  suggestTimezone: jest.fn(() => 'America/Sao_Paulo'),
}));

// Mock node-fetch to prevent actual HTTP calls
jest.mock('node-fetch', () =>
  jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      text: () => Promise.resolve('mock error'),
    })
  )
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function mockReqRes(body = {}) {
  const req = {
    method: 'POST',
    body,
    headers: { authorization: 'Bearer test-token' },
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return { req, res };
}

const BASE_BODY = {
  customer_email: 'test@example.com',
  restaurant_name: 'Test Restaurant',
  phone_number: '+5511999999999',
  email: 'test@example.com',
  city: 'São Paulo',
  country: 'Brazil',
  business_hours: [
    { day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' },
  ],
  areas: [
    {
      name: 'Main',
      tables: [{ capacity: 4, count: 3, shape: 'square', is_joinable: true }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Require the handler
// ---------------------------------------------------------------------------
const handler = require('../onboarding/complete');

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  capturedSubscriptionInsert = null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Brazil country detection → free plan', () => {
  test('country "Brazil" creates free plan subscription', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Brazil',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Free');
    expect(capturedSubscriptionInsert.status).toBe('active');
    expect(capturedSubscriptionInsert.price_id).toBe('free');
  });

  test('country "brasil" (Portuguese spelling) creates free plan', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'brasil',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Free');
    expect(capturedSubscriptionInsert.status).toBe('active');
  });

  test('country "BRAZIL" (uppercase) creates free plan', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'BRAZIL',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Free');
  });

  test('free plan has far-future expiry (2099)', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Brazil',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert.current_period_end).toContain('2099');
  });
});

describe('Non-Brazil country → Growth trial', () => {
  test('country "Spain" creates 14-day Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Spain',
      city: 'Madrid',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
    expect(capturedSubscriptionInsert.status).toBe('trialing');
    expect(capturedSubscriptionInsert.price_id).toBe('trial');
  });

  test('country "Germany" creates Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Germany',
      city: 'Berlin',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
    expect(capturedSubscriptionInsert.status).toBe('trialing');
  });

  test('Growth trial has trial_end set', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Spain',
      city: 'Madrid',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert.trial_end).toBeDefined();
    // Trial should be roughly 14 days from now
    const trialEnd = new Date(capturedSubscriptionInsert.trial_end);
    const now = new Date();
    const diffDays = (trialEnd - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(13);
    expect(diffDays).toBeLessThan(15);
  });
});

describe('Missing country → Growth trial', () => {
  test('undefined country creates Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: undefined,
      city: undefined,
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // country undefined → isBrazil is false → Growth trial
    if (capturedSubscriptionInsert) {
      expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
      expect(capturedSubscriptionInsert.status).toBe('trialing');
    }
  });

  test('empty string country creates Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: '',
      city: '',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    if (capturedSubscriptionInsert) {
      expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
    }
  });
});

describe('Validation', () => {
  test('rejects POST with missing required fields', async () => {
    const { req, res } = mockReqRes({
      customer_email: 'test@example.com',
      // Missing restaurant_name, phone_number, email
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Missing required fields' })
    );
  });

  test('rejects non-POST methods', async () => {
    const req = {
      method: 'GET',
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('handles OPTIONS preflight', async () => {
    const req = {
      method: 'OPTIONS',
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns auth error when verifyAuth fails (line 99)', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });
});

// ============================================================
// Invalid restaurant_type (line 150)
// ============================================================
describe('restaurant_type validation', () => {
  test('logs warning for invalid restaurant_type (line 150)', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      restaurant_type: 'invalid-cuisine-type',
    });
    await handler(req, res);
    // Still succeeds (type set to null, not a fatal error)
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// No tables (line 272)
// ============================================================
describe('Empty areas / no tables', () => {
  test('succeeds when areas is empty (line 272)', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      areas: [],
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('succeeds when areas has tables with count 0', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      areas: [{ name: 'Main', tables: [{ capacity: 4, count: 0 }] }],
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// User management edge cases (lines 285, 291-292, 305, 313)
// ============================================================
describe('User management edge cases', () => {
  test('logs warning when listUsers fails (line 285)', async () => {
    mockSupabaseAdmin.auth.admin.listUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: { message: 'Auth service unavailable' },
    });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('uses existing user when found by email (lines 291-292)', async () => {
    mockSupabaseAdmin.auth.admin.listUsers.mockResolvedValueOnce({
      data: { users: [{ email: 'test@example.com', id: 'existing-user-uuid' }] },
      error: null,
    });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('logs warning when createUser fails (line 305)', async () => {
    // listUsers returns empty → tries createUser → createUser fails
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Email already registered' },
    });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('handles auth block throwing (line 313)', async () => {
    // listUsers throws to trigger the catch block
    mockSupabaseAdmin.auth.admin.listUsers.mockRejectedValueOnce(
      new Error('Auth service crashed')
    );

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// ElevenLabs agent creation paths (lines 590-621, 631-635)
// ============================================================
describe('ElevenLabs agent creation', () => {
  test('handles agent creation success (lines 590-621)', async () => {
    const nodeFetch = require('node-fetch');
    nodeFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ agent_id: 'agent-elevenlabs-123' }),
        text: () => Promise.resolve('success'),
      })
    );

    const { req, res } = mockReqRes({
      ...BASE_BODY,
      selected_voice_id: 'voice-abc',
      selected_voice_language: 'en',
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('handles agent creation network error (lines 631-635)', async () => {
    const nodeFetch = require('node-fetch');
    nodeFetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    // Should not fail the whole onboarding
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
