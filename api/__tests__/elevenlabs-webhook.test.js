/**
 * Tests for api/elevenlabs-webhook.js
 *
 * Covers:
 *  - Authentication (HMAC signature, Bearer token, Path 3 removal)
 *  - Action routing (dispatch, unknown action, missing action)
 *  - Restaurant routing (required vs global actions)
 *  - get_customer_info (cross-tenant isolation, phone normalization)
 *  - Tool handler smoke tests (check_availability, create_reservation, cancel)
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.MULTI_TENANT_MODE = 'false';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE requiring the handler
// ---------------------------------------------------------------------------

// Supabase mock with chainable query builder
const mockSupabaseRows = jest.fn(() => Promise.resolve({ data: [], error: null }));
const mockSupabaseLimit = jest.fn(() => ({ then: (cb) => mockSupabaseRows().then(cb) }));

// Build a chainable object that returns mockSupabaseRows at the end
function createChainable() {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => mockSupabaseRows());
  chain.single = jest.fn(() => Promise.resolve({ data: null, error: null }));
  chain.maybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
  chain.insert = jest.fn(() => chain);
  return chain;
}

const mockChain = createChainable();
const mockFrom = jest.fn(() => mockChain);
const mockSchemaFrom = jest.fn(() => mockChain);
const mockSchema = jest.fn(() => ({ from: mockSchemaFrom }));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: mockFrom,
    schema: mockSchema,
  },
}));

// Restaurant loader mocks
const mockGetRestaurantByPhone = jest.fn();
const mockGetRestaurantById = jest.fn();
const mockGetRestaurantByAgentId = jest.fn();

jest.mock('../_lib/restaurant-loader', () => ({
  getRestaurantByPhone: (...args) => mockGetRestaurantByPhone(...args),
  getRestaurantById: (...args) => mockGetRestaurantById(...args),
  getRestaurantByAgentId: (...args) => mockGetRestaurantByAgentId(...args),
}));

// Conversation logger mock
jest.mock('../_services/conversationLogger', () => {
  const methods = {
    startConversation: jest.fn(() => Promise.resolve({ id: 'conversation-row' })),
    logToolCall: jest.fn(() => Promise.resolve()),
    updateConversation: jest.fn(() => Promise.resolve()),
    endConversation: jest.fn(() => Promise.resolve()),
  };
  return { ...methods, forRestaurant: jest.fn(() => methods) };
});

// Tool handlers mock
const mockGetDateTime = jest.fn(() => ({
  success: true,
  date: '2026-04-08',
  time: '14:30',
  timezone: 'America/Sao_Paulo',
}));
const mockCheckAvailability = jest.fn(() => Promise.resolve({
  success: true,
  available: true,
  message: 'Table available',
}));
const mockCreateReservation = jest.fn(() => Promise.resolve({
  success: true,
  reservation_id: 'RES-001',
  message: 'Reservation confirmed',
}));
const mockLookupReservation = jest.fn(() => Promise.resolve({
  success: true,
  found: true,
  reservations: [{ reservation_id: 'RES-001' }],
}));
const mockModifyReservation = jest.fn(() => Promise.resolve({
  success: true,
  message: 'Reservation modified',
}));
const mockCancelReservation = jest.fn(() => Promise.resolve({
  success: true,
  message: 'Reservation cancelled',
}));
const mockGetWaitTime = jest.fn(() => Promise.resolve({
  success: true,
  estimated_wait: '15 minutes',
}));
const mockIdentifyRestaurant = jest.fn(() => Promise.resolve({
  success: true,
  restaurant_identified: true,
  restaurant_name: 'Test Restaurant',
}));

jest.mock('../_lib/tool-handlers', () => ({
  getDateTime: (...args) => mockGetDateTime(...args),
  checkAvailability: (...args) => mockCheckAvailability(...args),
  createReservation: (...args) => mockCreateReservation(...args),
  lookupReservation: (...args) => mockLookupReservation(...args),
  modifyReservation: (...args) => mockModifyReservation(...args),
  cancelReservation: (...args) => mockCancelReservation(...args),
  getWaitTime: (...args) => mockGetWaitTime(...args),
  identifyRestaurant: (...args) => mockIdentifyRestaurant(...args),
}));

// CORS mock
jest.mock('../_lib/cors', () => ({
  setWebhookCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

// Usage tracking mock
jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn(),
}));

// Multi-tenant supabase mock
jest.mock('../_lib/multi-tenant-supabase', () => ({
  getRestaurantClient: jest.fn(() => ({})),
}));

// WhatsApp sessions mock
jest.mock('../_lib/whatsapp-sessions', () => ({
  getSessionByPhone: jest.fn(() => Promise.resolve(null)),
}));

// Secure logger mock
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// WhatsApp sender mock
jest.mock('../_lib/whatsapp-sender', () => ({
  isWhatsAppConfigured: jest.fn(() => false),
  sendReservationConfirmation: jest.fn(() => Promise.resolve()),
}));

// Email mock
jest.mock('../_lib/email', () => ({
  sendReservationConfirmationEmail: jest.fn(() => Promise.resolve()),
}));

// Voice note trigger mock
jest.mock('../_services/whatsapp/voice-note-trigger', () => ({
  sendConfirmationVoiceNote: jest.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Require handler AFTER mocks
// ---------------------------------------------------------------------------
const handler = require('../elevenlabs-webhook');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const WEBHOOK_SECRET = 'test-webhook-secret';
const CRON_SECRET = 'test-cron-secret';
const RESTAURANT_A = {
  id: 'rest-aaa-111',
  name: 'Restaurant A',
  restaurant_name: 'Restaurant A',
  language: 'pt-BR',
  voice_id: 'voice-a',
  business_hours: {},
  table_configuration: [],
};
const RESTAURANT_B = {
  id: 'rest-bbb-222',
  name: 'Restaurant B',
  restaurant_name: 'Restaurant B',
  language: 'en',
};

/**
 * Compute a valid HMAC-SHA256 signature for a given body
 */
