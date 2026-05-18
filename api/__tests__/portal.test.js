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

// Failure counter is mockable per-test: tests that want to assert the
// 429 budget kicks in override peekFailureCount.mockResolvedValueOnce(50).
const mockPeekFailureCount = jest.fn().mockResolvedValue(0);
const mockBumpFailureCount = jest.fn().mockResolvedValue(0);

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
  peekFailureCount: (...args) => mockPeekFailureCount(...args),
  bumpFailureCount: (...args) => mockBumpFailureCount(...args),
}));

jest.mock('../_lib/secure-id', () => ({
  generateSecureReservationId: jest.fn().mockReturnValue('RES-TEST-123'),
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn(),
}));

// portal.js now delegates email to _lib/email.js
const mockSendReservationConfirmationEmail = jest.fn().mockResolvedValue(undefined);
const mockSendNewBookingAlertEmail = jest.fn().mockResolvedValue(undefined);

jest.mock('../_lib/email', () => ({
  sendReservationConfirmationEmail: (...args) => mockSendReservationConfirmationEmail(...args),
  sendNewBookingAlertEmail: (...args) => mockSendNewBookingAlertEmail(...args),
  wrapEmailHtml: jest.fn(html => html),
}));

// portal.js uses whatsapp-sender for restaurant owner WhatsApp alerts + customer confirmation
const mockSendNewBookingAlertWhatsApp = jest.fn().mockResolvedValue({ success: true });
const mockSendReservationConfirmation = jest.fn().mockResolvedValue({ success: true });
let mockIsWhatsAppConfigured = true;

