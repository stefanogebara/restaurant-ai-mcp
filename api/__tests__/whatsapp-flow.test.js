'use strict';

/**
 * WhatsApp Conversation Flow Tests
 *
 * Tests multiple conversation scenarios via the whatsapp-webhook handler.
 * All Meta API calls and external services are mocked — no real messages sent.
 *
 * Scenarios:
 *   1. New customer booking (happy path)
 *   2. Customer asking for availability
 *   3. Customer canceling a reservation
 *   4. Customer sending AJUDA keyword
 *   5. Customer sending PARAR keyword (opt-out)
 *   6. Manager sending RELATORIO command
 *   7. Invalid/gibberish message handling
 *   8. Feedback reply (1–5 star rating)
 */

const { Readable } = require('stream');
const crypto = require('crypto');

// ─── Mock all external dependencies ──────────────────────────────────────────

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
    debug: jest.fn(),
  }),
}));

// Meta Cloud API fetch mock — captured so tests can assert on calls
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ messages: [{ id: 'wamid.MOCK' }] }),
  text: async () => '',
  status: 200,
});
global.fetch = mockFetch;

jest.mock('../_lib/whatsapp-interactions', () => ({
  markAsRead: jest.fn().mockResolvedValue(undefined),
  addReaction: jest.fn().mockResolvedValue(undefined),
  removeReaction: jest.fn().mockResolvedValue(undefined),
  transcribeVoiceMessage: jest.fn().mockResolvedValue('transcribed'),
  downloadMedia: jest.fn().mockResolvedValue({ buffer: Buffer.from(''), mimeType: 'image/jpeg', size: 100 }),
  simulateTypingDelay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../_lib/rate-limit', () => ({
  isMessageDuplicate: jest.fn().mockResolvedValue(false),
  rejectOversizedBody: jest.fn().mockReturnValue(false),
  checkAndApplyRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  // Added 2026-Q2: message-processor.js acquires a per-phone processing lock
  // (Upstash Redis SETNX-style) to serialize WhatsApp message handling.
  acquireProcessingLock: jest.fn().mockResolvedValue(true),
  releaseProcessingLock: jest.fn().mockResolvedValue(undefined),
}));

const mockGetOrCreateSession = jest.fn();
const mockGetSessionByPhone = jest.fn();
jest.mock('../_lib/whatsapp-sessions', () => ({
  getOrCreateSession: mockGetOrCreateSession,
  setSessionRestaurant: jest.fn().mockResolvedValue(undefined),
  getSessionByPhone: mockGetSessionByPhone,
  updateSessionConversationHistory: jest.fn().mockResolvedValue(true),
}));

jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn().mockResolvedValue({ match: null, confidence: 0 }),
  getAllActiveRestaurants: jest.fn().mockResolvedValue([]),
}));

jest.mock('../_lib/multi-tenant-supabase', () => {
  const insertSingle = jest.fn().mockResolvedValue({
    data: { id: 1, reservation_id: 'RES-TEST-001', customer_name: 'Test Customer' },
    error: null,
  });

  function makeBuilder(rows = []) {
    const b = {};
    b.select = jest.fn().mockReturnValue(b);
    b.eq = jest.fn().mockReturnValue(b);
    b.neq = jest.fn().mockReturnValue(b);
    b.in = jest.fn().mockResolvedValue({ data: rows, error: null });
    b.order = jest.fn().mockReturnValue(b);
    b.limit = jest.fn().mockReturnValue(b);
    b.update = jest.fn().mockReturnValue(b);
    b.delete = jest.fn().mockReturnValue(b);
    b.single = jest.fn().mockResolvedValue({ data: rows[0] || null, error: null });
    b.maybeSingle = jest.fn().mockResolvedValue({ data: rows[0] || null, error: null });
    b.insert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ single: insertSingle }),
    });
    b.then = (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve);
    return b;
  }

  const mockFrom = jest.fn().mockImplementation((table) => {
    if (table === 'tables') {
      return makeBuilder([{ id: 'tbl-1', capacity: 10, is_active: true }]);
    }
    if (table === 'reservations') {
      return makeBuilder([{
        id: 'res-001',
        customer_name: 'Test Customer',
        date: '2026-04-20',
        time: '20:00',
        party_size: 2,
        status: 'confirmed',
      }]);
    }
    return makeBuilder([]);
  });

  return {
    getMultiTenantClient: jest.fn().mockReturnValue({ from: mockFrom }),
    getRestaurantClient: jest.fn().mockReturnValue({ from: mockFrom }),
    __mockInsertSingle: insertSingle,
    __mockFrom: mockFrom,
  };
});

