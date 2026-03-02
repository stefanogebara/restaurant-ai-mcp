'use strict';

// ─── Mocks (hoisted before require) ───────────────────────────────────────────

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../_lib/rate-limit', () => ({
  isMessageDuplicate: jest.fn().mockResolvedValue(false),
  rejectOversizedBody: jest.fn().mockReturnValue(false),
  checkAndApplyRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('../_lib/whatsapp-sessions', () => ({
  getOrCreateSession: jest.fn(),
  setSessionRestaurant: jest.fn(),
  getSessionByPhone: jest.fn(),
  updateSessionConversationHistory: jest.fn().mockResolvedValue(true),
  updateSessionContext: jest.fn().mockResolvedValue(true),
}));

jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn().mockResolvedValue({ match: null, confidence: 0 }),
  getRestaurantById: jest.fn().mockResolvedValue(null),
  getAllActiveRestaurants: jest.fn().mockResolvedValue([]),
}));

// insertSingle stored on module for post-require access
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
    // Thenable: `await builder.eq(...)` resolves via .then()
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
  const getMultiTenantClient = jest.fn().mockResolvedValue(mockClient);

  return {
    getMultiTenantClient,
    getRestaurantClient: getMultiTenantClient,
    __mockInsertSingle: insertSingle,
    __mockFrom: mockFrom,
    __mockClient: mockClient,
  };
});

jest.mock('../_lib/central-supabase', () => ({
  centralSupabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve, reject) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject),
    }),
  },
}));

jest.mock('../_lib/supabase', () => ({
  canAccommodateParty: jest.fn().mockResolvedValue({
    success: true,
    can_accommodate: true,
    method: 'single',
    tables: [1],
    total_capacity: 10,
    reason: null,
  }),
  supabaseAdmin: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn().mockResolvedValue(true),
}));

// Anthropic SDK: store mockCreate on constructor so it's accessible after require()
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  const MockAnthropicClass = jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  MockAnthropicClass.__mockCreate = mockCreate;
  return MockAnthropicClass;
});

// Twilio: store mock client create on constructor
jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM_TEST_001' });
  const MockTwilio = jest.fn().mockReturnValue({
    messages: { create: mockCreate },
  });
  MockTwilio.validateRequest = jest.fn().mockReturnValue(true);
  MockTwilio.__mockCreate = mockCreate;
  return MockTwilio;
});

// ─── Env setup ────────────────────────────────────────────────────────────────

process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
// Set a test auth token — validateRequest is mocked to return true
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
// No template → skip template send
delete process.env.TWILIO_TEMPLATE_RESERVATION_CONFIRMED;
process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';

// ─── Load handler and mocked refs ────────────────────────────────────────────

jest.useFakeTimers();

const handler = require('../twilio-whatsapp-webhook');
const { isMessageDuplicate } = require('../_lib/rate-limit');
const {
  getOrCreateSession,
  updateSessionConversationHistory,
} = require('../_lib/whatsapp-sessions');
const {
  __mockInsertSingle: insertSingle,
  getMultiTenantClient,
  __mockFrom: mockFrom,
} = require('../_lib/multi-tenant-supabase');

// Access mockCreate via constructor ref (avoids hoisting issue)
const Anthropic = require('@anthropic-ai/sdk');
const mockMessagesCreate = Anthropic.__mockCreate;

// ─── Fixtures & helpers ───────────────────────────────────────────────────────

/** Build form-urlencoded Twilio POST body as parsed object */
function twilioBody(from, text, sid = 'SM_TEST_001') {
  return {
    From: `whatsapp:${from}`,
    To: 'whatsapp:+14155238886',
    Body: text,
    MessageSid: sid,
    AccountSid: 'AC_TEST',
    NumMedia: '0',
    ProfileName: 'Test User',
  };
}