jest.mock('../_lib/whatsapp-sender', () => ({
  sendNewBookingAlertWhatsApp: (...args) => mockSendNewBookingAlertWhatsApp(...args),
  sendReservationConfirmation: (...args) => mockSendReservationConfirmation(...args),
  isWhatsAppConfigured: () => mockIsWhatsAppConfigured,
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../_lib/reservation-validator', () => ({
  validateReservation: jest.fn(() => ({ valid: true, message: null })),
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
  mockSendReservationConfirmationEmail.mockResolvedValue(undefined);
  mockSendNewBookingAlertEmail.mockResolvedValue(undefined);
  mockSendNewBookingAlertWhatsApp.mockResolvedValue({ success: true });
  mockIsWhatsAppConfigured = true;
});

// ============================================================
// CORS & OPTIONS
// ============================================================
describe('Portal: CORS and OPTIONS', () => {
  test('sets CORS headers', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.any(String));
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

  // Slug validation — locks the regex guard added during the security
  // audit. Without it, junk slugs (path traversal, SQL fragments, quotes)
  // reached Supabase's query logs even though RLS rejected them. Now
  // they 400 cheaply at the edge.
  test('returns 400 for slug with uppercase characters', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'My-Restaurant' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid slug format' }));
  });

  test('returns 400 for slug with spaces', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'my restaurant' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for slug with SQL-injection-flavoured payload', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: "x'; DROP TABLE--" } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for slug with path traversal', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: '../etc/passwd' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for slug longer than 100 chars', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'a'.repeat(101) } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // Per-IP failure budget — the actual defense against slug enumeration.
  // attackers vary the slug every request, so a per-slug counter is
  // useless. Per-IP-per-failure counter, scoped to the slug-lookup
  // namespace, is what catches the scan.
  test('returns 429 when IP has burned through slug-lookup failure budget', async () => {
    mockPeekFailureCount.mockResolvedValueOnce(50); // == SLUG_LOOKUP_FAIL_LIMIT
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'valid-slug' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringMatching(/too many/i),
    }));
  });

  test('bumps the slug-lookup failure counter on 404', async () => {
    mockBumpFailureCount.mockClear();
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'no-such-place' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockBumpFailureCount).toHaveBeenCalledTimes(1);
    expect(mockBumpFailureCount).toHaveBeenCalledWith(expect.anything(), 'slug-lookup-fail', 3600);
  });

  test('does NOT bump the failure counter on successful lookup', async () => {
    mockBumpFailureCount.mockClear();
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'rest-1', restaurant_name: 'Test', restaurant_type: 'Italian',
        city: 'X', country: 'BR', phone: '+55', email: 't@t.com', website: '',
        slug: 'test-restaurant', business_hours: {}, reservation_settings: {},
        average_dining_duration_minutes: 90,
      },
      error: null,
    });
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'test-restaurant' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBumpFailureCount).not.toHaveBeenCalled();
  });

  test('accepts valid lowercase + digits + hyphens slug', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
    const { req, res } = createMockReqRes({ query: { action: 'restaurant', slug: 'pizzeria-da-romano-42' } });
    await handler(req, res);
    // Must NOT 400 — slug pattern OK, downstream 404 is allowed here.
    expect(res.status).not.toHaveBeenCalledWith(400);
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
        date: '2027-04-01',
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
        date: '2027-04-01',
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
        date: '2027-04-01',
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
        date: '2027-04-01',
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
  // 2027-04-05 is a Monday
  const MONDAY = '2027-04-05';

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

// ============================================================
// Top-level catch block (lines 55-57)
// ============================================================
describe('Portal: top-level catch block', () => {
  test('returns 500 on unhandled exception in sub-handler (lines 55-57)', async () => {
    // Throw synchronously from single() so the async handleGetRestaurant rejects,
    // propagating to the top-level try-catch in the main handler.
    mockSingle.mockImplementationOnce(() => { throw new Error('Unexpected DB crash'); });

    const { req, res } = createMockReqRes({
      query: { action: 'restaurant', slug: 'test-slug' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Something went wrong. Please try again.',
    }));
  });
});

// ============================================================
// Party size limit (line 352)
// ============================================================
describe('Portal: reserve - party size limit', () => {
  test('returns 400 when party size exceeds max_party_size (line 352)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'r1',
        restaurant_name: 'Test Restaurant',
        reservation_settings: { max_party_size: 5 },
        business_hours: {},
        average_dining_duration_minutes: 90,
      },
      error: null,
    });

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Big Group',
        customer_phone: '+5511999999999',
        party_size: 10,
        date: '2027-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Maximum party size'),
    }));
  });
});

// ============================================================
// DB insert error (lines 411-412)
// ============================================================
describe('Portal: reserve - DB insert error', () => {
  test('returns 500 when reservation insert fails (lines 411-412)', async () => {
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
    mockChainResolve.mockReturnValueOnce({ data: [], error: null });
    mockChainResolve.mockReturnValueOnce({ data: [{ capacity: 40 }], error: null });
    mockCheckTimeSlotAvailability.mockReturnValueOnce({ available: true, availableSeats: 38 });
    // Insert .single() returns an error
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'insert constraint violation' } });

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
        party_size: 2,
        date: '2027-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Could not create reservation. Please try again.',
    }));
  });
});