function computeSignature(body, secret = WEBHOOK_SECRET) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

/**
 * Build a minimal Express-like request object
 */
function mockReq({ method = 'POST', body = {}, query = {}, headers = {} } = {}) {
  return {
    method,
    url: '/api/elevenlabs-webhook',
    body,
    query,
    headers: { ...headers },
  };
}

/**
 * Build a minimal Express-like response object with spies
 */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Create an authenticated request via HMAC signature
 */
function authenticatedReq({ body = {}, query = {}, headers = {}, method = 'POST' } = {}) {
  const signature = computeSignature(body);
  return mockReq({
    method,
    body,
    query,
    headers: { 'x-elevenlabs-signature': signature, ...headers },
  });
}

/**
 * Create an authenticated request via Bearer token
 */
function bearerReq({ body = {}, query = {}, headers = {}, method = 'POST' } = {}) {
  return mockReq({
    method,
    body,
    query,
    headers: { authorization: `Bearer ${CRON_SECRET}`, ...headers },
  });
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockChain.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  mockSupabaseRows.mockReset().mockResolvedValue({ data: [], error: null });
  // Default: restaurant loader rejects (not found)
  mockGetRestaurantByPhone.mockRejectedValue(new Error('Not found'));
  mockGetRestaurantById.mockRejectedValue(new Error('Not found'));
  mockGetRestaurantByAgentId.mockRejectedValue(new Error('Not found'));
});