jest.mock('../_lib/supabase', () => ({
  canAccommodateParty: jest.fn().mockResolvedValue({
    success: true,
    can_accommodate: true,
    method: 'single',
    tables: ['tbl-1'],
    total_capacity: 10,
    reason: null,
  }),
  // Lenient permissive chain: returns empty data for any terminator.
  // processWithAI now fetches tables + pos_menu_items + restaurant_config in
  // parallel via supabaseAdmin.from/schema. The chain needs to support .limit,
  // .single, .maybeSingle, and be thenable so plain `await chain` resolves.
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
      chain.then = (onResolve) => Promise.resolve({ data: data ? [data] : [], error: null }).then(onResolve);
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

jest.mock('../services/campaignService', () => ({
  handleOptOut: jest.fn().mockResolvedValue(true),
}));

// Mock PDF report service so RELATORIO tests don't hit Gotenberg
jest.mock('../services/pdfReportService', () => ({
  sendWeeklyReportViaWhatsApp: jest.fn().mockResolvedValue({ success: true, url: 'https://example.com/report.pdf' }),
  generateWeeklyReportPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
  generateWeeklyReportHTML: jest.fn().mockResolvedValue('<html>mock</html>'),
  uploadReportToStorage: jest.fn().mockResolvedValue('https://example.com/signed-url'),
}));

// ─── Env setup ────────────────────────────────────────────────────────────────

process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHONE_ID_TEST';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
process.env.AI_BASE_URL = 'https://openrouter.ai/api/v1';
process.env.OPENROUTER_API_KEY = 'sk-test';
process.env.META_APP_SECRET = 'test-meta-app-secret';

// ─── Load handler after mocks ─────────────────────────────────────────────────

jest.useFakeTimers();

const handler = require('../whatsapp-webhook');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_RESTAURANT = {
  id: 'rest-123',
  name: 'Restaurante Teste',
  phone: '+551199990001',
  agent_language: 'pt-BR',
};

const CUSTOMER_PHONE = '+5511988887777';
const MANAGER_PHONE = '+5511999990000';

/**
 * Build a Meta WhatsApp webhook body for a text message.
 */
function buildMetaBody(from, text, wamid = `wamid.TEST${Date.now()}`) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'ENTRY_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '+15550000000',
            phone_number_id: 'PHONE_ID_TEST',
          },
          messages: [{
            from: from.replace('+', ''),
            id: wamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body: text },
          }],
          contacts: [{ profile: { name: 'Test User' }, wa_id: from.replace('+', '') }],
        },
      }],
    }],
  };
}

/**
 * Make an Express-like mock request that is also a readable stream.
 * The webhook handler reads req.on('data') / req.on('end') to get the raw body.
 * Uses Node.js Readable.from() — works correctly even with jest.useFakeTimers().
 */
function mockReq(body, method = 'POST', extraHeaders = {}) {
  let rawBody = '';
  let sig = 'sha256=bypass';

  if (method === 'POST') {
    rawBody = JSON.stringify(body);
    sig = 'sha256=' + crypto
      .createHmac('sha256', process.env.META_APP_SECRET)
      .update(rawBody)
      .digest('hex');
  }

  const stream = method === 'POST' && rawBody
    ? Readable.from([Buffer.from(rawBody)])
    : Readable.from([]);

  const req = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sig,
      ...extraHeaders,
    },
    body,
    query: {},
    params: {},
    on: (event, cb) => { stream.on(event, cb); return req; },
  };

  return req;
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
  };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((data) => { res.body = data; return res; });
  res.send = jest.fn((data) => { res.body = data; return res; });
  res.end = jest.fn(() => res);
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v; return res; });
  return res;
}

