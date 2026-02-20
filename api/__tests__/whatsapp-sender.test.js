/**
 * Tests for api/_lib/whatsapp-sender.js
 * Shared WhatsApp messaging library
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockGetTemplate = jest.fn();
jest.mock('../_lib/whatsapp-templates', () => ({
  getTemplate: (...args) => mockGetTemplate(...args),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
});

// ============================================================
// isWhatsAppConfigured
// ============================================================
describe('isWhatsAppConfigured', () => {
  test('returns true when both env vars are set', () => {
    const { isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
    expect(isWhatsAppConfigured()).toBe(true);
  });

  test('returns false when WHATSAPP_PHONE_NUMBER_ID is missing', () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const { isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
    expect(isWhatsAppConfigured()).toBe(false);
  });

  test('returns false when WHATSAPP_ACCESS_TOKEN is missing', () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const { isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
    expect(isWhatsAppConfigured()).toBe(false);
  });

  test('returns false when both env vars are missing', () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const { isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
    expect(isWhatsAppConfigured()).toBe(false);
  });
});

// ============================================================
// sendWhatsAppMessage
// ============================================================
describe('sendWhatsAppMessage', () => {
  const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');

  test('returns error when not configured', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const result = await sendWhatsAppMessage('+5511999999999', 'Hello');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  test('sends message and returns messageId on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'msg-abc-123' }] }),
    });

    const result = await sendWhatsAppMessage('+5511999999999', 'Test message');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-abc-123');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('test-phone-id/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
      })
    );
  });

  test('sends correct payload structure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'msg-xyz' }] }),
    });

    await sendWhatsAppMessage('+5511999999999', 'Hello World');

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('+5511999999999');
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Hello World');
  });

  test('returns error when API responds non-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid phone number' } }),
    });

    const result = await sendWhatsAppMessage('+invalid', 'Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid phone number');
  });

  test('returns fallback error when API error has no message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await sendWhatsAppMessage('+5511999999999', 'Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to send');
  });

  test('returns error on network exception', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await sendWhatsAppMessage('+5511999999999', 'Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });
});

// ============================================================
// sendTemplateMessage
// ============================================================
describe('sendTemplateMessage', () => {
  const { sendTemplateMessage } = require('../_lib/whatsapp-sender');

  test('returns error when not configured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const result = await sendTemplateMessage('+5511999999999', 'reservation_confirmed', 'pt', []);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  test('sends template with correct payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'tmpl-msg-1' }] }),
    });

    const result = await sendTemplateMessage('+5511999999999', 'reservation_confirmed', 'pt', ['João', 'Boteco']);
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('tmpl-msg-1');

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('reservation_confirmed');
    expect(body.template.language.code).toBe('pt');
    expect(body.template.components[0].parameters).toHaveLength(2);
    expect(body.template.components[0].parameters[0]).toEqual({ type: 'text', text: 'João' });
  });

  test('sends template with no components when no parameters', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'tmpl-msg-2' }] }),
    });

    await sendTemplateMessage('+5511999999999', 'welcome', 'en', []);

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.template.components).toHaveLength(0);
  });

  test('casts parameters to string', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'tmpl-msg-3' }] }),
    });

    await sendTemplateMessage('+5511999999999', 'reservation_confirmed', 'en', [4, true]);

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.template.components[0].parameters[0].text).toBe('4');
    expect(body.template.components[0].parameters[1].text).toBe('true');
  });

  test('returns error on API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Template not found' } }),
    });

    const result = await sendTemplateMessage('+5511999999999', 'bad_template', 'en', []);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Template not found');
  });
});

// ============================================================
// sendReservationConfirmation
// ============================================================
describe('sendReservationConfirmation', () => {
  const { sendReservationConfirmation } = require('../_lib/whatsapp-sender');

  const BASE_DETAILS = {
    reservationId: 'RES-123',
    customerName: 'João',
    partySize: 4,
    date: '2026-03-15',
    time: '19:00',
    restaurantName: 'Boteco do Samba',
  };

  test('returns error when not configured', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const result = await sendReservationConfirmation('+5511999999999', BASE_DETAILS);
    expect(result.success).toBe(false);
  });

  test('returns error when template renders null', async () => {
    mockGetTemplate.mockReturnValueOnce(null);
    const result = await sendReservationConfirmation('+5511999999999', BASE_DETAILS);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/template/i);
  });

  test('sends confirmation with rendered template message', async () => {
    mockGetTemplate.mockReturnValueOnce('Oi João, sua reserva está confirmada!');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'conf-msg-1' }] }),
    });

    const result = await sendReservationConfirmation('+5511999999999', { ...BASE_DETAILS, language: 'pt' });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('conf-msg-1');
    expect(mockGetTemplate).toHaveBeenCalledWith('reservation_confirmed', 'pt', expect.objectContaining({
      name: 'João',
      restaurant: 'Boteco do Samba',
      reservationId: 'RES-123',
    }));

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.text.body).toBe('Oi João, sua reserva está confirmada!');
  });

  test('defaults to English when language not provided', async () => {
    mockGetTemplate.mockReturnValueOnce('Hi João, confirmed!');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'conf-msg-2' }] }),
    });

    await sendReservationConfirmation('+5511999999999', BASE_DETAILS);
    expect(mockGetTemplate).toHaveBeenCalledWith('reservation_confirmed', 'en', expect.any(Object));
  });

  test('passes all required vars to template', async () => {
    mockGetTemplate.mockReturnValueOnce('Confirmed!');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'x' }] }),
    });

    await sendReservationConfirmation('+5511999999999', BASE_DETAILS);
    expect(mockGetTemplate).toHaveBeenCalledWith('reservation_confirmed', 'en', {
      name: 'João',
      restaurant: 'Boteco do Samba',
      date: '2026-03-15',
      time: '19:00',
      partySize: 4,
      reservationId: 'RES-123',
    });
  });
});