describe('Shared voice agent routing', () => {
  const sharedSecret = 's'.repeat(40);
  const sharedAgent = 'agent_shared_test';
  const called = '+15551234567';
  const caller = '+5511999990000';
  const headers = {
    authorization: `Bearer ${sharedSecret}`,
    'x-agent-id': sharedAgent,
    'x-conversation-id': 'conv-shared-1',
    'x-called-number': called,
    'x-caller-number': caller,
  };
  const bound = { id: 1, agent_id: sharedAgent, restaurant_info_id: RESTAURANT_A.id, called_phone: called, caller_phone: caller };

  beforeEach(() => {
    process.env.ELEVENLABS_SHARED_TOOL_SECRET = sharedSecret;
    process.env.ELEVENLABS_SHARED_AGENT_ID = sharedAgent;
    process.env.ELEVENLABS_SHARED_PHONE = called;
    mockGetRestaurantById.mockResolvedValue({ ...RESTAURANT_A, is_demo: false, onboarding_completed: true, ai_config: { phone: { shared_routing_enabled: true } } });
  });
  afterAll(() => {
    delete process.env.ELEVENLABS_SHARED_TOOL_SECRET;
    delete process.env.ELEVENLABS_SHARED_AGENT_ID;
    delete process.env.ELEVENLABS_SHARED_PHONE;
  });

  test('blocks unbound availability before any customer or reservation lookup', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'check_availability', date: '2026-11-08', time: '19:00', party_size: 2 }, headers }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockCheckAvailability).not.toHaveBeenCalled();
  });

  test('identifies and binds an explicitly opted-in restaurant before other tools run', async () => {
    mockSupabaseRows.mockResolvedValueOnce({ data: [{ id: RESTAURANT_A.id, restaurant_name: RESTAURANT_A.name, city: 'São Paulo', ai_config: { phone: { shared_routing_enabled: true } } }], error: null });
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: bound, error: null });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'identify_restaurant', restaurant_name: RESTAURANT_A.name, city: 'São Paulo' }, headers }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, restaurant_id: RESTAURANT_A.id }));
    expect(mockChain.insert).toHaveBeenCalledWith(expect.objectContaining({ agent_id: sharedAgent, restaurant_info_id: RESTAURANT_A.id }));
    expect(mockCheckAvailability).not.toHaveBeenCalled();
  });

  test('routes a bound call only to its durable restaurant', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: bound, error: null });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'check_availability', date: '2026-11-08', time: '19:00', party_size: 2 }, headers }), res);
    expect(mockCheckAvailability).toHaveBeenCalledWith(RESTAURANT_A.id, expect.any(Object), expect.any(Object));
    expect(mockGetRestaurantByPhone).not.toHaveBeenCalled();
    expect(mockGetRestaurantByAgentId).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  test('rejects a model-authored restaurant ID that conflicts with the binding', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: bound, error: null });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'check_availability', restaurant_id: RESTAURANT_B.id }, headers }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCheckAvailability).not.toHaveBeenCalled();
    const queryRes = mockRes();
    await handler(mockReq({
      body: { action: 'check_availability' },
      query: { restaurant_id: RESTAURANT_B.id }, headers,
    }), queryRes);
    expect(queryRes.status).toHaveBeenCalledWith(403);
    expect(mockCheckAvailability).not.toHaveBeenCalled();
  });

  test('blocks customer lookup until guest identity can be verified', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: bound, error: null });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'get_customer_info', phone: caller }, headers }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockFrom).not.toHaveBeenCalledWith('reservations');
  });

  test.each(['lookup_reservation', 'modify_reservation', 'cancel_reservation'])(
    'blocks %s until guest identity can be verified', async action => {
    mockChain.maybeSingle.mockResolvedValue({ data: bound, error: null });
    const res = mockRes();
    await handler(mockReq({ body: { action, reservation_id: 'RES-1' }, headers }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockLookupReservation).not.toHaveBeenCalled();
    expect(mockModifyReservation).not.toHaveBeenCalled();
    expect(mockCancelReservation).not.toHaveBeenCalled();
  });

  test('a new booking cannot target a phone or email supplied by the model', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: bound, error: null });
    const res = mockRes();
    await handler(mockReq({ body: { action: 'create_reservation', customer_phone: '+15557654321', customer_email: 'third@example.com' }, headers }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });

  test('a new booking uses the trusted caller number', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: bound, error: null });
    const res = mockRes();
    await handler(mockReq({ body: {
      action: 'create_reservation', date: '2026-11-08', time: '19:00', party_size: 2,
      customer_name: 'Guest',
    }, headers }), res);
    expect(mockCreateReservation).toHaveBeenCalledWith(RESTAURANT_A.id, expect.any(Object),
      expect.objectContaining({ customer_phone: caller, customer_email: undefined }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejects a legacy token claiming to be the shared agent', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { action: 'get_current_datetime' }, headers: { ...headers, authorization: `Bearer ${CRON_SECRET}` } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('rejects a valid signature without the shared tool secret', async () => {
    const res = mockRes();
    await handler(authenticatedReq({ body: { action: 'get_current_datetime' }, headers: { 'x-agent-id': sharedAgent } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ===========================================================================
// AUTHENTICATION TESTS (CRITICAL — SEC-CRIT-01 audit findings)
// ===========================================================================
describe('Authentication', () => {
  describe('Path 1: HMAC signature', () => {
    test('valid HMAC signature authenticates the request', async () => {
      const body = { action: 'get_current_datetime' };
      const req = authenticatedReq({ body });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    test('invalid HMAC signature returns 403', async () => {
      const body = { action: 'get_current_datetime' };
      const req = mockReq({
        body,
        headers: { 'x-elevenlabs-signature': 'deadbeef1234567890abcdef' },
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication failed' })
      );
    });

    test('mismatched signature length returns 403', async () => {
      const body = { action: 'get_current_datetime' };
      const req = mockReq({
        body,
        headers: { 'x-elevenlabs-signature': 'short' },
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Path 2: Bearer token', () => {
    test('valid Bearer token authenticates the request', async () => {
      const body = { action: 'get_current_datetime' };
      const req = bearerReq({ body });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    test('invalid Bearer token returns 403', async () => {
      const body = { action: 'get_current_datetime' };
      const req = mockReq({
        body,
        headers: { authorization: 'Bearer wrong-secret' },
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Path 3: REMOVED (SEC-CRIT-01)', () => {
    test('request with restaurant_id and action in query but no auth returns 403', async () => {
      const req = mockReq({
        query: { restaurant_id: 'rest-123', action: 'check_availability' },
        body: {},
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication failed' })
      );
    });

    test('request with agent_id in query but no auth returns 403', async () => {
      const req = mockReq({
        query: { agent_id: 'agent-123', action: 'get_customer_info' },
        body: {},
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('No authentication at all', () => {
    test('request with no signature or token returns 403', async () => {
      const req = mockReq({ body: { action: 'get_current_datetime' } });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication failed' })
      );
    });

    test('empty Authorization header returns 403', async () => {
      const req = mockReq({
        body: { action: 'get_current_datetime' },
        headers: { authorization: '' },
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('OPTIONS preflight', () => {
    test('OPTIONS request is handled by preflight handler', async () => {
      const { handlePreflight } = require('../_lib/cors');
      handlePreflight.mockReturnValueOnce(true);

      const req = mockReq({ method: 'OPTIONS', body: {} });
      const res = mockRes();

      await handler(req, res);

      // Should NOT reach auth or action logic
      expect(res.status).not.toHaveBeenCalledWith(403);
    });
  });
});

describe('Per-restaurant secret scope', () => {
  const secret = 'el_whsec_restaurant_a';
  const logs = require('../_services/conversationLogger');

  function scopedRequest({ action = 'create_reservation', body = {}, query = {}, headers = {} } = {}) {
    return mockReq({
      query: { restaurant_id: RESTAURANT_A.id, ...query },
      body: {
        action, date: '2026-11-10', time: '19:00', party_size: 2,
        customer_name: 'Test Guest', ...body,
      },
      headers: { authorization: `Bearer ${secret}`, ...headers },
    });
  }

  beforeEach(() => {
    mockChain.maybeSingle.mockResolvedValue({ data: { elevenlabs_webhook_secret: secret }, error: null });
    mockGetRestaurantById.mockResolvedValue(RESTAURANT_A);
    mockGetRestaurantByPhone.mockResolvedValue(RESTAURANT_B);
    mockGetRestaurantByAgentId.mockResolvedValue(RESTAURANT_B);
  });

  test('a called number for B cannot create a B booking or assign its conversation to B', async () => {
    const req = scopedRequest({
      body: { conversation_id: 'conversation-a' },
      headers: { 'x-called-number': '+5511999000000' },
    });
    const res = mockRes();

    await handler(req, res);

    expect(mockCreateReservation).toHaveBeenCalledWith(RESTAURANT_A.id, RESTAURANT_A, expect.any(Object));
    expect(mockGetRestaurantByPhone).not.toHaveBeenCalled();
    expect(logs.updateConversation).not.toHaveBeenCalledWith('conversation-a', { restaurant_info_id: RESTAURANT_B.id });
  });

  test('a foreign agent hint cannot change the authenticated restaurant', async () => {
    await handler(scopedRequest({ action: 'lookup_reservation', body: { agent_id: 'agent-b' } }), mockRes());

    expect(mockLookupReservation).toHaveBeenCalledWith(RESTAURANT_A.id, expect.any(Object));
    expect(mockGetRestaurantByAgentId).not.toHaveBeenCalled();
  });

  test('a confirmed session for B cannot override A when multi-tenant mode is enabled', async () => {
    let multiTenantHandler;
    let sessions;
    process.env.MULTI_TENANT_MODE = 'true';
    try {
      jest.isolateModules(() => {
        multiTenantHandler = require('../elevenlabs-webhook');
        sessions = require('../_lib/whatsapp-sessions');
      });
    } finally {
      process.env.MULTI_TENANT_MODE = 'false';
    }
    sessions.getSessionByPhone.mockResolvedValue({ restaurant_confirmed: true, restaurant: RESTAURANT_B });

    await multiTenantHandler(scopedRequest({ body: { sender_phone: '+5511988888888' } }), mockRes());

    expect(mockCreateReservation).toHaveBeenCalledWith(RESTAURANT_A.id, RESTAURANT_A, expect.any(Object));
    expect(sessions.getSessionByPhone).not.toHaveBeenCalled();
  });

  test('a conflicting body restaurant ID is rejected before logging or booking', async () => {
    const res = mockRes();
    await handler(scopedRequest({ body: { restaurant_id: RESTAURANT_B.id, conversation_id: 'conversation-b' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCreateReservation).not.toHaveBeenCalled();
    expect(logs.startConversation).not.toHaveBeenCalled();
  });

  test('a foreign conversation ID cannot receive tool or outcome writes', async () => {
    logs.startConversation.mockResolvedValueOnce(null);
    const res = mockRes();
    await handler(scopedRequest({ body: { conversation_id: 'conversation-b', conversation_started: true } }), res);

    expect(mockCreateReservation).toHaveBeenCalledWith(RESTAURANT_A.id, RESTAURANT_A, expect.any(Object));
    expect(logs.forRestaurant).toHaveBeenCalledWith(RESTAURANT_A.id);
    expect(logs.logToolCall).not.toHaveBeenCalled();
    expect(logs.updateConversation).not.toHaveBeenCalled();
  });

  test('an ambiguous query restaurant ID cannot authenticate', async () => {
    const res = mockRes();
    await handler(scopedRequest({ query: { restaurant_id: [RESTAURANT_A.id, RESTAURANT_B.id] } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockChain.maybeSingle).not.toHaveBeenCalled();
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });

  test('a failed pinned restaurant lookup stops before booking', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_B);
    const res = mockRes();
    await handler(scopedRequest(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });

  test('a scoped secret cannot run global restaurant identification', async () => {
    const res = mockRes();
    await handler(scopedRequest({ action: 'identify_restaurant', body: { restaurant_name: RESTAURANT_B.name } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockIdentifyRestaurant).not.toHaveBeenCalled();
  });

  test('a valid global signature cannot turn an A secret into global authority', async () => {
    const req = scopedRequest({ body: { restaurant_id: RESTAURANT_B.id } });
    req.headers['x-elevenlabs-signature'] = computeSignature(req.body);
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCreateReservation).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// ACTION ROUTING TESTS
// ===========================================================================
describe('Action routing', () => {
  test('missing action returns available actions list', async () => {
    const req = authenticatedReq({ body: {} });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(false);
    expect(response.error).toBe('No action specified');
    expect(response.available_actions).toEqual(expect.arrayContaining([
      'check_availability',
      'create_reservation',
      'get_current_datetime',
      'get_customer_info',
    ]));
  });

  test('unknown action returns error with available actions', async () => {
    const body = { action: 'teleport_customer' };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(false);
    expect(response.error).toBe('Unknown action');
    expect(response.message).toContain('teleport_customer');
    expect(response.available_actions).toBeDefined();
  });

  test('action from query param works', async () => {
    const req = authenticatedReq({
      body: {},
      query: { action: 'get_current_datetime' },
    });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(mockGetDateTime).toHaveBeenCalled();
  });

  test('action from body takes precedence when both present', async () => {
    // Body action is checked via `req.query.action || req.body?.action`
    // so query takes precedence actually. Let's test with only body action.
    const body = { action: 'get_current_datetime' };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockGetDateTime).toHaveBeenCalled();
  });
});

// ===========================================================================
// RESTAURANT ROUTING TESTS
// ===========================================================================
describe('Restaurant routing', () => {
  test('global action (get_current_datetime) works without restaurant context', async () => {
    const body = { action: 'get_current_datetime' };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    // Should NOT have tried to look up restaurant
    expect(mockGetRestaurantByPhone).not.toHaveBeenCalled();
    expect(mockGetRestaurantById).not.toHaveBeenCalled();
  });

  test('action requiring restaurant context without restaurant_id returns error', async () => {
    // All restaurant loaders fail (default mock behavior)
    const body = { action: 'check_availability', date: '2026-04-10', time: '19:00', party_size: 4 };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(false);
    expect(response.error).toBe('Restaurant not identified');
  });

  test('restaurant looked up by phone number (Method 1)', async () => {
    mockGetRestaurantByPhone.mockResolvedValueOnce(RESTAURANT_A);

    const body = { action: 'check_availability', date: '2026-04-10', time: '19:00', party_size: 4 };
    const req = authenticatedReq({
      body,
      headers: {
        'x-elevenlabs-signature': computeSignature(body),
        'x-called-number': '+5511999001234',
      },
    });
    const res = mockRes();

    await handler(req, res);

    expect(mockGetRestaurantByPhone).toHaveBeenCalledWith('+5511999001234');
    expect(mockCheckAvailability).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      RESTAURANT_A,
      expect.objectContaining({ date: '2026-04-10' })
    );
  });

  test('restaurant looked up by agent_id (Method 2)', async () => {
    mockGetRestaurantByAgentId.mockResolvedValueOnce(RESTAURANT_A);

    const body = {
      action: 'check_availability',
      agent_id: 'agent-xyz',
      date: '2026-04-10',
      time: '19:00',
      party_size: 4,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockGetRestaurantByAgentId).toHaveBeenCalledWith('agent-xyz');
    expect(mockCheckAvailability).toHaveBeenCalled();
  });

  test('restaurant looked up by restaurant_id (Method 3 fallback)', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_A);

    const body = {
      action: 'check_availability',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 4,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockGetRestaurantById).toHaveBeenCalledWith(RESTAURANT_A.id);
  });

  test('phone lookup takes priority over agent_id lookup', async () => {
    mockGetRestaurantByPhone.mockResolvedValueOnce(RESTAURANT_A);

    const body = {
      action: 'check_availability',
      agent_id: 'agent-xyz',
      date: '2026-04-10',
      time: '19:00',
      party_size: 4,
    };
    const req = authenticatedReq({
      body,
      headers: {
        'x-elevenlabs-signature': computeSignature(body),
        'x-called-number': '+5511999001234',
      },
    });
    const res = mockRes();

    await handler(req, res);

    // Phone should be tried first, and since it succeeds, agent_id should NOT be tried
    expect(mockGetRestaurantByPhone).toHaveBeenCalled();
    expect(mockGetRestaurantByAgentId).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET_CUSTOMER_INFO TESTS (CRITICAL — SEC-CRIT-02 cross-tenant)
// ===========================================================================
describe('get_customer_info', () => {
  const CUSTOMER_PHONE = '+5511999887766';

  function setupRestaurantAndCustomer(restaurantId, customerRows) {
    // When .limit() is called, return customer rows
    mockSupabaseRows.mockResolvedValueOnce({ data: customerRows, error: null });
  }

  test('returns customer data scoped to restaurant_id', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_A);
    // First variant check returns results
    mockSupabaseRows.mockResolvedValueOnce({
      data: [
        {
          customer_name: 'Maria Silva',
          customer_phone: CUSTOMER_PHONE,
          date: '2026-04-01',
          time: '19:00',
          status: 'confirmed',
        },
      ],
      error: null,
    });

    const body = {
      action: 'get_customer_info',
      restaurant_id: RESTAURANT_A.id,
      phone: CUSTOMER_PHONE,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.known).toBe(true);
    expect(response.customer_name).toBe('Maria Silva');
    expect(response.reservation_count).toBe(1);

    // Verify the query was scoped to the correct restaurant
    expect(mockChain.eq).toHaveBeenCalledWith('restaurant_id', RESTAURANT_A.id);
  });

  test('does NOT return data from other restaurants (cross-tenant isolation)', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_B);
    // All variant lookups return empty — customer only has reservations at Restaurant A
    mockSupabaseRows.mockResolvedValue({ data: [], error: null });

    const body = {
      action: 'get_customer_info',
      restaurant_id: RESTAURANT_B.id,
      phone: CUSTOMER_PHONE,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.known).toBe(false);

    // Verify every query was scoped to Restaurant B, NOT Restaurant A
    const eqCalls = mockChain.eq.mock.calls;
    const restaurantIdCalls = eqCalls.filter(([col]) => col === 'restaurant_id');
    for (const [, value] of restaurantIdCalls) {
      expect(value).toBe(RESTAURANT_B.id);
      expect(value).not.toBe(RESTAURANT_A.id);
    }
  });

  test('missing phone returns known: false', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_A);

    const body = {
      action: 'get_customer_info',
      restaurant_id: RESTAURANT_A.id,
      // phone intentionally missing
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.known).toBe(false);
    expect(response.message).toContain('No phone');
  });

  test('phone normalization strips whitespace and dashes', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_A);
    // Return empty for all variants so we can inspect what was queried
    mockSupabaseRows.mockResolvedValue({ data: [], error: null });

    const body = {
      action: 'get_customer_info',
      restaurant_id: RESTAURANT_A.id,
      phone: '+55 (11) 99988-7766',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    // The handler should have queried multiple normalized variants
    const phoneCalls = mockChain.eq.mock.calls.filter(([col]) => col === 'customer_phone');
    const queriedPhones = phoneCalls.map(([, val]) => val);

    // Should include stripped version without special chars
    expect(queriedPhones).toContain('5511999887766');
    // Should include the original
    expect(queriedPhones).toContain('+55 (11) 99988-7766');
  });

  test('returns recent_reservations capped at 3', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_A);
    mockSupabaseRows.mockResolvedValueOnce({
      data: [
        { customer_name: 'Maria', customer_phone: CUSTOMER_PHONE, date: '2026-04-01', time: '19:00', status: 'confirmed' },
        { customer_name: 'Maria', customer_phone: CUSTOMER_PHONE, date: '2026-03-25', time: '20:00', status: 'completed' },
        { customer_name: 'Maria', customer_phone: CUSTOMER_PHONE, date: '2026-03-18', time: '19:30', status: 'completed' },
        { customer_name: 'Maria', customer_phone: CUSTOMER_PHONE, date: '2026-03-11', time: '19:00', status: 'completed' },
        { customer_name: 'Maria', customer_phone: CUSTOMER_PHONE, date: '2026-03-04', time: '20:30', status: 'no-show' },
      ],
      error: null,
    });

    const body = {
      action: 'get_customer_info',
      restaurant_id: RESTAURANT_A.id,
      phone: CUSTOMER_PHONE,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.known).toBe(true);
    expect(response.reservation_count).toBe(5);
    expect(response.recent_reservations).toHaveLength(3);
  });

  test('handles supabase error gracefully', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(RESTAURANT_A);
    // Simulate a DB error
    mockSupabaseRows.mockRejectedValueOnce(new Error('DB connection failed'));

    const body = {
      action: 'get_customer_info',
      restaurant_id: RESTAURANT_A.id,
      phone: CUSTOMER_PHONE,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.known).toBe(false);
    expect(response.message).toContain('Error');
  });
});

// ===========================================================================
// TOOL HANDLER SMOKE TESTS
// ===========================================================================
describe('Tool handlers (smoke tests)', () => {
  beforeEach(() => {
    // All tool-requiring actions need a restaurant
    mockGetRestaurantById.mockResolvedValue(RESTAURANT_A);
  });

  test('get_current_datetime returns date/time info', async () => {
    const body = { action: 'get_current_datetime' };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockGetDateTime).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.date).toBeDefined();
  });

  test('check_availability returns availability data', async () => {
    const body = {
      action: 'check_availability',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 4,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockCheckAvailability).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      RESTAURANT_A,
      expect.objectContaining({ date: '2026-04-10', time: '19:00', party_size: 4 })
    );
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.available).toBe(true);
  });

  test('create_reservation creates a reservation', async () => {
    const body = {
      action: 'create_reservation',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 4,
      customer_name: 'Carlos Oliveira',
      customer_phone: '+5511999001234',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockCreateReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      RESTAURANT_A,
      expect.objectContaining({
        customer_name: 'Carlos Oliveira',
        customer_phone: '+5511999001234',
        party_size: 4,
      })
    );
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.reservation_id).toBe('RES-001');
  });

  test('lookup_reservation returns reservation data', async () => {
    const body = {
      action: 'lookup_reservation',
      restaurant_id: RESTAURANT_A.id,
      phone: '+5511999001234',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockLookupReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      expect.objectContaining({ phone: '+5511999001234' })
    );
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.found).toBe(true);
  });

  test('modify_reservation modifies reservation', async () => {
    const body = {
      action: 'modify_reservation',
      restaurant_id: RESTAURANT_A.id,
      reservation_id: 'RES-001',
      new_date: '2026-04-12',
      new_time: '20:00',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockModifyReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      expect.objectContaining({
        reservation_id: 'RES-001',
        new_date: '2026-04-12',
        new_time: '20:00',
      })
    );
  });

  test('cancel_reservation cancels a reservation', async () => {
    const body = {
      action: 'cancel_reservation',
      restaurant_id: RESTAURANT_A.id,
      reservation_id: 'RES-001',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockCancelReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      expect.objectContaining({ reservation_id: 'RES-001' })
    );
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
  });

  test('get_wait_time returns wait time', async () => {
    const body = {
      action: 'get_wait_time',
      restaurant_id: RESTAURANT_A.id,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockGetWaitTime).toHaveBeenCalledWith(RESTAURANT_A.id);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
  });
});

// ===========================================================================
// CREATE RESERVATION — CONFIRMATION SIDE-EFFECTS
// ===========================================================================
describe('create_reservation — confirmations', () => {
  const conversationLogger = require('../_services/conversationLogger');
  const { trackUsage } = require('../_lib/usage-tracking');

  beforeEach(() => {
    mockGetRestaurantById.mockResolvedValue(RESTAURANT_A);
  });

  test('tracks usage on successful reservation', async () => {
    const body = {
      action: 'create_reservation',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 2,
      customer_name: 'Ana',
      customer_phone: '+5511999001234',
      conversation_id: 'conv-123',
    };
    const req = authenticatedReq({ body });
    req.conversation_id = 'conv-123';
    const res = mockRes();

    await handler(req, res);

    expect(trackUsage).toHaveBeenCalledWith(RESTAURANT_A.id, 'ai_call_completed');
  });

  test('records booking without ending the call before post-call delivery', async () => {
    const body = {
      action: 'create_reservation',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 2,
      customer_name: 'Ana',
      customer_phone: '+5511999001234',
      conversation_id: 'conv-456',
    };
    const sig = computeSignature(body);
    const req = mockReq({
      body,
      headers: {
        'x-elevenlabs-signature': sig,
        'x-conversation-id': 'conv-456',
      },
    });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.reservation_id).toBe('RES-001');
    // Conversation logger should have been called
    expect(conversationLogger.updateConversation).toHaveBeenCalledWith(
      'conv-456',
      expect.objectContaining({
        outcome: 'reservation_created',
        reservation_id: 'RES-001',
      })
    );
    expect(conversationLogger.endConversation).not.toHaveBeenCalled();
  });

  test('handles createReservation failure gracefully', async () => {
    mockCreateReservation.mockResolvedValueOnce({
      success: false,
      message: 'No tables available for that time',
    });

    const body = {
      action: 'create_reservation',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 20,
      customer_name: 'Large Group',
      customer_phone: '+5511999001234',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(false);
    // Usage should NOT be tracked on failure
    expect(trackUsage).not.toHaveBeenCalled();
  });

  test('handles createReservation exception gracefully', async () => {
    mockCreateReservation.mockRejectedValueOnce(new Error('DB timeout'));

    const body = {
      action: 'create_reservation',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 4,
      customer_name: 'Error Case',
      customer_phone: '+5511999001234',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    // Should return 200 with error message (ElevenLabs expects 200)
    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(false);
    expect(response.message).toContain('try again');
  });
});

// ===========================================================================
// IDENTIFY RESTAURANT (multi-tenant)
// ===========================================================================
describe('identify_restaurant', () => {
  test('direct DB search works without sender_phone', async () => {
    // Mock supabase schema query for restaurant search
    const restaurants = [
      { id: 'rest-1', restaurant_name: 'Cantina Bella Vista', is_active: true, onboarding_completed: true },
      { id: 'rest-2', restaurant_name: 'Sushi Palace', is_active: true, onboarding_completed: true },
    ];
    mockSchemaFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: restaurants }),
        }),
      }),
    });

    const body = {
      action: 'identify_restaurant',
      restaurant_name: 'Bella Vista',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.restaurant_identified).toBe(true);
    expect(response.restaurant_name).toBe('Cantina Bella Vista');
  });

  test('missing restaurant_name returns error', async () => {
    const body = {
      action: 'identify_restaurant',
      // no restaurant_name
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(false);
    expect(response.error).toContain('restaurant_name');
  });
});

// ===========================================================================
// ERROR HANDLING
// ===========================================================================
describe('Error handling', () => {
  test('unhandled error returns 200 with error JSON (ElevenLabs expects JSON)', async () => {
    // Force an error by making getDateTime throw
    mockGetDateTime.mockImplementationOnce(() => { throw new Error('Unexpected crash'); });

    const body = { action: 'get_current_datetime' };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.success).toBe(false);
    expect(response.error).toBe(true);
    expect(response.message).toContain('error occurred');
  });

  test('Content-Type header is always set to application/json', async () => {
    const req = authenticatedReq({ body: { action: 'get_current_datetime' } });
    const res = mockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
  });
});

// ===========================================================================
// CONVERSATION LOGGING
// ===========================================================================
describe('Conversation logging', () => {
  const conversationLogger = require('../_services/conversationLogger');

  test('starts conversation when conversation_id is present', async () => {
    const body = {
      action: 'get_current_datetime',
      conversation_id: 'conv-log-001',
      language: 'pt-BR',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(conversationLogger.startConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-log-001',
        language: 'pt-BR',
      })
    );
  });

  test('does not start conversation when conversation_started is true', async () => {
    const body = {
      action: 'get_current_datetime',
      conversation_id: 'conv-log-001',
      conversation_started: true,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(conversationLogger.startConversation).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// MODIFY/CANCEL RESERVATION — FIELD NAME ALIASES
// ===========================================================================
describe('Field name aliases', () => {
  beforeEach(() => {
    mockGetRestaurantById.mockResolvedValue(RESTAURANT_A);
  });

  test('modify_reservation accepts date/time without new_ prefix', async () => {
    const body = {
      action: 'modify_reservation',
      restaurant_id: RESTAURANT_A.id,
      reservation_id: 'RES-001',
      date: '2026-04-15',
      time: '21:00',
      party_size: 6,
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockModifyReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      expect.objectContaining({
        reservation_id: 'RES-001',
        new_date: '2026-04-15',
        new_time: '21:00',
        new_party_size: 6,
      })
    );
  });

  test('cancel_reservation accepts "id" as alias for reservation_id', async () => {
    const body = {
      action: 'cancel_reservation',
      restaurant_id: RESTAURANT_A.id,
      id: 'RES-002',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockCancelReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      expect.objectContaining({ reservation_id: 'RES-002' })
    );
  });

  test('lookup_reservation accepts "customer_name" as alias for "name"', async () => {
    const body = {
      action: 'lookup_reservation',
      restaurant_id: RESTAURANT_A.id,
      customer_name: 'Maria',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockLookupReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      expect.objectContaining({ name: 'Maria' })
    );
  });

  test('create_reservation accepts "phone" as alias for "customer_phone"', async () => {
    const body = {
      action: 'create_reservation',
      restaurant_id: RESTAURANT_A.id,
      date: '2026-04-10',
      time: '19:00',
      party_size: 2,
      customer_name: 'Pedro',
      phone: '+5511999887766',
    };
    const req = authenticatedReq({ body });
    const res = mockRes();

    await handler(req, res);

    expect(mockCreateReservation).toHaveBeenCalledWith(
      RESTAURANT_A.id,
      expect.any(Object),
      expect.objectContaining({ customer_phone: '+5511999887766' })
    );
  });
});
