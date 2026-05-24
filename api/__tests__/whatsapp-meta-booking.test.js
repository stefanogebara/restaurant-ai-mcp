'use strict';

const { Readable } = require('stream');

// ─── Mocks (hoisted before require) ───────────────────────────────────────────

// Mock AI client — messages.create is controlled per-test via mockAnthropicCreate
const mockAnthropicCreate = jest.fn();
jest.mock('../_lib/ai-client', () => ({
  getAI: () => ({ messages: { create: mockAnthropicCreate } }),
  AI_MODEL: 'anthropic/claude-3.5-sonnet',
  AI_MODEL_FAST: 'anthropic/claude-3-haiku',
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../services/whatsappTestMessageService', () => ({
  updateWhatsAppTestMessageStatus: jest.fn().mockResolvedValue(true),
}));

jest.mock('../_lib/whatsapp-interactions', () => ({
  markAsRead: jest.fn().mockResolvedValue(undefined),
  addReaction: jest.fn().mockResolvedValue(undefined),
  removeReaction: jest.fn().mockResolvedValue(undefined),
  transcribeVoiceMessage: jest.fn().mockResolvedValue('transcribed text'),
  downloadMedia: jest.fn().mockResolvedValue({ buffer: Buffer.from(''), mimeType: 'image/jpeg', size: 100 }),
  simulateTypingDelay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../_lib/rate-limit', () => ({
  isMessageDuplicate: jest.fn().mockResolvedValue(false),
  rejectOversizedBody: jest.fn().mockReturnValue(false),
  checkAndApplyRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  acquireProcessingLock: jest.fn().mockResolvedValue(true),
  releaseProcessingLock: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../_lib/whatsapp-sessions', () => ({
  getOrCreateSession: jest.fn(),
  setSessionRestaurant: jest.fn(),
  getSessionByPhone: jest.fn(),
  updateSessionConversationHistory: jest.fn().mockResolvedValue(true),
}));

jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn().mockResolvedValue({ match: null, confidence: 0 }),
  getAllActiveRestaurants: jest.fn().mockResolvedValue([]),
}));

// insertSingle is stored on the mock module so tests can control it post-require
jest.mock('../_lib/multi-tenant-supabase', () => {
  const insertSingle = jest.fn().mockResolvedValue({
    data: { id: 1, reservation_id: 'RES-TEST-001', customer_name: 'Test User' },
    error: null,
  });

  function makeBuilder(rows = []) {
    const b = {};
    b.select = jest.fn().mockReturnValue(b);
    b.eq = jest.fn().mockReturnValue(b);
    b.in = jest.fn().mockResolvedValue({ data: rows, error: null });
    b.order = jest.fn().mockReturnValue(b);
    b.limit = jest.fn().mockReturnValue(b);
    b.update = jest.fn().mockReturnValue(b);
    b.single = jest.fn().mockResolvedValue({ data: rows[0] || null, error: null });
    b.insert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ single: insertSingle }),
    });
    // Thenable so `await builder.eq(...)` resolves to { data, error }
    b.then = (resolve, reject) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return b;
  }

  const mockFrom = jest.fn().mockImplementation((table) => {
    if (table === 'tables') {
      return makeBuilder([{ id: 'tbl-1', capacity: 10, is_active: true }]);
    }
    return makeBuilder([]);
  });

  const mockClient = { from: mockFrom };
  const getMultiTenantClient = jest.fn().mockReturnValue(mockClient);

  return {
    getMultiTenantClient,
    getRestaurantClient: getMultiTenantClient,
    __mockInsertSingle: insertSingle,
    __mockFrom: mockFrom,
  };
});

jest.mock('../_lib/supabase', () => ({
  canAccommodateParty: jest.fn().mockResolvedValue({
    success: true,
    can_accommodate: true,
    method: 'single',
    tables: [1],
    total_capacity: 10,
    reason: null,
  }),
  // Lenient chain: source now calls .order, .limit, and .schema(...).from()
  // from multiple new code paths (feedback reply check, provider lookup,
  // table/menu fetch for prompt). Build a chain that supports all common
  // terminators and is thenable so plain awaits resolve.
  supabaseAdmin: (() => {
    const makeChain = (data = null) => {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.in = jest.fn().mockReturnValue(chain);
      chain.gte = jest.fn().mockReturnValue(chain);
      chain.lte = jest.fn().mockReturnValue(chain);
      chain.not = jest.fn().mockReturnValue(chain);
      chain.order = jest.fn().mockReturnValue(chain);
      chain.limit = jest.fn().mockReturnValue(chain);
      chain.insert = jest.fn().mockReturnValue(chain);
      chain.update = jest.fn().mockReturnValue(chain);
      chain.single = jest.fn().mockResolvedValue({ data, error: null });
      chain.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
      chain.then = (r) => Promise.resolve({ data: data ? [data] : [], error: null }).then(r);
      return chain;
    };
    return {
      from: jest.fn().mockImplementation(() => makeChain()),
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockImplementation(() => makeChain({ agent_language: 'pt-BR' })),
      }),
    };
  })(),
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn().mockResolvedValue(true),
}));

