/**
 * Tests for api/whatsapp-settings.js
 * Authenticated WhatsApp settings management API
 */

// --- Mock chain builder ---
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockGte = jest.fn();
const mockGt = jest.fn();
const mockSingle = jest.fn();
const mockUpdate = jest.fn();
const mockFrom = jest.fn();
const mockSchema = jest.fn();

// Default count result (resolves immediately for .select with {count, head})
const DEFAULT_COUNT = { count: 0, data: [], error: null };

function mockChain() {
  const chain = new Proxy({}, {
    get(target, prop) {
      if (prop === 'select') return (...args) => { mockSelect(...args); return chain; };
      if (prop === 'eq') return (...args) => { mockEq(...args); return chain; };
      if (prop === 'gte') return (...args) => { mockGte(...args); return chain; };
      if (prop === 'gt') return (...args) => { mockGt(...args); return chain; };
      if (prop === 'single') return () => mockSingle();
      if (prop === 'update') return (...args) => { mockUpdate(...args); return chain; };
      // Support promise-based resolution for count queries
      if (prop === 'then') return (resolve) => resolve(DEFAULT_COUNT);
      return () => chain;
    },
  });
  return chain;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args) => { mockFrom(...args); return mockChain(); },
    schema: (...args) => {
      mockSchema(...args);
      return { from: (...a) => { mockFrom(...a); return mockChain(); } };
    },
  },
}));

jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/whatsapp-sender', () => ({
  isWhatsAppConfigured: jest.fn(),
  getWhatsAppProvider: jest.fn(),
  sendWhatsAppMessage: jest.fn(),
  sendTemplateMessage: jest.fn(),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../services/whatsappTestMessageService', () => ({
  normalizeWhatsAppTestPhone: jest.fn((phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }),
  serializeWhatsAppTestMessage: jest.fn((message) => message ? ({
    ...message,
    cooldown_remaining_ms: message.cooldown_remaining_ms ?? 0,
    cooldown_active: (message.cooldown_remaining_ms ?? 0) > 0,
    cooldown_expires_at: message.cooldown_expires_at ?? null,
  }) : null),
  getLatestWhatsAppTestMessage: jest.fn(),
  getRecentDuplicateWhatsAppTestMessage: jest.fn(),
  createWhatsAppTestMessage: jest.fn(),
}));

const handler = require('../whatsapp-settings');
const { verifyAuth } = require('../_lib/auth');
const { isWhatsAppConfigured, getWhatsAppProvider, sendWhatsAppMessage, sendTemplateMessage } = require('../_lib/whatsapp-sender');
const {
  getLatestWhatsAppTestMessage,
  getRecentDuplicateWhatsAppTestMessage,
  createWhatsAppTestMessage,
} = require('../_services/whatsappTestMessageService');

function mkReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
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

const AUTH_USER = { user: { restaurant_id: 'rest-uuid-1', email: 'owner@test.com' } };

beforeEach(() => {
  jest.clearAllMocks();
  verifyAuth.mockResolvedValue(AUTH_USER);
  isWhatsAppConfigured.mockReturnValue(true);
  getWhatsAppProvider.mockResolvedValue('meta');
  getLatestWhatsAppTestMessage.mockResolvedValue(null);
  getRecentDuplicateWhatsAppTestMessage.mockResolvedValue(null);
  createWhatsAppTestMessage.mockResolvedValue(null);
});

