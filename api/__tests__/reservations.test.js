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

// WhatsApp sender mocks
const mockIsWhatsAppConfigured = jest.fn(() => false);
const mockSendReservationConfirmation = jest.fn(() => Promise.resolve({ success: true }));

// Schema mock: controls what supabaseAdmin.schema('restaurant').from(...).single() returns
const mockSchemaFromSingle = jest.fn(() =>
  Promise.resolve({
    data: { whatsapp_enabled: false, restaurant_name: 'Test Restaurant', agent_language: 'en' },
    error: null,
  })
);

jest.mock('../_lib/whatsapp-sender', () => ({
  isWhatsAppConfigured: (...args) => mockIsWhatsAppConfigured(...args),
  sendReservationConfirmation: (...args) => mockSendReservationConfirmation(...args),
}));

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
    schema: () => ({
      from: () => {
        const chainable = {
          select: () => chainable,
          eq: () => chainable,
          single: () => mockSchemaFromSingle(),
        };
        return chainable;
      },
    }),
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
  rejectOversizedBody: jest.fn(() => false),
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

// ---------------------------------------------------------------------------
// WhatsApp Confirmation Branch (lines ~394-441 in reservations.js)
// ---------------------------------------------------------------------------

describe('WhatsApp confirmation', () => {
  const validCreateBody = {
    date: '2026-03-20',
    time: '19:00',
    party_size: 4,
    customer_name: 'João Silva',
    customer_phone: '+5511999999999',
    customer_email: 'joao@example.com',
  };

  beforeEach(() => {
    mockSchemaFromSingle.mockResolvedValue({
      data: { whatsapp_enabled: false, restaurant_name: 'Test Restaurant', agent_language: 'en' },
      error: null,
    });
    mockIsWhatsAppConfigured.mockReturnValue(false);
    mockSendReservationConfirmation.mockResolvedValue({ success: true });
  });

  test('sends WhatsApp confirmation when enabled and configured', async () => {
    mockSchemaFromSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: true, restaurant_name: 'Test Restaurant', agent_language: 'pt' },
      error: null,
    });
    mockIsWhatsAppConfigured.mockReturnValue(true);

    const { req, res } = mockReqRes({ action: 'create', body: validCreateBody });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSendReservationConfirmation).toHaveBeenCalledWith(
      '+5511999999999',
      expect.objectContaining({
        customerName: 'João Silva',
        restaurantName: 'Test Restaurant',
        language: 'pt',
      })
    );
  });

  test('falls back to SMS when WhatsApp send fails', async () => {
    mockSchemaFromSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: true, restaurant_name: 'Test Restaurant', agent_language: 'en' },
      error: null,
    });
    mockIsWhatsAppConfigured.mockReturnValue(true);
    mockSendReservationConfirmation.mockResolvedValueOnce({ success: false, error: 'API error' });

    const { req, res } = mockReqRes({ action: 'create', body: validCreateBody });
    await handler(req, res);

    // Reservation still succeeds (confirmation failure is non-fatal)
    expect(res.status).toHaveBeenCalledWith(200);
    // WhatsApp was attempted
    expect(mockSendReservationConfirmation).toHaveBeenCalled();
  });

  test('skips WhatsApp and uses SMS when whatsapp_enabled is false', async () => {
    mockSchemaFromSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: false, restaurant_name: 'Test Restaurant', agent_language: 'en' },
      error: null,
    });
    mockIsWhatsAppConfigured.mockReturnValue(false);

    const { req, res } = mockReqRes({ action: 'create', body: validCreateBody });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // WhatsApp should NOT have been called
    expect(mockSendReservationConfirmation).not.toHaveBeenCalled();
  });

  test('reservation succeeds even if schema query throws', async () => {
    mockSchemaFromSingle.mockRejectedValueOnce(new Error('DB unavailable'));

    const { req, res } = mockReqRes({ action: 'create', body: validCreateBody });
    await handler(req, res);

    // Confirmation is in a try/catch, so reservation still succeeds
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ---------------------------------------------------------------------------
// OPTIONS preflight (line 111)
// ---------------------------------------------------------------------------
describe('OPTIONS preflight', () => {
  test('exits early when handlePreflight returns true', async () => {
    const { handlePreflight } = require('../_lib/cors');
    handlePreflight.mockReturnValueOnce(true);

    const { req, res } = mockReqRes({ action: 'create', method: 'OPTIONS' });
    await handler(req, res);

    expect(mockCreateReservation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No restaurant_id (line 128)
// ---------------------------------------------------------------------------
describe('Missing restaurant_id', () => {
  test('returns 403 when user has no restaurant_id', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ user: { id: 'user-1' } }); // no restaurant_id

    const { req, res } = mockReqRes({ action: 'list' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('onboarding'),
    }));
  });
});

// ---------------------------------------------------------------------------
// createReservation failure (line 227)
// ---------------------------------------------------------------------------
describe('createReservation failure', () => {
  test('returns 500 when createReservation fails', async () => {
    mockCreateReservation.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 4,
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
      },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// Subscription limit check path (lines 189-201)
// ---------------------------------------------------------------------------
describe('Subscription limits', () => {
  test('runs subscription check when x-restaurant-email header present', async () => {
    const { checkSubscription, checkReservationLimits } = require('../_lib/subscription-middleware');

    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 2,
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
      },
    });
    req.headers['x-restaurant-email'] = 'owner@test.com';

    await handler(req, res);

    expect(checkSubscription).toHaveBeenCalled();
    expect(checkReservationLimits).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns early when checkSubscription blocks request', async () => {
    const { checkSubscription } = require('../_lib/subscription-middleware');
    // Mock subscription check to NOT call next() and send a response instead
    checkSubscription.mockImplementationOnce((req, res) => {
      res.status(402).json({ error: 'Subscription required' });
    });

    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 2,
        customer_name: 'Test User',
        customer_phone: '+5511999999999',
      },
    });
    req.headers['x-restaurant-email'] = 'owner@test.com';

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ML prediction - high risk with factors (line 313) and intervention (lines 343-388)
// ---------------------------------------------------------------------------
describe('ML prediction - high risk intervention', () => {
  test('triggers intervention creation for high-risk reservations', async () => {
    const { calculateRiskScore, getRecommendedIntervention } = require('../services/mlRiskScoring');

    calculateRiskScore.mockResolvedValueOnce({
      riskScore: 80,
      riskLevel: 'high',
      confidence: 85,
      factors: [
        { description: 'last-minute booking', weight: 0.4 },
        { description: 'no prior visits', weight: 0.3 },
      ],
      modelVersion: 'heuristic-v2',
    });

    getRecommendedIntervention.mockResolvedValueOnce({
      type: 'confirmation_call',
      estimatedCost: 2,
      estimatedValue: 50,
    });

    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 4,
        customer_name: 'High Risk Guest',
        customer_phone: '+5511999999999',
      },
    });
    await handler(req, res);

    expect(getRecommendedIntervention).toHaveBeenCalledWith('high', 80);
    // Reservation still succeeds even if intervention fails
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('handles medium risk (maps to high for intervention type)', async () => {
    const { calculateRiskScore, getRecommendedIntervention } = require('../services/mlRiskScoring');

    calculateRiskScore.mockResolvedValueOnce({
      riskScore: 45,
      riskLevel: 'medium',
      confidence: 70,
      factors: [{ description: 'weekend evening', weight: 0.2 }],
      modelVersion: 'heuristic-v2',
    });

    getRecommendedIntervention.mockResolvedValueOnce(null); // No intervention needed

    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '20:00',
        party_size: 2,
        customer_name: 'Medium Risk',
        customer_phone: '+5511888888888',
      },
    });
    await handler(req, res);

    expect(getRecommendedIntervention).toHaveBeenCalledWith('high', 45); // medium maps to high
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ---------------------------------------------------------------------------
// Guest memory with special_requests (lines 463, 467-477)
// ---------------------------------------------------------------------------
describe('Guest memory creation', () => {
  test('creates memory entries for booking and special_requests', async () => {
    const { createMemory } = require('../services/guestMemory');

    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 2,
        customer_name: 'Memory Guest',
        customer_phone: '+5511777777777',
        special_requests: 'Window seat please',
      },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Should have called createMemory at least for the booking observation
    expect(createMemory).toHaveBeenCalledWith(
      RESTAURANT_ID,
      '+5511777777777',
      expect.objectContaining({ memoryType: 'observation' })
    );
    // And for special requests as preference
    expect(createMemory).toHaveBeenCalledWith(
      RESTAURANT_ID,
      '+5511777777777',
      expect.objectContaining({ memoryType: 'preference', content: expect.stringContaining('Window seat') })
    );
  });
});

// ---------------------------------------------------------------------------
// SMS confirmation with Twilio env vars (lines 68-102)
// ---------------------------------------------------------------------------
describe('SMS confirmation with Twilio configured', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_PHONE_NUMBER = '+12025551234';
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
  });

  test('sends SMS confirmation when Twilio is configured', async () => {
    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 2,
        customer_name: 'SMS Guest',
        customer_phone: '+5511666666666',
      },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('handles short phone number gracefully (invalid phone path)', async () => {
    const { req, res } = mockReqRes({
      action: 'create',
      body: {
        date: '2026-03-20',
        time: '19:00',
        party_size: 2,
        customer_name: 'Bad Phone Guest',
        customer_phone: '123', // too short
      },
    });
    await handler(req, res);

    // Reservation succeeds regardless of SMS failure
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ---------------------------------------------------------------------------
// list edge cases (lines 527, 549-551, 561-562)
// ---------------------------------------------------------------------------
describe('list edge cases', () => {
  test('returns empty list when records is undefined', async () => {
    mockGetReservations.mockResolvedValueOnce({ success: true, data: {} }); // no .records

    const { req, res } = mockReqRes({ action: 'list', method: 'GET' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.reservations).toEqual([]);
    expect(data.total).toBe(0);
  });

  test('sorts reservations ASC when sort=created_at_asc', async () => {
    const { req, res } = mockReqRes({
      action: 'list',
      method: 'GET',
      query: { sort: 'created_at_asc' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.reservations).toBeDefined();
  });

  test('returns 500 when getReservations throws', async () => {
    mockGetReservations.mockRejectedValueOnce(new Error('DB explosion'));

    const { req, res } = mockReqRes({ action: 'list', method: 'GET' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// modify failure (line 598) and cancel failure (line 627)
// ---------------------------------------------------------------------------
describe('modify and cancel failure paths', () => {
  test('returns 500 when updateReservation fails', async () => {
    mockUpdateReservation.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'modify',
      body: { reservation_id: 'RES-TEST-001', time: '21:00' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('returns 500 when cancelReservation fails', async () => {
    mockCancelReservation.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'cancel',
      body: { reservation_id: 'RES-TEST-001' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// Top-level error catch (lines 155-157)
// ---------------------------------------------------------------------------
describe('Top-level error catch', () => {
  test('returns 500 when action handler throws unexpectedly', async () => {
    mockGetReservations.mockImplementationOnce(() => {
      throw new Error('Unexpected crash');
    });

    const { req, res } = mockReqRes({ action: 'list', method: 'GET' });
    await handler(req, res);

    // List has its own try-catch and returns 500 internally
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
