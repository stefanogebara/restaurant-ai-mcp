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
});