// ============================================================
// Auth & CORS
// ============================================================
describe('WhatsApp Settings: Auth', () => {
  test('OPTIONS returns 200', async () => {
    const { req, res } = mkReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValue({ error: 'Authentication required', status: 401 });
    const { req, res } = mkReqRes({ query: { action: 'status' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('returns 400 when user has no restaurant_id', async () => {
    verifyAuth.mockResolvedValue({ user: { email: 'orphan@test.com' } });
    const { req, res } = mkReqRes({ query: { action: 'status' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid action', async () => {
    const { req, res } = mkReqRes({ query: { action: 'unknown' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ============================================================
// action=status
// ============================================================
describe('WhatsApp Settings: status', () => {
  test('returns status with WhatsApp enabled and wa_me link', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        whatsapp_enabled: true,
        whatsapp_phone_number: '+5511999999999',
        restaurant_name: 'Boteco do Samba',
      },
      error: null,
    });

    const { req, res } = mkReqRes({ query: { action: 'status' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.data.enabled).toBe(true);
    expect(json.data.phone_number).toBe('+5511999999999');
    expect(json.data.restaurant_name).toBe('Boteco do Samba');
    expect(json.data.api_configured).toBe(true);
  });

  test('returns status with WhatsApp disabled', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: false, whatsapp_phone_number: null, restaurant_name: 'Test' },
      error: null,
    });

    const { req, res } = mkReqRes({ query: { action: 'status' } });
    await handler(req, res);

    const json = res.json.mock.calls[0][0];
    expect(json.data.enabled).toBe(false);
  });

  test('returns 404 when restaurant config not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = mkReqRes({ query: { action: 'status' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('reports api_configured=false when env vars missing', async () => {
    isWhatsAppConfigured.mockReturnValue(false);
    mockSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: false, whatsapp_phone_number: null, restaurant_name: 'Test' },
      error: null,
    });

    const { req, res } = mkReqRes({ query: { action: 'status' } });
    await handler(req, res);

    const json = res.json.mock.calls[0][0];
    expect(json.data.api_configured).toBe(false);
  });
});

// ============================================================
// action=update
// ============================================================
describe('WhatsApp Settings: update', () => {
  test('returns 405 for non-PATCH method', async () => {
    const { req, res } = mkReqRes({ method: 'GET', query: { action: 'update' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 400 with no fields to update', async () => {
    const { req, res } = mkReqRes({ method: 'PATCH', query: { action: 'update' }, body: {} });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('updates enabled flag', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: true, whatsapp_phone_number: null },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'PATCH',
      query: { action: 'update' },
      body: { enabled: true },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.data.enabled).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ whatsapp_enabled: true }));
  });

  test('updates phone number', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: false, whatsapp_phone_number: '+5511999999999' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'PATCH',
      query: { action: 'update' },
      body: { phone_number: '+5511999999999' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ whatsapp_phone_number: '+5511999999999' }));
  });

  test('returns 400 for phone number that is too short', async () => {
    const { req, res } = mkReqRes({
      method: 'PATCH',
      query: { action: 'update' },
      body: { phone_number: '123' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('updates both enabled and phone together', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { whatsapp_enabled: true, whatsapp_phone_number: '+5511999999999' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'PATCH',
      query: { action: 'update' },
      body: { enabled: true, phone_number: '+5511999999999' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      whatsapp_enabled: true,
      whatsapp_phone_number: '+5511999999999',
    }));
  });
});

// ============================================================
// action=test
// ============================================================
describe('WhatsApp Settings: test message', () => {
  test('returns 405 for non-POST method', async () => {
    const { req, res } = mkReqRes({ method: 'GET', query: { action: 'test' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 400 when phone_number missing', async () => {
    const { req, res } = mkReqRes({ method: 'POST', query: { action: 'test' }, body: {} });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('returns 400 when API not configured', async () => {
    isWhatsAppConfigured.mockReturnValue(false);
    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'test' },
      body: { phone_number: '+5511999999999' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('returns 400 when Twilio provider is selected but Twilio WhatsApp env is missing', async () => {
    const originalEnv = {
      sid: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      number: process.env.TWILIO_WHATSAPP_NUMBER,
    };

    try {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_WHATSAPP_NUMBER;
      getWhatsAppProvider.mockResolvedValueOnce('twilio');

      const { req, res } = mkReqRes({
        method: 'POST',
        query: { action: 'test' },
        body: { phone_number: '+5511999999999' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Twilio WhatsApp not configured')
      }));
    } finally {
      if (originalEnv.sid) process.env.TWILIO_ACCOUNT_SID = originalEnv.sid;
      else delete process.env.TWILIO_ACCOUNT_SID;
      if (originalEnv.token) process.env.TWILIO_AUTH_TOKEN = originalEnv.token;
      else delete process.env.TWILIO_AUTH_TOKEN;
      if (originalEnv.number) process.env.TWILIO_WHATSAPP_NUMBER = originalEnv.number;
      else delete process.env.TWILIO_WHATSAPP_NUMBER;
    }
  });

  test('sends test message and returns 200', async () => {
    const originalEnv = {
      sid: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      number: process.env.TWILIO_WHATSAPP_NUMBER,
    };

    try {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_WHATSAPP_NUMBER = '+15551234567';
      mockSingle.mockResolvedValueOnce({
        data: { restaurant_name: 'Boteco do Samba' },
        error: null,
      });
      getWhatsAppProvider.mockResolvedValueOnce('twilio');
      sendWhatsAppMessage.mockResolvedValueOnce({ success: true, messageId: 'test-msg-1' });
      createWhatsAppTestMessage.mockResolvedValueOnce({
        id: 'test-log-1',
        provider: 'twilio',
        recipient_phone: '+5511999999999',
        whatsapp_message_id: 'test-msg-1',
        status: 'accepted',
      });

      const { req, res } = mkReqRes({
        method: 'POST',
        query: { action: 'test' },
        body: { phone_number: '+5511999999999' },
      });
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.success).toBe(true);
      expect(json.messageId).toBe('test-msg-1');

      expect(sendWhatsAppMessage).toHaveBeenCalledWith(
        '+5511999999999',
        expect.stringContaining('Boteco do Samba'),
        { provider: 'twilio' }
      );
      expect(createWhatsAppTestMessage).toHaveBeenCalledWith(expect.objectContaining({
        restaurantId: 'rest-uuid-1',
        provider: 'twilio',
        recipientPhone: '+5511999999999',
        whatsappMessageId: 'test-msg-1',
      }));
    } finally {
      if (originalEnv.sid) process.env.TWILIO_ACCOUNT_SID = originalEnv.sid;
      else delete process.env.TWILIO_ACCOUNT_SID;
      if (originalEnv.token) process.env.TWILIO_AUTH_TOKEN = originalEnv.token;
      else delete process.env.TWILIO_AUTH_TOKEN;
      if (originalEnv.number) process.env.TWILIO_WHATSAPP_NUMBER = originalEnv.number;
      else delete process.env.TWILIO_WHATSAPP_NUMBER;
    }
  });

  test('Meta provider uses approved template language from WABA metadata', async () => {
    const originalEnv = {
      wabaId: process.env.WHATSAPP_WABA_ID,
      token: process.env.WHATSAPP_ACCESS_TOKEN,
    };
    const originalFetch = global.fetch;

    try {
      process.env.WHATSAPP_WABA_ID = 'waba-test';
      process.env.WHATSAPP_ACCESS_TOKEN = 'meta-test-token';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { name: 'seatable_feedback_request', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR' },
            { name: 'seatable_promotion', status: 'APPROVED', category: 'MARKETING', language: 'en' },
          ]
        }),
      });

      mockSingle.mockResolvedValueOnce({
        data: { restaurant_name: 'Boteco do Samba', language: 'en' },
        error: null,
      });
      getWhatsAppProvider.mockResolvedValueOnce('meta');
      sendTemplateMessage.mockResolvedValueOnce({ success: true, messageId: 'wamid.TEST-TEMPLATE-1' });
      createWhatsAppTestMessage.mockResolvedValueOnce({
        id: 'test-log-meta',
        provider: 'meta',
        recipient_phone: '+5511999999999',
        whatsapp_message_id: 'wamid.TEST-TEMPLATE-1',
        status: 'accepted',
      });

      const { req, res } = mkReqRes({
        method: 'POST',
        query: { action: 'test' },
        body: { phone_number: '+5511999999999' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendTemplateMessage).toHaveBeenCalledWith(
        '+5511999999999',
        'seatable_feedback_request',
        'pt_BR',
        ['there', 'Boteco do Samba']
      );
      expect(sendWhatsAppMessage).not.toHaveBeenCalled();
      expect(createWhatsAppTestMessage).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'meta',
        templateName: 'seatable_feedback_request',
        templateLanguage: 'pt_BR',
      }));
    } finally {
      if (originalEnv.wabaId) process.env.WHATSAPP_WABA_ID = originalEnv.wabaId;
      else delete process.env.WHATSAPP_WABA_ID;
      if (originalEnv.token) process.env.WHATSAPP_ACCESS_TOKEN = originalEnv.token;
      else delete process.env.WHATSAPP_ACCESS_TOKEN;
      global.fetch = originalFetch;
    }
  });

  test('Meta provider falls back across template languages when metadata is unavailable', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { restaurant_name: 'Boteco do Samba', language: 'en' },
      error: null,
    });
    getWhatsAppProvider.mockResolvedValueOnce('meta');
    sendTemplateMessage
      .mockResolvedValueOnce({ success: false, error: '(#132001) Template name does not exist in the translation' })
      .mockResolvedValueOnce({ success: false, error: '(#132001) Template name does not exist in the translation' })
      .mockResolvedValueOnce({ success: true, messageId: 'wamid.TEST-TEMPLATE-1' });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'test' },
      body: { phone_number: '+5511999999999' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(sendTemplateMessage).toHaveBeenNthCalledWith(
      1,
      '+5511999999999',
      'seatable_feedback_request',
      'en',
      ['there', 'Boteco do Samba']
    );
    expect(sendTemplateMessage).toHaveBeenNthCalledWith(
      2,
      '+5511999999999',
      'seatable_feedback_request',
      'en_US',
      ['there', 'Boteco do Samba']
    );
    expect(sendTemplateMessage).toHaveBeenNthCalledWith(
      3,
      '+5511999999999',
      'seatable_feedback_request',
      'pt_BR',
      ['there', 'Boteco do Samba']
    );
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('returns 400 when message send fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: { restaurant_name: 'Test', language: 'en' }, error: null });
    sendTemplateMessage.mockResolvedValueOnce({ success: false, error: 'Invalid number' });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'test' },
      body: { phone_number: '+5511999999999' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid number' }));
  });

  test('returns 429 when the same test number is still in cooldown', async () => {
    getRecentDuplicateWhatsAppTestMessage.mockResolvedValueOnce({
      id: 'test-log-dup',
      recipient_phone: '+5511999999999',
      status: 'accepted',
      cooldown_remaining_ms: 61000,
      cooldown_expires_at: '2026-04-11T18:03:46.000Z',
    });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'test' },
      body: { phone_number: '+55 (11) 99999-9999' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'TEST_MESSAGE_COOLDOWN',
      cooldown_remaining_ms: 61000,
    }));
  });
});

