'use strict';

/**
 * Error-recovery path tests for WhatsApp webhook fixes:
 *   A. Session creation retry (message-processor.js)
 *   B. AI call retry (conversation.js)
 *   C. History-compression summary injection (conversation.js)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreate = jest.fn();
jest.mock('../_lib/ai-client', () => ({
  getAI: () => ({ messages: { create: mockCreate } }),
  AI_MODEL: 'anthropic/claude-3.5-sonnet',
  AI_MODEL_FAST: 'anthropic/claude-3-haiku',
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

const mockGetOrCreateSession = jest.fn();
const mockGetSessionByPhone   = jest.fn();
jest.mock('../_lib/whatsapp-sessions', () => ({
  getOrCreateSession:             mockGetOrCreateSession,
  setSessionRestaurant:           jest.fn().mockResolvedValue(undefined),
  getSessionByPhone:              mockGetSessionByPhone,
  updateSessionConversationHistory: jest.fn().mockResolvedValue(true),
}));

const mockAcquireLock = jest.fn().mockResolvedValue(true);
const mockReleaseLock = jest.fn().mockResolvedValue(undefined);
jest.mock('../_lib/rate-limit', () => ({
  isMessageDuplicate:     jest.fn().mockResolvedValue(false),
  rejectOversizedBody:    jest.fn().mockReturnValue(false),
  checkAndApplyRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  acquireProcessingLock:  (...args) => mockAcquireLock(...args),
  releaseProcessingLock:  (...args) => mockReleaseLock(...args),
}));

jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName:    jest.fn().mockResolvedValue({ match: null, confidence: 0 }),
  getAllActiveRestaurants: jest.fn().mockResolvedValue([]),
}));

// Os adapters REAIS devolvem o resultado do sender ({ success, messageId }) —
// MetaAdapter.sendMessage retorna sendWhatsAppMessage(...), TwilioAdapter
// retorna sendViaTwilio(...). Um mock que devolvia `undefined` fazia o
// processador classificar todo envio como FALHA e os testes passavam pelo ramo
// errado sem ninguém ver. Fixture tem que refletir o contrato real.
const mockSendMessage = jest.fn().mockResolvedValue({ success: true, messageId: 'wamid.TESTE' });
jest.mock('../_lib/whatsapp-sender', () => ({
  getWhatsAppProvider: jest.fn().mockReturnValue({
    sendMessage: mockSendMessage,
  }),
}));

jest.mock('../_lib/whatsapp-interactions', () => ({
  markAsRead:          jest.fn().mockResolvedValue(undefined),
  simulateTypingDelay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../_lib/supabase', () => ({
  canAccommodateParty: jest.fn().mockResolvedValue({ success: true, can_accommodate: true, tables: [], total_capacity: 0 }),
  // Lenient chain: processWithAI now fetches tables + pos_menu_items + config
  // in parallel; chain needs .limit, .order, and to be thenable.
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

jest.mock('../_lib/multi-tenant-supabase', () => ({
  getMultiTenantClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

jest.mock('../_lib/usage-tracking',    () => ({ trackUsage: jest.fn().mockResolvedValue(true) }));
jest.mock('../_lib/secure-id',         () => ({ generateSecureReservationId: jest.fn().mockReturnValue('RES-TEST') }));
jest.mock('../_services/memoryExtractor', () => ({ extractMemoriesFromWhatsApp: jest.fn().mockResolvedValue(null) }));
jest.mock('../_services/guestMemory',   () => ({ buildGuestContext: jest.fn().mockResolvedValue('') }));
jest.mock('../_services/campaignService', () => ({ handleOptOut: jest.fn().mockResolvedValue(true) }));
jest.mock('../_services/feedbackService', () => ({
  findPendingFeedbackForPhone: jest.fn().mockResolvedValue(null),
  processFeedbackReply:        jest.fn().mockResolvedValue(null),
}));
jest.mock('../_services/surveyReplyHandler', () => ({ handleSurveyReply: jest.fn().mockResolvedValue(null) }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { processMessage } = require('../_lib/channels/message-processor');
const { processWithAI, callChatCompletions } = require('../_services/whatsapp/conversation');

const RESTAURANT = {
  id: 'rest-abc',
  name: 'Test Restaurant',
  agent_language: 'pt-BR',
};

function makeAdapter() {
  return {
    providerName:  'meta',
    markAsRead:    jest.fn().mockResolvedValue(undefined),
    sendMessage:   jest.fn().mockResolvedValue({ success: true, messageId: 'wamid.TESTE' }),
    addReaction:   jest.fn().mockResolvedValue(undefined),
    removeReaction: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMsg(text = 'Quero fazer uma reserva') {
  return {
    from:       '+5511988887777',
    messageId:  `wamid.TEST${Date.now()}`,
    text,
    mediaContext:          null,
    interactiveSelection:  null,
    phoneNumberId:         'PHONE_ID_TEST',
  };
}

function makeSession(overrides = {}) {
  return {
    id:                  'sess-001',
    sender_phone:        '+5511988887777',
    restaurant:          RESTAURANT,
    restaurant_id:       RESTAURANT.id,
    conversationHistory: [],
    context:             {},
    ...overrides,
  };
}

function makeAnthropicResponse(text = 'Olá! Como posso ajudar?') {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 50, output_tokens: 20 },
  };
}

// ─── A. Session creation retry ────────────────────────────────────────────────

describe('A. Session creation retry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retries once on transient session failure and succeeds', async () => {
    const session = makeSession();
    mockGetOrCreateSession
      .mockRejectedValueOnce(new Error('Supabase transient error'))
      .mockResolvedValueOnce(session);
    mockGetSessionByPhone.mockResolvedValue(session);
    mockCreate.mockResolvedValue(makeAnthropicResponse());

    const adapter = makeAdapter();
    await processMessage(adapter, makeMsg());

    // Two attempts were made
    expect(mockGetOrCreateSession).toHaveBeenCalledTimes(2);
    // Error message NOT sent (retry succeeded)
    const errorCalls = adapter.sendMessage.mock.calls.filter(([, msg]) =>
      msg.includes('problema ao iniciar'));
    expect(errorCalls).toHaveLength(0);
  }, 10000);

  it('sends error message when session creation fails on both attempts', async () => {
    mockGetOrCreateSession.mockRejectedValue(new Error('DB timeout'));

    const adapter = makeAdapter();
    await processMessage(adapter, makeMsg());

    // Both attempts were made
    expect(mockGetOrCreateSession).toHaveBeenCalledTimes(2);
    // Error message was sent to the customer
    const errorCalls = adapter.sendMessage.mock.calls.filter(([, msg]) =>
      msg.includes('problema ao iniciar'));
    expect(errorCalls).toHaveLength(1);
  }, 10000);

  it('sends error message when session returns null on both attempts', async () => {
    mockGetOrCreateSession.mockResolvedValue(null);

    const adapter = makeAdapter();
    await processMessage(adapter, makeMsg());

    expect(mockGetOrCreateSession).toHaveBeenCalledTimes(2);
    const errorCalls = adapter.sendMessage.mock.calls.filter(([, msg]) =>
      msg.includes('problema ao iniciar'));
    expect(errorCalls).toHaveLength(1);
  }, 10000);
});

// ─── B. AI call retry ─────────────────────────────────────────────────────────

describe('B. AI call retry in processWithAI', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retries once on AI error and returns the successful response', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce(makeAnthropicResponse('Mesa confirmada para 2 pessoas!'));

    const session = makeSession();
    const result = await processWithAI('Quero reservar', session, []);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toBe('Mesa confirmada para 2 pessoas!');
  }, 10000);

  it('returns error message when AI fails on both attempts (non-production)', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    mockCreate.mockRejectedValue(new Error('503 Service Unavailable'));

    const session = makeSession();
    const result = await processWithAI('Quero reservar', session, []);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    // In non-production the debug message is returned (not the generic one)
    expect(result).toContain('503 Service Unavailable');
    process.env.NODE_ENV = original;
  }, 10000);

  it('returns production error message when AI fails on both attempts (production)', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    mockCreate.mockRejectedValue(new Error('503 Service Unavailable'));

    const session = makeSession();
    const result = await processWithAI('Quero reservar', session, []);

    expect(result).toContain('algo deu errado');
    process.env.NODE_ENV = original;
  }, 10000);
});

// ─── C. History compression summary injection ─────────────────────────────────

describe('C. History compression summary injected into system prompt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('injects history summary into system prompt when history is long', async () => {
    // Build 20 messages (> 15 threshold) to trigger compression
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i + 1}`,
    }));

    // First create call → used by compressOldHistory for the summary
    // Second create call → the actual conversation AI call
    mockCreate
      .mockResolvedValueOnce({
        // Summary response
        content: [{ type: 'text', text: 'Summary: customer discussed reservations.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 30 },
      })
      .mockResolvedValueOnce(makeAnthropicResponse('Claro, posso ajudar!'));

    const session = makeSession();
    const result = await processWithAI('Nova pergunta', session, longHistory);

    expect(result).toBe('Claro, posso ajudar!');

    // The second AI call (the real conversation) should have the summary in the system parameter
    const secondCall = mockCreate.mock.calls[1][0];
    expect(secondCall.system).toContain('Summary: customer discussed reservations.');
  }, 10000);
});
