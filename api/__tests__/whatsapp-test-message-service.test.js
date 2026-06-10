'use strict';

const mockFrom = jest.fn();

const maybeSingleQueue = [];
const singleQueue = [];
const updateQueue = [];
const insertCalls = [];
const updateCalls = [];

function makeBuilder() {
  const builder = {
    __mode: 'select',
    select: jest.fn(() => {
      builder.__mode = 'select';
      return builder;
    }),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => maybeSingleQueue.shift() || { data: null, error: null }),
    insert: jest.fn((payload) => {
      insertCalls.push(payload);
      builder.__mode = 'insert';
      return builder;
    }),
    single: jest.fn(async () => singleQueue.shift() || { data: null, error: null }),
    update: jest.fn((payload) => {
      updateCalls.push(payload);
      builder.__mode = 'update';
      return builder;
    }),
    then: (resolve, reject) => {
      const value = builder.__mode === 'update'
        ? (updateQueue.shift() || { data: null, error: null })
        : { data: null, error: null };
      return Promise.resolve(value).then(resolve, reject);
    },
  };

  return builder;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args) => mockFrom(...args),
  },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const {
  normalizeWhatsAppTestPhone,
  getWhatsAppTestMessageCooldownMs,
  serializeWhatsAppTestMessage,
  getRecentDuplicateWhatsAppTestMessage,
  createWhatsAppTestMessage,
  updateWhatsAppTestMessageStatus,
} = require('../_services/whatsappTestMessageService');

beforeEach(() => {
  maybeSingleQueue.length = 0;
  singleQueue.length = 0;
  updateQueue.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  mockFrom.mockImplementation(() => makeBuilder());
});

describe('whatsappTestMessageService', () => {
  test('normalizes WhatsApp test phone numbers to E.164-like format', () => {
    expect(normalizeWhatsAppTestPhone('+55 (11) 99999-9999')).toBe('+5511999999999');
    expect(normalizeWhatsAppTestPhone('')).toBe('');
  });

  test('returns a cooldown-active duplicate record when the last send is recent', async () => {
    maybeSingleQueue.push({
      data: {
        id: 'test-log-1',
        recipient_phone: '+5511999999999',
        status: 'accepted',
        requested_at: new Date(Date.now() - 30 * 1000).toISOString(),
      },
      error: null,
    });

    const duplicate = await getRecentDuplicateWhatsAppTestMessage('rest-1', '+55 (11) 99999-9999');

    expect(duplicate).toEqual(expect.objectContaining({
      id: 'test-log-1',
      recipient_phone: '+5511999999999',
    }));
  });

  test('persists a WhatsApp test send with normalized phone data', async () => {
    singleQueue.push({
      data: {
        id: 'test-log-2',
        provider: 'meta',
        recipient_phone: '+5511999999999',
        whatsapp_message_id: 'wamid.TEST-1',
        status: 'accepted',
      },
      error: null,
    });

    const created = await createWhatsAppTestMessage({
      restaurantId: 'rest-1',
      provider: 'meta',
      recipientPhone: '+55 (11) 99999-9999',
      templateName: 'seatable_feedback_request',
      templateLanguage: 'en_US',
      whatsappMessageId: 'wamid.TEST-1',
    });

    expect(created).toEqual(expect.objectContaining({
      id: 'test-log-2',
      whatsapp_message_id: 'wamid.TEST-1',
    }));
    expect(insertCalls[0]).toEqual(expect.objectContaining({
      restaurant_id: 'rest-1',
      recipient_phone: '+5511999999999',
      template_name: 'seatable_feedback_request',
      template_language: 'en_US',
      whatsapp_message_id: 'wamid.TEST-1',
    }));
  });

  test('updates a delivered test message from webhook status payloads', async () => {
    maybeSingleQueue.push({
      data: {
        id: 'test-log-3',
        status: 'accepted',
        requested_at: '2026-04-11T18:02:46.000Z',
      },
      error: null,
    });
    updateQueue.push({ data: null, error: null });

    const updated = await updateWhatsAppTestMessageStatus('wamid.TEST-2', {
      id: 'wamid.TEST-2',
      status: 'delivered',
    });

    expect(updated).toBe(true);
    expect(updateCalls[0]).toEqual(expect.objectContaining({
      status: 'delivered',
    }));
    expect(updateCalls[0].delivered_at).toBeTruthy();
  });

  test('serializes cooldown metadata for the dashboard', () => {
    const serialized = serializeWhatsAppTestMessage({
      id: 'test-log-4',
      recipient_phone: '+5511999999999',
      status: 'accepted',
      requested_at: new Date(Date.now() - 15 * 1000).toISOString(),
    });

    expect(serialized.cooldown_active).toBe(true);
    expect(serialized.cooldown_remaining_ms).toBeGreaterThan(0);
    expect(serialized.cooldown_expires_at).toBeTruthy();
  });

  test('clears cooldown for failed sends', () => {
    const remaining = getWhatsAppTestMessageCooldownMs({
      status: 'failed',
      requested_at: new Date().toISOString(),
    });

    expect(remaining).toBe(0);
  });
});