function makeSession(opts = {}) {
  return {
    id: 'sess-789',
    sender_phone: '+15551234567',
    restaurant_id: opts.noRestaurant ? null : 'rest-123',
    restaurant_confirmed: true,
    conversation_history: [],
    context: opts.context || {},
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

function mockReq(method, opts = {}) {
  const headers = opts.headers || { host: 'localhost:3000' };
  if (method === 'POST') {
    headers['x-twilio-signature'] = 'test-sig'; // validateRequest is mocked to return true
  }
  return {
    method,
    headers,
    query: opts.query || {},
    body: opts.body || {},
    url: '/api/twilio-whatsapp-webhook',
  };
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

/** Anthropic tool_use response (single tool call) */
function anthropicToolUse(name, input, id = 'tu_1') {
  return {
    stop_reason: 'tool_use',
    content: [{
      type: 'tool_use',
      id,
      name,
      input,
    }],
  };
}

/** Anthropic end_turn response (text only) */
function anthropicEndTurn(text) {
  return {
    stop_reason: 'end_turn',
    content: [{
      type: 'text',
      text,
    }],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('twilio-whatsapp-webhook (Twilio path)', () => {
  beforeAll(() => {
    // Ensure mockMessagesCreate was retrieved successfully
    expect(mockMessagesCreate).toBeDefined();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply defaults — clearAllMocks doesn't reset implementations
    isMessageDuplicate.mockResolvedValue(false);
    insertSingle.mockResolvedValue({
      data: { id: 1, reservation_id: 'RES-TEST-001', customer_name: 'Test User' },
      error: null,
    });
    getOrCreateSession.mockResolvedValue(makeSession());
  });

  // ── 1. Full booking flow ───────────────────────────────────────────────────
  it('completes full booking: check_availability → create_reservation → end_turn', async () => {
    let callCount = 0;
    mockMessagesCreate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return anthropicToolUse('check_availability', {
          date: '2026-03-01',
          time: '19:00',
          party_size: 4,
        }, 'tu_chk');
      }
      if (callCount === 2) {
        return anthropicToolUse('create_reservation', {
          customer_name: 'Test User',
          customer_phone: '+15551234567',
          date: '2026-03-01',
          time: '19:00',
          party_size: 4,
        }, 'tu_res');
      }
      return anthropicEndTurn('Your table is booked for March 1st at 7pm!');
    });

    const req = mockReq('POST', {
      body: twilioBody('+15551234567', 'Book a table for 4 on March 1st at 7pm'),
    });
    const res = mockRes();

    await handler(req, res);

    // Anthropic called 3 times
    expect(callCount).toBe(3);

    // Multi-tenant client retrieved for supabase operations
    expect(getMultiTenantClient).toHaveBeenCalled();

    // Reservation was inserted
    expect(insertSingle).toHaveBeenCalled();

    // Session conversation history was saved
    expect(updateSessionConversationHistory).toHaveBeenCalled();

    // Response is TwiML XML
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/xml');
    const sentBody = res.send.mock.calls[0]?.[0] || '';
    expect(sentBody).toContain('<Response>');
    expect(sentBody).toContain('</Response>');

    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── 2. Duplicate MessageSid → skip AI ─────────────────────────────────────
  it('returns empty TwiML immediately on duplicate MessageSid', async () => {
    isMessageDuplicate.mockResolvedValue(true);

    const req = mockReq('POST', {
      body: twilioBody('+15551234567', 'Book a table', 'SM_DUPLICATE'),
    });
    const res = mockRes();

    await handler(req, res);

    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(insertSingle).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const sentBody = res.send.mock.calls[0]?.[0] || '';
    expect(sentBody).toContain('<Response>');
  });

  // ── 3. Missing Body field → empty TwiML ───────────────────────────────────
  it('returns empty TwiML when Body field is missing', async () => {
    const req = mockReq('POST', {
      body: {
        From: 'whatsapp:+15551234567',
        To: 'whatsapp:+14155238886',
        MessageSid: 'SM_NO_BODY',
        // Body intentionally omitted
      },
    });
    const res = mockRes();

    await handler(req, res);

    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const sentBody = res.send.mock.calls[0]?.[0] || '';
    expect(sentBody).toContain('<Response>');
  });

  // ── 4. No restaurant in session → AI text, no reservation ─────────────────
  it('returns AI text response with no reservation when restaurant is not in session', async () => {
    getOrCreateSession.mockResolvedValue(makeSession({ noRestaurant: true }));

    mockMessagesCreate.mockResolvedValue(
      anthropicEndTurn('Which restaurant would you like to visit?')
    );

    const req = mockReq('POST', {
      body: twilioBody('+15551234567', 'I want to make a reservation'),
    });
    const res = mockRes();

    await handler(req, res);

    // AI was called (processed the message even without a restaurant)
    expect(mockMessagesCreate).toHaveBeenCalled();

    // No reservation was inserted (no supabaseClient available)
    expect(insertSingle).not.toHaveBeenCalled();

    // Handler sent a response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalled();
  });

  // ── 6. cancel_reservation tool → success ──────────────────────────────────
  it('cancels a reservation via cancel_reservation tool', async () => {
    const existingRes = {
      id: 1, reservation_id: 'RES-TEST-001',
      customer_name: 'Test User', date: '2026-03-01',
      time: '19:00', party_size: 4, status: 'confirmed',
      customer_phone: '+15551234567', restaurant_id: 'rest-123',
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

    // First from('reservations') → lookup, second → update (no error)
    mockFrom
      .mockImplementationOnce(() => localBuilder(existingRes))
      .mockImplementationOnce(() => localBuilder(null));

    let callCount = 0;
    mockMessagesCreate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return anthropicToolUse('cancel_reservation', {
          reservation_id: 'RES-TEST-001',
        }, 'tu_cancel');
      }
      return anthropicEndTurn('Your reservation RES-TEST-001 has been cancelled.');
    });

    const req = mockReq('POST', {
      body: twilioBody('+15551234567', 'Please cancel reservation RES-TEST-001'),
    });
    const res = mockRes();

    await handler(req, res);

    // Anthropic called twice: cancel_reservation + end_turn
    expect(callCount).toBe(2);
    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(res.status).toHaveBeenCalledWith(200);
    const sentBody = res.send.mock.calls[0]?.[0] || '';
    expect(sentBody).toContain('<Response>');
  });

  // ── 7. modify_reservation tool → success ──────────────────────────────────
  it('modifies a reservation via modify_reservation tool', async () => {
    const existingRes = {
      id: 1, reservation_id: 'RES-TEST-001',
      customer_name: 'Test User', date: '2026-03-01',
      time: '19:00', party_size: 4, status: 'confirmed',
      customer_phone: '+15551234567', restaurant_id: 'rest-123',
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

    // First from() → lookup, second → update+select+single returning updatedRes
    mockFrom
      .mockImplementationOnce(() => localBuilder(existingRes))
      .mockImplementationOnce(() => localBuilder(updatedRes));

    let callCount = 0;
    mockMessagesCreate.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return anthropicToolUse('modify_reservation', {
          reservation_id: 'RES-TEST-001',
          new_date: '2026-03-08',
          new_time: '20:00',
        }, 'tu_modify');
      }
      return anthropicEndTurn('Your reservation has been updated to March 8th at 8pm.');
    });

    const req = mockReq('POST', {
      body: twilioBody('+15551234567', 'Change reservation RES-TEST-001 to March 8 at 8pm'),
    });
    const res = mockRes();

    await handler(req, res);

    expect(callCount).toBe(2);
    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(res.status).toHaveBeenCalledWith(200);
    const sentBody = res.send.mock.calls[0]?.[0] || '';
    expect(sentBody).toContain('<Response>');
  });

  // ── 5. Unsupported method → 405 ───────────────────────────────────────────
  it('returns 405 for unsupported HTTP methods', async () => {
    const req = mockReq('DELETE', {});
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });
});
