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

// Controls the resolved value when a chain is awaited directly (e.g. .in().then)
const mockChainResolve = jest.fn();

// Availability calculator mocks
const mockCheckTimeSlotAvailability = jest.fn(() => ({ available: true, availableSeats: 40, reason: '' }));
const mockGetDiningDuration = jest.fn(() => 90);

function mockCreateChainableMock() {
  const chain = new Proxy({}, {
    get(target, prop) {
      if (prop === 'select') return (...args) => { mockSelect(...args); return chain; };
      if (prop === 'eq') return (...args) => { mockEq(...args); return chain; };
      if (prop === 'in') return (...args) => { mockIn(...args); return chain; };
      if (prop === 'single') return () => mockSingle();
      if (prop === 'insert') return (...args) => { mockInsert(...args); return chain; };
      // Allow `await chain` to resolve (used after .in(), .eq() chains without .single())
      if (prop === 'then') return (resolve, reject) => { Promise.resolve(mockChainResolve()).then(resolve, reject); };
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

jest.mock('../_lib/availability-calculator', () => ({
  checkTimeSlotAvailability: (...args) => mockCheckTimeSlotAvailability(...args),
  getSuggestedTimes: jest.fn(() => []),
  getDiningDuration: (...args) => mockGetDiningDuration(...args),
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
  // Default: awaiting a chain resolves with empty data
  mockChainResolve.mockReturnValue({ data: [], error: null });
  mockCheckTimeSlotAvailability.mockReturnValue({ available: true, availableSeats: 40, reason: '' });
  mockGetDiningDuration.mockReturnValue(90);
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

  test('returns 404 when restaurant not found during reserve', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'nonexistent',
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
        party_size: 2,
        date: '2026-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 409 when slot is unavailable', async () => {
    // Restaurant found
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'r1',
        restaurant_name: 'Test Restaurant',
        reservation_settings: { max_party_size: 10 },
        business_hours: {},
        average_dining_duration_minutes: 90,
      },
      error: null,
    });
    // Existing reservations (full)
    mockChainResolve.mockReturnValueOnce({ data: [{ time: '19:00', party_size: 40, status: 'confirmed' }], error: null });
    // Tables
    mockChainResolve.mockReturnValueOnce({ data: [{ capacity: 40 }], error: null });
    // checkTimeSlotAvailability returns unavailable
    mockCheckTimeSlotAvailability.mockReturnValueOnce({ available: false, availableSeats: 0, reason: 'Restaurant is fully booked at this time.' });

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
        party_size: 4,
        date: '2026-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('creates reservation and returns 201', async () => {
    // Restaurant found
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'r1',
        restaurant_name: 'Test Restaurant',
        reservation_settings: { max_party_size: 10 },
        business_hours: {},
        average_dining_duration_minutes: 90,
      },
      error: null,
    });
    // Existing reservations (empty)
    mockChainResolve.mockReturnValueOnce({ data: [], error: null });
    // Tables
    mockChainResolve.mockReturnValueOnce({ data: [{ capacity: 40 }], error: null });
    // Slot available
    mockCheckTimeSlotAvailability.mockReturnValueOnce({ available: true, availableSeats: 38 });
    // Created reservation
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'db-uuid-1',
        reservation_id: 'RES-TEST-123',
        customer_name: 'Test User',
        party_size: 2,
        date: '2026-04-01',
        time: '19:00',
        status: 'confirmed',
      },
      error: null,
    });

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
        party_size: 2,
        date: '2026-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      reservation: expect.objectContaining({
        id: 'RES-TEST-123',
        name: 'Test User',
      }),
    }));
  });
});

// ============================================================
// action=availability (slot generation)
// ============================================================
describe('Portal: availability slot generation', () => {
  // 2026-03-02 is a Monday
  const MONDAY = '2026-03-02';

  function restaurantConfig(overrides = {}) {
    return {
      id: 'r1',
      restaurant_name: 'Test Restaurant',
      business_hours: {
        monday: { is_open: true, open_time: '12:00', close_time: '14:00' },
      },
      reservation_settings: { max_party_size: 10 },
      average_dining_duration_minutes: 90,
      ...overrides,
    };
  }

  test('returns slots for open restaurant', async () => {
    mockSingle.mockResolvedValueOnce({ data: restaurantConfig(), error: null });
    mockChainResolve.mockReturnValueOnce({ data: [], error: null });    // reservations
    mockChainResolve.mockReturnValueOnce({ data: [{ capacity: 40 }], error: null }); // tables

    const { req, res } = createMockReqRes({
      query: { action: 'availability', restaurant_id: 'r1', date: MONDAY, party_size: '2' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      slots: expect.any(Array),
      operating_hours: { open: '12:00', close: '14:00' },
    }));
  });

  test('returns empty slots for closed day', async () => {
    // Monday marked as closed
    mockSingle.mockResolvedValueOnce({
      data: restaurantConfig({
        business_hours: {
          monday: { is_open: false, open_time: '12:00', close_time: '22:00' },
        },
      }),
      error: null,
    });

    const { req, res } = createMockReqRes({
      query: { action: 'availability', restaurant_id: 'r1', date: MONDAY, party_size: '2' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      available: false,
      slots: [],
    }));
  });

  test('returns 500 when reservations fetch fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: restaurantConfig(), error: null });
    mockChainResolve.mockReturnValueOnce({ data: null, error: { message: 'DB error' } });

    const { req, res } = createMockReqRes({
      query: { action: 'availability', restaurant_id: 'r1', date: MONDAY, party_size: '2' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