// ============================================================
// Email confirmation (portal uses _lib/email.js)
// ============================================================
describe('Portal: reserve - email confirmation', () => {
  function setupSuccessfulReserve(restaurantData = {}) {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'r1',
        restaurant_name: 'Test Restaurant',
        email: 'owner@restaurant.com',
        reservation_settings: { max_party_size: 10, cancellation_policy: 'Free cancellation 2h before' },
        business_hours: {},
        average_dining_duration_minutes: 90,
        ...restaurantData,
      },
      error: null,
    });
    mockChainResolve.mockReturnValueOnce({ data: [], error: null });
    mockChainResolve.mockReturnValueOnce({ data: [{ capacity: 40 }], error: null });
    mockCheckTimeSlotAvailability.mockReturnValueOnce({ available: true, availableSeats: 38 });
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'db-uuid-1',
        reservation_id: 'RES-TEST-123',
        customer_name: 'Email User',
        party_size: 2,
        date: '2027-04-01',
        time: '19:00',
        status: 'confirmed',
      },
      error: null,
    });
  }

  test('calls sendReservationConfirmationEmail when customer_email is provided', async () => {
    setupSuccessfulReserve();

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Email User',
        customer_phone: '+5511999999999',
        customer_email: 'user@example.com',
        party_size: 2,
        date: '2027-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockSendReservationConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({
      customerEmail: 'user@example.com',
      customerName: 'Email User',
      restaurantName: 'Test Restaurant',
      reservationId: 'RES-TEST-123',
      partySize: 2,
    }));
  });

  test('calls sendNewBookingAlertEmail to notify restaurant owner', async () => {
    setupSuccessfulReserve();

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Email User',
        customer_phone: '+5511999999999',
        customer_email: 'user@example.com',
        party_size: 2,
        date: '2027-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockSendNewBookingAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      ownerEmail: 'owner@restaurant.com',
      customerName: 'Email User',
      reservationId: 'RES-TEST-123',
    }));
  });

  test('does not call confirmation email when customer_email is absent', async () => {
    setupSuccessfulReserve();

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'No Email User',
        customer_phone: '+5511999999999',
        party_size: 2,
        date: '2027-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockSendReservationConfirmationEmail).not.toHaveBeenCalled();
  });

  test('does not call owner alert when restaurant has no email', async () => {
    setupSuccessfulReserve({ email: null });

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
        customer_email: 'user@example.com',
        party_size: 2,
        date: '2027-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockSendNewBookingAlertEmail).not.toHaveBeenCalled();
  });

  test('response is 201 even when confirmation email rejects (fire-and-forget)', async () => {
    setupSuccessfulReserve();
    mockSendReservationConfirmationEmail.mockRejectedValueOnce(new Error('Email service down'));

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'reserve',
        restaurant_id: 'r1',
        customer_name: 'Email User',
        customer_phone: '+5511999999999',
        customer_email: 'user@example.com',
        party_size: 2,
        date: '2027-04-01',
        time: '19:00',
      },
    });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ============================================================
// action=reservation (lookup by confirmation ID)
// ============================================================
describe('Portal: reservation action (lookup by ID)', () => {
  test('returns 400 without id param', async () => {
    const { req, res } = createMockReqRes({ query: { action: 'reservation' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('returns 400 for oversized id', async () => {
    const { req, res } = createMockReqRes({
      query: { action: 'reservation', id: 'A'.repeat(61) },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 when reservation not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = createMockReqRes({
      query: { action: 'reservation', id: 'RES-NONEXISTENT-123' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns reservation data when found', async () => {
    // First single(): reservation lookup
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'db-uuid-1',
        reservation_id: 'RES-TEST-123',
        restaurant_id: 'r1',
        customer_name: 'John Doe',
        party_size: 4,
        date: '2027-04-01',
        time: '19:00',
        status: 'confirmed',
      },
      error: null,
    });
    // Second single(): restaurant name lookup
    mockSingle.mockResolvedValueOnce({
      data: { restaurant_name: 'Test Restaurant' },
      error: null,
    });

    const { req, res } = createMockReqRes({
      query: { action: 'reservation', id: 'RES-TEST-123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      reservation: expect.objectContaining({
        id: 'RES-TEST-123',
        name: 'John Doe',
        party_size: 4,
        date: '2027-04-01',
        time: '19:00',
        status: 'confirmed',
        restaurant_name: 'Test Restaurant',
      }),
    }));
  });

  test('falls back to "Restaurant" when restaurant_config lookup fails', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'db-uuid-1',
        reservation_id: 'RES-TEST-123',
        restaurant_id: 'r1',
        customer_name: 'Jane Doe',
        party_size: 2,
        date: '2027-04-01',
        time: '20:00',
        status: 'confirmed',
      },
      error: null,
    });
    // Restaurant name lookup fails
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = createMockReqRes({
      query: { action: 'reservation', id: 'RES-TEST-123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      reservation: expect.objectContaining({
        restaurant_name: 'Restaurant',
      }),
    }));
  });
});

