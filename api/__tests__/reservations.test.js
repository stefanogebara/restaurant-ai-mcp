/**
 * Reservations API Tests
 *
 * Tests the reservation CRUD endpoint (create, lookup, list, modify, cancel).
 * Follows multi-tenancy.test.js mock pattern.
 */

// ---------------------------------------------------------------------------
// Fake environment
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';

const RESTAURANT_ID = 'rest-test-001';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockCreateReservation = jest.fn(() =>
  Promise.resolve({
    success: true,
    data: { id: 'rec-001', fields: { 'Reservation ID': 'RES-TEST-001' } },
  })
);

const mockFindReservation = jest.fn(() =>
  Promise.resolve({
    success: true,
    reservation: {
      reservation_id: 'RES-TEST-001',
      customer_name: 'Test User',
      party_size: 4,
      reservation_time: '19:00',
      status: 'confirmed',
      special_requests: '',
    },
  })
);

const mockGetReservations = jest.fn(() =>
  Promise.resolve({
    success: true,
    data: {
      records: [
        {
          fields: {
            'Reservation ID': 'RES-001',
            'Customer Name': 'Alice',
            'Customer Phone': '+1111',
            'Party Size': 2,
            'Date': '2026-03-15',
            'Time': '18:00',
            'Status': 'confirmed',
            'Created At': '2026-03-10T10:00:00Z',
          },
          createdTime: '2026-03-10T10:00:00Z',
        },
      ],
    },
  })
);

const mockUpdateReservation = jest.fn(() =>
  Promise.resolve({ success: true })
);

const mockCancelReservation = jest.fn(() =>
  Promise.resolve({ success: true })
);

const mockGenerateReservationId = jest.fn(() => 'RES-GENERATED-001');

jest.mock('../_lib/supabase', () => ({
  createReservation: mockCreateReservation,
  generateReservationId: mockGenerateReservationId,
  findReservation: mockFindReservation,
  updateReservation: mockUpdateReservation,
  cancelReservation: mockCancelReservation,
  getReservations: mockGetReservations,
  supabaseAdmin: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: null, error: null })) })) })),
    })),
  },
}));

jest.mock('../_lib/customer-history', () => ({
  findOrCreateCustomer: jest.fn(() => Promise.resolve({ id: 'cust-001' })),
  updateCustomerHistory: jest.fn(() => Promise.resolve()),
  getCustomerStats: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(() =>
    Promise.resolve({
      user: { id: 'user-1', restaurant_id: RESTAURANT_ID, timezone: 'UTC' },
    })
  ),
}));

jest.mock('../services/mlRiskScoring', () => ({
  calculateRiskScore: jest.fn(() =>
    Promise.resolve({
      riskScore: 15,
      riskLevel: 'low',
      confidence: 70,
      factors: [],
      modelVersion: 'test-v1',
    })
  ),
  getRecommendedIntervention: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../ml/data-logger', () => ({
  logReservationCreated: jest.fn(() => Promise.resolve()),
  logCustomerCancelled: jest.fn(() => Promise.resolve()),
}));

jest.mock('twilio', () =>
  jest.fn(() => ({
    messages: { create: jest.fn(() => Promise.resolve({ sid: 'SM_TEST' })) },
  }))
);

jest.mock('../_lib/cors', () => ({
  setWebhookCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn((req, res, next) => next()),
  checkReservationLimits: jest.fn((req, res, next) => next()),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn(),
}));

jest.mock('../_lib/timezone', () => ({
  getLocalDate: jest.fn(() => '2026-03-15'),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../services/guestMemory', () => ({
  createMemory: jest.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Require handler
// ---------------------------------------------------------------------------
const handler = require('../reservations');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReqRes({ action, method = 'POST', body = {}, query = {} } = {}) {
  const req = {
    method,
    query: { action, ...query },
    body,
    headers: { authorization: 'Bearer test-token' },
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/reservations?action=create', () => {
  test('calls createReservation with valid data and correct restaurant_id', async () => {
    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 4,
        customer_name: 'João Silva',
        customer_phone: '+5511999999999',
        customer_email: 'joao@example.com',
      },
    });

    await handler(req, res);

    // Core assertion: createReservation was called with correct restaurant scope
    expect(mockCreateReservation).toHaveBeenCalledWith(
      RESTAURANT_ID,
      expect.objectContaining({
        'Customer Name': 'João Silva',
        'Party Size': 4,
        'Date': '2026-03-20',
        'Time': '19:00',
        'Status': 'confirmed',
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0]?.[0];
    expect(response.message).toContain('confirmed');
  });

  test('rejects missing required fields', async () => {
    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        // missing time, party_size, customer_name, customer_phone
      },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects missing customer_name', async () => {
    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 2,
        customer_phone: '+5511999999999',
      },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /api/reservations?action=lookup', () => {
  test('finds reservation by reservation_id', async () => {
    const { req, res } = mockReqRes({
      action: 'lookup',
      method: 'POST',
      body: { reservation_id: 'RES-TEST-001' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockFindReservation).toHaveBeenCalledWith(RESTAURANT_ID, {
      reservation_id: 'RES-TEST-001',
      customer_phone: undefined,
      customer_name: undefined,
    });
  });

  test('returns 400 with no search criteria', async () => {
    const { req, res } = mockReqRes({
      action: 'lookup',
      body: {},
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 when reservation not found', async () => {
    mockFindReservation.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'lookup',
      body: { reservation_id: 'RES-NONEXISTENT' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('GET /api/reservations?action=list', () => {
  test('returns list of reservations', async () => {
    const { req, res } = mockReqRes({
      action: 'list',
      method: 'GET',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        reservations: expect.any(Array),
        total: expect.any(Number),
      })
    );
  });
});

describe('POST /api/reservations?action=modify', () => {
  test('modifies reservation with new time', async () => {
    const { req, res } = mockReqRes({
      action: 'modify',
      body: {
        reservation_id: 'RES-TEST-001',
        time: '20:00',
      },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateReservation).toHaveBeenCalled();
  });

  test('rejects modify without reservation_id', async () => {
    const { req, res } = mockReqRes({
      action: 'modify',
      body: { time: '20:00' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/reservations?action=cancel', () => {
  test('cancels reservation', async () => {
    const { req, res } = mockReqRes({
      action: 'cancel',
      body: { reservation_id: 'RES-TEST-001' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCancelReservation).toHaveBeenCalledWith(RESTAURANT_ID, 'RES-TEST-001');
  });

  test('rejects cancel without reservation_id', async () => {
    const { req, res } = mockReqRes({
      action: 'cancel',
      body: {},
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Invalid action', () => {
  test('returns 400 for unknown action', async () => {
    const { req, res } = mockReqRes({
      action: 'invalid_action',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Authentication', () => {
  test('returns 401 without auth token', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({
      error: 'Invalid token',
      status: 401,
    });

    const { req, res } = mockReqRes({ action: 'list' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('Rate limiting', () => {
  test('returns 429 when rate limited', async () => {
    const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
    checkAndApplyRateLimit.mockResolvedValueOnce(true);

    const { req, res } = mockReqRes({ action: 'create' });

    await handler(req, res);

    // Rate limit handler sends response directly, handler returns early
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });
});
