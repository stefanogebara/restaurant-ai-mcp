/**
 * Tests for api/portal.js
 * Public booking portal API (no auth required)
 */

// --- Mock dependencies ---
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockSingle = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn();
const mockSchema = jest.fn();

function mockCreateChainableMock() {
  const chain = new Proxy({}, {
    get(target, prop) {
      if (prop === 'select') return (...args) => { mockSelect(...args); return chain; };
      if (prop === 'eq') return (...args) => { mockEq(...args); return chain; };
      if (prop === 'in') return (...args) => { mockIn(...args); return chain; };
      if (prop === 'single') return () => mockSingle();
      if (prop === 'insert') return (...args) => { mockInsert(...args); return chain; };
      return () => chain;
    },
  });
  return chain;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args) => { mockFrom(...args); return mockCreateChainableMock(); },
    schema: (...args) => {
      mockSchema(...args);
      return {
        from: (...fromArgs) => { mockFrom(...fromArgs); return mockCreateChainableMock(); },
      };
    },
  },
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/secure-id', () => ({
  generateSecureReservationId: jest.fn().mockReturnValue('RES-TEST-123'),
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn(),
}));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({}) },
  })),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const handler = require('../portal');

// Helper
function createMockReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
    query: overrides.query || {},
    body: overrides.body || {},
    headers: overrides.headers || {},
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn(),
    setHeader: jest.fn(),
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// CORS & OPTIONS
// ============================================================
describe('Portal: CORS and OPTIONS', () => {
  test('sets CORS headers', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// Invalid action
// ============================================================
describe('Portal: Invalid action', () => {
  test('returns 400 for unknown action', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'invalid' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
    }));
  });
});

// ============================================================
// action=restaurant
// ============================================================
describe('Portal: restaurant action', () => {
  test('returns 400 without slug', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'restaurant' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 when restaurant not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'nonexistent' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns restaurant data for valid slug', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'rest-1',
        restaurant_name: 'Test Restaurant',
        restaurant_type: 'Italian',
        city: 'São Paulo',
        country: 'Brazil',
        phone: '+5511999999999',
        email: 'test@rest.com',
        website: 'https://test.com',
        slug: 'test-restaurant',
        business_hours: { monday: { is_open: true, open_time: '12:00', close_time: '22:00' } },
        reservation_settings: { max_party_size: 10 },
        average_dining_duration_minutes: 90,
      },
      error: null,
    });

    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'test-restaurant' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        name: 'Test Restaurant',
        slug: 'test-restaurant',
        max_party_size: 10,
      }),
    }));
  });
});

// ============================================================
// action=availability
// ============================================================
describe('Portal: availability action', () => {
  test('returns 400 without required params', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'availability' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid party_size', async () => {
    const { req, res } = createMockReqRes({
      query: { action: 'availability', restaurant_id: 'r1', date: '2026-03-01', party_size: '0' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid date format', async () => {
    const { req, res } = createMockReqRes({
      query: { action: 'availability', restaurant_id: 'r1', date: '01-03-2026', party_size: '4' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 when restaurant not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
    const { req, res } = createMockReqRes({
      query: { action: 'availability', restaurant_id: 'r1', date: '2026-03-01', party_size: '4' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ============================================================
// action=reserve
// ============================================================
describe('Portal: reserve action', () => {
  test('returns 405 for GET method', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { action: 'reserve' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 400 for missing required fields', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      query: {},
      body: { action: 'reserve', restaurant_id: 'r1' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid party_size', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test',
        customer_phone: '+5511999999999',
        party_size: 25,
        date: '2026-03-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('party_size'),
    }));
  });

  test('returns 400 for invalid date format', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test',
        customer_phone: '+5511999999999',
        party_size: 4,
        date: '01-03-2026',
        time: '19:00',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid time format', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test',
        customer_phone: '+5511999999999',
        party_size: 4,
        date: '2026-03-01',
        time: '7pm',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for past date', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test',
        customer_phone: '+5511999999999',
        party_size: 4,
        date: '2020-01-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('past'),
    }));
  });
});
