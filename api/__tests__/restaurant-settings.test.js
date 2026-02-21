/**
 * Tests for api/restaurant-settings.js
 * Auth-gated settings CRUD with metric profile management
 */

// mockBuildChain must start with 'mock' so Jest hoisting allows it in factory
// mockSupabaseResult is mutable per test
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
let mockSupabaseResult = {};

function mockBuildChain(resolveWith) {
  const chain = new Proxy({}, {
    get(target, prop) {
      if (prop === 'single') return () => Promise.resolve(resolveWith);
      if (prop === 'select') return (...args) => { mockSelect(...args); return chain; };
      if (prop === 'eq') return (...args) => { mockEq(...args); return chain; };
      if (prop === 'update') return (...args) => { mockUpdate(...args); return chain; };
      if (prop === 'from') return () => chain;
      if (prop === 'schema') return () => chain;
      if (prop === 'then') return (resolve) => Promise.resolve(resolveWith).then(resolve);
      return () => chain;
    },
  });
  return chain;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    schema: () => ({
      from: () => mockBuildChain(mockSupabaseResult),
    }),
  })),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const handler = require('../restaurant-settings');
const { verifyAuth } = require('../_lib/auth');

function createMockReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
    url: overrides.url || '/api/restaurant-settings',
    query: overrides.query || {},
    body: overrides.body || {},
    headers: overrides.headers || { authorization: 'Bearer test-token' },
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
  mockSupabaseResult = { data: { language: 'en', restaurant_name: 'Test Restaurant', city: 'Madrid', country: 'ES', metric_profile: null }, error: null };
});

// ============================================================
// CORS & Method checks
// ============================================================
describe('RestaurantSettings: CORS and methods', () => {
  test('handles OPTIONS preflight request', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });
});

// ============================================================
// Authentication
// ============================================================
describe('RestaurantSettings: Authentication', () => {
  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });

  test('returns 400 when user has no restaurant_id', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { email: 'test@test.com' } }); // no restaurant_id

    const { req, res } = createMockReqRes({ url: '/api/restaurant-settings' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Restaurant ID is required',
    }));
  });
});

// ============================================================
// GET settings
// ============================================================
describe('RestaurantSettings: GET basic settings', () => {
  test('returns 200 with restaurant settings', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    mockSupabaseResult = {
      data: { language: 'es', restaurant_name: 'El Tapas', city: 'Barcelona', country: 'ES' },
      error: null,
    };

    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/restaurant-settings' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.data.language).toBe('es');
    expect(data.data.restaurant_name).toBe('El Tapas');
  });

  test('defaults language to en when null', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    mockSupabaseResult = {
      data: { language: null, restaurant_name: 'Test', city: 'London', country: 'GB' },
      error: null,
    };

    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/restaurant-settings' });
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.data.language).toBe('en');
  });

  test('returns 500 when DB fails', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    mockSupabaseResult = { data: null, error: { message: 'DB error' } };

    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/restaurant-settings' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================
// PUT settings
// ============================================================
describe('RestaurantSettings: PUT basic settings', () => {
  test('updates language successfully', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    mockSupabaseResult = { data: { language: 'pt', restaurant_name: 'Test' }, error: null };

    const { req, res } = createMockReqRes({
      method: 'PUT',
      url: '/api/restaurant-settings',
      body: { language: 'pt' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.message).toBe('Settings updated successfully');
  });

  test('rejects invalid language', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });

    const { req, res } = createMockReqRes({
      method: 'PUT',
      url: '/api/restaurant-settings',
      body: { language: 'xx' }, // invalid
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('Invalid language'),
    }));
  });

  test('returns 400 when no updates provided', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });

    const { req, res } = createMockReqRes({
      method: 'PUT',
      url: '/api/restaurant-settings',
      body: {}, // empty body
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'No updates provided',
    }));
  });
});

// ============================================================
// GET profile
// ============================================================
describe('RestaurantSettings: GET profile', () => {
  test('returns default profile when metric_profile is null', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    mockSupabaseResult = { data: { metric_profile: null, language: 'en' }, error: null };

    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/restaurant-settings/profile' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.data.template).toBe('simple');
    expect(data.data.restaurant_type).toBe('traditional');
  });

  test('returns stored profile when metric_profile exists', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });
    const storedProfile = {
      template: 'advanced',
      restaurant_type: 'modern',
      size: 'large',
      location_type: 'business',
      primary_concerns: ['revenue'],
      visible_metrics: ['tables_available'],
      hidden_metrics: [],
      customizations: {},
    };
    mockSupabaseResult = { data: { metric_profile: storedProfile, language: 'en' }, error: null };

    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/restaurant-settings/profile' });
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.data.template).toBe('advanced');
  });
});

// ============================================================
// POST profile/recommend
// ============================================================
describe('RestaurantSettings: POST profile/recommend', () => {
  test('returns recommended profile based on characteristics', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/restaurant-settings/profile/recommend',
      body: {
        restaurant_type: 'traditional',
        size: 'medium',
        location_type: 'residential',
        primary_concerns: ['no_shows'],
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.data.recommended_profile.template).toBe('simple'); // traditional → simple
    expect(data.data.reasoning).toContain('traditional');
  });

  test('recommends advanced template for modern restaurant', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/restaurant-settings/profile/recommend',
      body: {
        restaurant_type: 'modern',
        size: 'large',
        location_type: 'tourist',
        primary_concerns: ['revenue', 'table_turnover'],
      },
    });
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.data.recommended_profile.template).toBe('advanced');
  });

  test('returns 400 when required fields missing', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'admin@test.com' },
    });

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/restaurant-settings/profile/recommend',
      body: { restaurant_type: 'traditional' }, // missing size, location_type, primary_concerns
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Missing required fields',
    }));
  });
});
