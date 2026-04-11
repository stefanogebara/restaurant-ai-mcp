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

const handler = require('../whatsapp-settings');
const { verifyAuth } = require('../_lib/auth');
const { isWhatsAppConfigured, getWhatsAppProvider, sendWhatsAppMessage, sendTemplateMessage } = require('../_lib/whatsapp-sender');

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
    } finally {
      if (originalEnv.sid) process.env.TWILIO_ACCOUNT_SID = originalEnv.sid;
      else delete process.env.TWILIO_ACCOUNT_SID;
      if (originalEnv.token) process.env.TWILIO_AUTH_TOKEN = originalEnv.token;
      else delete process.env.TWILIO_AUTH_TOKEN;
      if (originalEnv.number) process.env.TWILIO_WHATSAPP_NUMBER = originalEnv.number;
      else delete process.env.TWILIO_WHATSAPP_NUMBER;
    }
  });

  test('Meta provider sends an approved template and returns 200', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { restaurant_name: 'Boteco do Samba' },
      error: null,
    });
    getWhatsAppProvider.mockResolvedValueOnce('meta');
    sendTemplateMessage.mockResolvedValueOnce({ success: true, messageId: 'wamid.TEST-TEMPLATE-1' });

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
      'en',
      ['there', 'Boteco do Samba']
    );
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('returns 400 when message send fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: { restaurant_name: 'Test' }, error: null });
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