jest.mock('../_lib/secure-id', () => ({
  generateSecureReservationId: jest.fn().mockReturnValue('RES-TEST-001'),
}));

jest.mock('../services/memoryExtractor', () => ({
  extractMemoriesFromWhatsApp: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/guestMemory', () => ({
  buildGuestContext: jest.fn().mockResolvedValue(''),
}));

// ─── Env setup ────────────────────────────────────────────────────────────────

process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHONE_ID';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
process.env.OPENROUTER_API_KEY = 'sk-test';
// Set a test secret so signature verification runs in tests
process.env.META_APP_SECRET = 'test-meta-app-secret';

// ─── Load handler and mocked refs ────────────────────────────────────────────

jest.useFakeTimers();

const handler = require('../whatsapp-webhook');
const { isMessageDuplicate, rejectOversizedBody } = require('../_lib/rate-limit');
const { updateWhatsAppTestMessageStatus } = require('../services/whatsappTestMessageService');
const {
  getOrCreateSession,
  getSessionByPhone,
  updateSessionConversationHistory,
} = require('../_lib/whatsapp-sessions');
const {
  getMultiTenantClient,
  __mockInsertSingle: insertSingle,
  __mockFrom: mockFrom,
} = require('../_lib/multi-tenant-supabase');
const { canAccommodateParty } = require('../_lib/supabase');

// ─── Fixtures & helpers ───────────────────────────────────────────────────────

function metaBody(from, text, wamid = 'wamid.TEST123') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'ENTRY_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '+1555000',
            phone_number_id: 'PHONE_ID',
          },
          messages: [{
            from: from.replace('+', ''),
            id: wamid,
            timestamp: '1700000000',
            type: 'text',
            text: { body: text },
          }],
          contacts: [{
            profile: { name: 'Test User' },
            wa_id: from.replace('+', ''),
          }],
        },
      }],
    }],
  };
}

function makeSession(opts = {}) {
  return {
    id: 'sess-456',
    sender_phone: '+15551234567',
    restaurant_id: 'rest-123',
    restaurant_confirmed: true,
    conversation_history: [],
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    restaurant: opts.noRestaurant ? null : {
      id: 'rest-123',
      restaurant_name: 'Test Restaurant',
      supabase_url: 'https://test.supabase.co',
      supabase_anon_key: 'test-anon-key',
      language: 'en',
    },
  };
}

const crypto = require('crypto');

function mockReq(method, opts = {}) {
  const body = opts.body || {};
  const headers = opts.headers || {};
  let rawBody = '';
  if (method === 'POST') {
    rawBody = JSON.stringify(body);
    const sig = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex');
    headers['x-hub-signature-256'] = sig;
  }
  // Use a real Node.js Readable stream so the webhook's stream-reading block works
  // (jest.useFakeTimers mocks setImmediate/nextTick, but real streams use native I/O)
  const stream = method === 'POST' && rawBody
    ? Readable.from([Buffer.from(rawBody)])
    : Readable.from([]);

  const req = {
    method,
    headers,
    query: opts.query || {},
    body,
    url: '/api/whatsapp-webhook',
    on: (event, cb) => { stream.on(event, cb); return req; },
  };
  return req;
}

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res;
}

// Anthropic SDK response format helpers
function anthropicToolCallResponse(name, args, id = 'call_1') {
  return {
    content: [{ type: 'tool_use', id, name, input: args }],
    stop_reason: 'tool_use',
  };
}

function anthropicEndTurnResponse(text) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
  };
}