// ============================================================
// WhatsApp alert on new booking
// ============================================================
describe('Portal: reserve - WhatsApp owner alert', () => {
  function setupSuccessfulReserveWhatsApp(restaurantData = {}) {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'r1',
        restaurant_name: 'Test Restaurant',
        email: 'owner@restaurant.com',
        whatsapp_enabled: true,
        whatsapp_phone_number: '+5511999999999',
        reservation_settings: { max_party_size: 10 },
        business_hours: {},
        average_dining_duration_minutes: 90,
        ...restaurantData,
      },
      error: null,
    });
    mockChainResolve.mockReturnValueOnce({ data: [], error: null });
    mockChainResolve.mockReturnValueOnce({ data: [{ capacity: 40 }], error: null });
    mockCheckTimeSlotAvailability.mockReturnValueOnce({ available: true, availableSeats: 38 });
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'db-uuid-1',
        reservation_id: 'RES-TEST-123',
        customer_name: 'WA User',
        party_size: 3,
        date: '2027-04-01',
        time: '20:00',
        status: 'confirmed',
      },
      error: null,
    });
  }

  const BASE_BODY = {
    action: 'reserve',
    restaurant_id: 'r1',
    customer_name: 'WA User',
    customer_phone: '+5511888888888',
    party_size: 3,
    date: '2027-04-01',
    time: '20:00',
  };

  test('sends WhatsApp alert when whatsapp_enabled=true and configured', async () => {
    setupSuccessfulReserveWhatsApp();
    mockIsWhatsAppConfigured = true;

    const { req, res } = createMockReqRes({ method: 'POST', body: BASE_BODY });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockSendNewBookingAlertWhatsApp).toHaveBeenCalledWith(
      '+5511999999999',
      expect.objectContaining({
        reservationId: 'RES-TEST-123',
        customerName: 'WA User',
        customerPhone: '+5511888888888',
        partySize: 3,
        date: '2027-04-01',
        time: '20:00',
      })
    );
  });

  test('does not send WhatsApp alert when whatsapp_enabled=false', async () => {
    setupSuccessfulReserveWhatsApp({ whatsapp_enabled: false });
    mockIsWhatsAppConfigured = true;

    const { req, res } = createMockReqRes({ method: 'POST', body: BASE_BODY });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockSendNewBookingAlertWhatsApp).not.toHaveBeenCalled();
  });

  test('does not send WhatsApp alert when whatsapp_phone_number is null', async () => {
    setupSuccessfulReserveWhatsApp({ whatsapp_enabled: true, whatsapp_phone_number: null });
    mockIsWhatsAppConfigured = true;

    const { req, res } = createMockReqRes({ method: 'POST', body: BASE_BODY });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockSendNewBookingAlertWhatsApp).not.toHaveBeenCalled();
  });

  test('does not send WhatsApp alert when WhatsApp is not configured (no env vars)', async () => {
    setupSuccessfulReserveWhatsApp();
    mockIsWhatsAppConfigured = false;

    const { req, res } = createMockReqRes({ method: 'POST', body: BASE_BODY });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockSendNewBookingAlertWhatsApp).not.toHaveBeenCalled();
  });

  test('response is 201 even when WhatsApp alert fails (fire-and-forget)', async () => {
    setupSuccessfulReserveWhatsApp();
    mockIsWhatsAppConfigured = true;
    mockSendNewBookingAlertWhatsApp.mockRejectedValueOnce(new Error('WhatsApp API down'));

    const { req, res } = createMockReqRes({ method: 'POST', body: BASE_BODY });
    await handler(req, res);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(res.status).toHaveBeenCalledWith(201);
  });
});