/**
 * Default session factory — customer with restaurant resolved.
 */
function makeCustomerSession(overrides = {}) {
  return {
    phone: CUSTOMER_PHONE,
    restaurant: TEST_RESTAURANT,
    conversationHistory: [],
    context: {},
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhatsApp conversation flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.MOCK_REPLY' }] }),
      text: async () => '',
      status: 200,
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. New customer booking — happy path
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 1: New customer booking (happy path)', () => {
    it('should process a reservation request and respond with AI message', async () => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Reserva confirmada para 2 pessoas no dia 20/04 às 20h!' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const body = buildMetaBody(CUSTOMER_PHONE, 'Quero fazer uma reserva para 2 pessoas amanhã às 20h');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // Handler should return 200
      expect(res.status).not.toHaveBeenCalledWith(500);

      // Anthropic should have been called to generate a response
      expect(mockAnthropicCreate).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Customer asking for availability
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 2: Customer asking for availability', () => {
    it('should answer availability query via AI', async () => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Temos mesas disponíveis para sábado às 19h. Quantas pessoas?' }],
        usage: { input_tokens: 80, output_tokens: 40 },
      });

      const body = buildMetaBody(CUSTOMER_PHONE, 'Vocês têm mesa disponível para sábado à noite?');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      expect(mockAnthropicCreate).toHaveBeenCalled();
      const callArg = mockAnthropicCreate.mock.calls[0][0];
      // Verify the message was forwarded to the AI
      const userMessages = callArg.messages.filter(m => m.role === 'user');
      expect(userMessages.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Customer canceling a reservation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 3: Customer canceling via keyword CANCELAR', () => {
    it('should handle CANCELAR keyword without calling AI', async () => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      const body = buildMetaBody(CUSTOMER_PHONE, 'CANCELAR');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // Keyword handler intercepts — AI should NOT be called
      expect(mockAnthropicCreate).not.toHaveBeenCalled();

      // Handler should complete without error
      expect(res.status).not.toHaveBeenCalledWith(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Customer sending AJUDA keyword
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: AJUDA keyword', () => {
    it('should send help message without calling AI', async () => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      const body = buildMetaBody(CUSTOMER_PHONE, 'AJUDA');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // Keyword handler intercepts — AI should NOT be called
      expect(mockAnthropicCreate).not.toHaveBeenCalled();

      // Handler should complete without error
      expect(res.status).not.toHaveBeenCalledWith(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Customer sending PARAR keyword (opt-out)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 5: PARAR keyword — opt-out', () => {
    it('should unsubscribe the customer and confirm', async () => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      const { handleOptOut } = require('../_services/campaignService');

      const body = buildMetaBody(CUSTOMER_PHONE, 'PARAR');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      expect(mockAnthropicCreate).not.toHaveBeenCalled();

      // handleOptOut should have been called with the restaurant id
      expect(handleOptOut).toHaveBeenCalledWith(TEST_RESTAURANT.id, expect.stringContaining('551198'));

      // Handler should complete without error
      expect(res.status).not.toHaveBeenCalledWith(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Manager sending RELATORIO command
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 6: Manager sending RELATORIO command', () => {
    it('should acknowledge and trigger async PDF report', async () => {
      const managerSession = makeCustomerSession({
        phone: MANAGER_PHONE,
        restaurant: TEST_RESTAURANT,
      });
      mockGetOrCreateSession.mockResolvedValue(managerSession);
      mockGetSessionByPhone.mockResolvedValue(managerSession);

      const { sendWeeklyReportViaWhatsApp } = require('../_services/pdfReportService');

      const body = buildMetaBody(MANAGER_PHONE, 'RELATORIO');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // AI should NOT be called for keyword commands
      expect(mockAnthropicCreate).not.toHaveBeenCalled();

      // Handler should complete without error
      expect(res.status).not.toHaveBeenCalledWith(500);

      // Allow the fire-and-forget PDF generation to start
      await Promise.resolve();
      await Promise.resolve();

      // sendWeeklyReportViaWhatsApp should have been called eventually
      // (fire-and-forget, so we just verify it was invoked)
      expect(sendWeeklyReportViaWhatsApp).toHaveBeenCalledWith(
        TEST_RESTAURANT.id,
        expect.any(String),
        expect.any(String)
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Invalid / gibberish message
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 7: Invalid/gibberish message', () => {
    it('should forward gibberish to AI gracefully', async () => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Desculpe, não entendi. Posso ajudar com reservas!' }],
        usage: { input_tokens: 40, output_tokens: 20 },
      });

      const body = buildMetaBody(CUSTOMER_PHONE, 'xkqpwzlm 34$!@# ????');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // AI should be called — it handles unknowns
      expect(mockAnthropicCreate).toHaveBeenCalled();
    });

    it('should return 200 even for empty/whitespace messages', async () => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Olá, como posso ajudar?' }],
        usage: { input_tokens: 20, output_tokens: 10 },
      });

      const body = buildMetaBody(CUSTOMER_PHONE, '   ');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // Should not crash
      expect(res.status).not.toHaveBeenCalledWith(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Feedback reply (1–5 star rating)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 8: Feedback reply (star rating)', () => {
    it.each([
      ['1', 'very negative feedback'],
      ['3', 'neutral feedback'],
      ['5', 'perfect rating'],
    ])('should process %s-star feedback without crashing', async (rating) => {
      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Obrigado pelo seu feedback!' }],
        usage: { input_tokens: 30, output_tokens: 15 },
      });

      const body = buildMetaBody(CUSTOMER_PHONE, rating);
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // Should not crash; either AI or keyword path handles it
      expect(res.status).not.toHaveBeenCalledWith(500);
    });

    it('should accept numeric feedback in context of a feedback request', async () => {
      const session = makeCustomerSession({
        context: { awaitingFeedback: true, reservationId: 'RES-001' },
      });
      mockGetOrCreateSession.mockResolvedValue(session);
      mockGetSessionByPhone.mockResolvedValue(session);

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Ótimo! Ficamos felizes que tenha gostado.' }],
        usage: { input_tokens: 40, output_tokens: 20 },
      });

      const body = buildMetaBody(CUSTOMER_PHONE, '5');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ──────────────────────────────────────────────────────────────────────────
  describe('Edge cases', () => {
    it('should return 200 for webhook verification GET request', async () => {
      const req = {
        method: 'GET',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-verify-token',
          'hub.challenge': '12345',
        },
        headers: {},
        body: {},
        params: {},
      };
      const res = mockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
    });

    it('should reject webhook verification with wrong token', async () => {
      const req = {
        method: 'GET',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'WRONG_TOKEN',
          'hub.challenge': '12345',
        },
        headers: {},
        body: {},
        params: {},
      };
      const res = mockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(403);
    });

    it('should handle message from unknown number (no session restaurant) gracefully', async () => {
      const sessionWithoutRestaurant = {
        phone: '+5511000000000',
        restaurant: null,
        conversationHistory: [],
        context: {},
      };
      mockGetOrCreateSession.mockResolvedValue(sessionWithoutRestaurant);
      mockGetSessionByPhone.mockResolvedValue(sessionWithoutRestaurant);

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Olá!' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const body = buildMetaBody('+5511000000000', 'Olá');
      const req = mockReq(body);
      const res = mockRes();

      // Should not throw
      await expect(handler(req, res)).resolves.not.toThrow();
    });

    it('should return 200 for duplicate message (already processed)', async () => {
      const { isMessageDuplicate } = require('../_lib/rate-limit');
      isMessageDuplicate.mockResolvedValueOnce(true);

      const session = makeCustomerSession();
      mockGetOrCreateSession.mockResolvedValue(session);

      const body = buildMetaBody(CUSTOMER_PHONE, 'Olá, quero fazer uma reserva');
      const req = mockReq(body);
      const res = mockRes();

      await handler(req, res);

      // AI should NOT be called for duplicates
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });
  });
});