function metaApiOk() {
  return {
    ok: true,
    json: async () => ({ messages: [{ id: 'msg-123' }] }),
    status: 200,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('whatsapp-webhook (Meta Cloud API)', () => {
  let origFetch;

  beforeAll(() => {
    origFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = origFetch;
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply defaults — clearAllMocks doesn't reset implementations
    isMessageDuplicate.mockResolvedValue(false);
    rejectOversizedBody.mockReturnValue(false);
    canAccommodateParty.mockResolvedValue({
      success: true,
      can_accommodate: true,
      method: 'single',
      tables: [1],
      total_capacity: 10,
      reason: null,
    });
    insertSingle.mockResolvedValue({
      data: { id: 1, reservation_id: 'RES-TEST-001', customer_name: 'Test User' },
      error: null,
    });
    getOrCreateSession.mockResolvedValue(makeSession());
    getSessionByPhone.mockResolvedValue(makeSession());
    // Default AI: end-turn response (overridden per test)
    mockAnthropicCreate.mockResolvedValue(anthropicEndTurnResponse('Hello!'));
  });

  // ── 1. GET verification challenge ──────────────────────────────────────────
  it('responds to GET verification challenge', async () => {
    const req = mockReq('GET', {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test-verify-token',
        'hub.challenge': 'abc123',
      },
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('abc123');
  });

  // ── 2. Full booking flow — restaurant in session ────────────────────────────
  it('completes full booking: check_availability → create_reservation → end_turn', async () => {
    let aiCallCount = 0;
    mockAnthropicCreate.mockImplementation(async () => {
      aiCallCount++;
      if (aiCallCount === 1) {
        return anthropicToolCallResponse('check_availability', {
          date: '2026-03-01',
          time: '19:00',
          party_size: 4,
        }, 'call_chk');
      }
      if (aiCallCount === 2) {
        return anthropicToolCallResponse('create_reservation', {
          customer_name: 'Test User',
          customer_phone: '+15551234567',
          date: '2026-03-01',
          time: '19:00',
          party_size: 4,
        }, 'call_res');
      }
      return anthropicEndTurnResponse('Your table is booked for March 1st at 7pm!');
    });
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes('graph.facebook.com')) return metaApiOk();
      return metaApiOk();
    });

    const req = mockReq('POST', {
      body: metaBody('+15551234567', 'Book a table for 4 on March 1st at 7pm'),
    });
    const res = mockRes();

    await handler(req, res);

    // AI called 3 times (check_availability, create_reservation, end_turn)
    expect(aiCallCount).toBe(3);

    // Multi-tenant client retrieved for tool execution
    expect(getMultiTenantClient).toHaveBeenCalled();

    // Reservation was inserted (insertSingle called by create_reservation tool)
    expect(insertSingle).toHaveBeenCalled();

    // At least one Meta Graph API call was made (final reply or template)
    const graphCalls = global.fetch.mock.calls.filter(([url]) =>
      url.includes('graph.facebook.com')
    );
    expect(graphCalls.length).toBeGreaterThanOrEqual(1);

    // Session conversation history saved
    expect(updateSessionConversationHistory).toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── 3. Duplicate wamid → skip AI ───────────────────────────────────────────
  it('returns 200 immediately on duplicate wamid without calling AI', async () => {
    isMessageDuplicate.mockResolvedValue(true);
    global.fetch = jest.fn();

    const req = mockReq('POST', {
      body: metaBody('+15551234567', 'Book a table', 'wamid.DUPLICATE'),
    });
    const res = mockRes();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── 4. No tables available → no reservation inserted ───────────────────────
  it('sends unavailability message when no tables can accommodate party', async () => {
    canAccommodateParty.mockResolvedValue({
      success: true,
      can_accommodate: false,
      method: null,
      tables: [],
      total_capacity: 0,
      reason: 'No tables available for 4 guests',
    });

    let aiCallCount = 0;
    mockAnthropicCreate.mockImplementation(async () => {
      aiCallCount++;
      if (aiCallCount === 1) {
        return anthropicToolCallResponse('check_availability', {
          date: '2026-03-01',
          time: '19:00',
          party_size: 4,
        });
      }
      return anthropicEndTurnResponse("Sorry, we don't have availability for that time.");
    });
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes('graph.facebook.com')) return metaApiOk();
      return metaApiOk();
    });

    const req = mockReq('POST', {
      body: metaBody('+15551234567', 'Book table for 4 on March 1st 7pm'),
    });
    const res = mockRes();

    await handler(req, res);

    // Reservation should NOT be inserted
    expect(insertSingle).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updates persisted WhatsApp test delivery status on webhook status events', async () => {
    const req = mockReq('POST', {
      body: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              statuses: [{
                id: 'wamid.TEST-STATUS-1',
                status: 'delivered',
              }],
            },
          }],
        }],
      },
    });
    const res = mockRes();

    await handler(req, res);

    expect(updateWhatsAppTestMessageStatus).toHaveBeenCalledWith('wamid.TEST-STATUS-1', expect.objectContaining({
      id: 'wamid.TEST-STATUS-1',
      status: 'delivered',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── 5. Oversized body → 413 ────────────────────────────────────────────────
  it('rejects oversized body before any processing', async () => {
    rejectOversizedBody.mockImplementation((req, res) => {
      res.status(413).json({ error: 'Payload Too Large' });
      return true;
    });
    global.fetch = jest.fn();

    const req = mockReq('POST', { body: {} });
    const res = mockRes();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(413);
  });

  // ── 7. cancel_reservation tool → success ───────────────────────────────────
  it('cancels a reservation via cancel_reservation tool', async () => {
    const existingRes = {
      id: 1, reservation_id: 'RES-TEST-001',
      customer_name: 'Test User', date: '2026-03-01',
      time: '19:00', party_size: 4, status: 'confirmed',
    };

    function localBuilder(row) {
      const b = {};
      b.select = jest.fn().mockReturnValue(b);
      b.eq = jest.fn().mockReturnValue(b);
      b.update = jest.fn().mockReturnValue(b);
      b.single = jest.fn().mockResolvedValue({ data: row, error: null });
      b.then = (resolve, reject) =>
        Promise.resolve({ data: row ? [row] : [], error: null }).then(resolve, reject);
      return b;
    }

    // First from() → lookup, second from() → update (no error)
    mockFrom
      .mockImplementationOnce(() => localBuilder(existingRes))
      .mockImplementationOnce(() => localBuilder(null));

    let aiCallCount = 0;
    mockAnthropicCreate.mockImplementation(async () => {
      aiCallCount++;
      if (aiCallCount === 1) {
        return anthropicToolCallResponse('cancel_reservation', {
          reservation_id: 'RES-TEST-001',
        }, 'call_cancel');
      }
      return anthropicEndTurnResponse('Your reservation RES-TEST-001 has been cancelled.');
    });
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes('graph.facebook.com')) return metaApiOk();
      return metaApiOk();
    });

    const req = mockReq('POST', {
      body: metaBody('+15551234567', 'Please cancel reservation RES-TEST-001'),
    });
    const res = mockRes();

    await handler(req, res);

    // AI called twice: cancel_reservation tool + end_turn
    expect(aiCallCount).toBe(2);
    // Lookup + update both called
    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── 8. modify_reservation tool → success ───────────────────────────────────
  it('modifies a reservation via modify_reservation tool', async () => {
    const existingRes = {
      id: 1, reservation_id: 'RES-TEST-001',
      customer_name: 'Test User', date: '2026-03-01',
      time: '19:00', party_size: 4, status: 'confirmed',
    };
    const updatedRes = { ...existingRes, date: '2026-03-08', time: '20:00' };

    function localBuilder(row) {
      const b = {};
      b.select = jest.fn().mockReturnValue(b);
      b.eq = jest.fn().mockReturnValue(b);
      b.update = jest.fn().mockReturnValue(b);
      b.single = jest.fn().mockResolvedValue({ data: row, error: null });
      b.then = (resolve, reject) =>
        Promise.resolve({ data: row ? [row] : [], error: null }).then(resolve, reject);
      return b;
    }

    // First from() → lookup, second from() → update+select+single returning updatedRes
    mockFrom
      .mockImplementationOnce(() => localBuilder(existingRes))
      .mockImplementationOnce(() => localBuilder(updatedRes));

    let aiCallCount = 0;
    mockAnthropicCreate.mockImplementation(async () => {
      aiCallCount++;
      if (aiCallCount === 1) {
        return anthropicToolCallResponse('modify_reservation', {
          reservation_id: 'RES-TEST-001',
          new_date: '2026-03-08',
          new_time: '20:00',
        }, 'call_modify');
      }
      return anthropicEndTurnResponse('Your reservation has been updated to March 8th at 8pm.');
    });
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (url.includes('graph.facebook.com')) return metaApiOk();
      return metaApiOk();
    });

    const req = mockReq('POST', {
      body: metaBody('+15551234567', 'Change reservation RES-TEST-001 to March 8 at 8pm'),
    });
    const res = mockRes();

    await handler(req, res);

    expect(aiCallCount).toBe(2);
    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── 6. Unsupported method → 405 ────────────────────────────────────────────
  it('returns 405 for unsupported HTTP methods', async () => {
    global.fetch = jest.fn();

    const req = mockReq('DELETE', {});
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