// ============================================================
// action=test_status
// ============================================================
describe('WhatsApp Settings: test status', () => {
  test('returns latest WhatsApp test delivery status', async () => {
    getLatestWhatsAppTestMessage.mockResolvedValueOnce({
      id: 'test-log-latest',
      provider: 'meta',
      recipient_phone: '+5511999999999',
      status: 'delivered',
      delivered_at: '2026-04-11T18:04:00.000Z',
      requested_at: '2026-04-11T18:02:46.000Z',
      status_updated_at: '2026-04-11T18:04:00.000Z',
    });

    const { req, res } = mkReqRes({ query: { action: 'test_status' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        id: 'test-log-latest',
        status: 'delivered',
      }),
    }));
  });

  test('returns 405 for non-GET test_status requests', async () => {
    const { req, res } = mkReqRes({ method: 'POST', query: { action: 'test_status' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ============================================================
// action=stats
// ============================================================
describe('WhatsApp Settings: stats', () => {
  test('returns session and message counts', async () => {
    const { req, res } = mkReqRes({ query: { action: 'stats' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('active_sessions');
    expect(json.data).toHaveProperty('total_sessions');
    expect(json.data).toHaveProperty('messages_this_month');
    expect(typeof json.data.active_sessions).toBe('number');
    expect(typeof json.data.messages_this_month).toBe('number');
  });
});

// ============================================================
// Top-level catch block (lines 65-67)
// ============================================================
describe('WhatsApp Settings: top-level error catch', () => {
  test('returns 500 when sub-handler throws (lines 65-67)', async () => {
    // Make the .single() call throw to cause handleStatus to reject
    mockSingle.mockImplementationOnce(() => { throw new Error('DB connection lost'); });

    const { req, res } = mkReqRes({ query: { action: 'status' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Something went wrong. Please try again.',
    }));
  });
});

// ============================================================
// handleUpdate DB error (lines 186-187)
// ============================================================
describe('WhatsApp Settings: handleUpdate DB error', () => {
  test('returns 500 when DB update fails (lines 186-187)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'Update constraint violation' },
    });

    const { req, res } = mkReqRes({
      method: 'PATCH',
      query: { action: 'update' },
      body: { enabled: true },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Failed to update settings',
    }));
  });
});
