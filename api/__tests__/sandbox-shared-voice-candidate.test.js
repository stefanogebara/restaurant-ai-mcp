'use strict';

// Real HTTP authentication and durable binding, with a small in-memory DB.
// A suggested canonical name must not authorize a later create tool invocation.
let mockBinding;
const mockInserted = jest.fn();
const mockFrom = jest.fn();
const mockRestaurant = {
  id: 'sandbox-restaurant', restaurant_name: 'Seatable CI Sandbox', city: 'São Paulo',
  is_demo: false, onboarding_completed: true,
  ai_config: { phone: { shared_routing_enabled: true } },
};

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args) => mockFrom(...args),
    schema: schema => {
      if (schema !== 'restaurant') throw new Error(`Unexpected schema: ${schema}`);
      return { from: table => {
        if (table !== 'restaurant_config') throw new Error(`Unexpected table: ${table}`);
        const q = {
          select: () => q, eq: () => q,
          limit: async () => ({ data: [mockRestaurant], error: null }),
        };
        return q;
      } };
    },
  },
}));
jest.mock('../_lib/restaurant-loader', () => ({
  getRestaurantById: jest.fn(async () => mockRestaurant),
  getRestaurantByPhone: jest.fn(), getRestaurantByAgentId: jest.fn(),
}));
jest.mock('../_lib/tool-handlers', () => ({
  createReservation: jest.fn(),
  checkAvailability: jest.fn(async () => ({ success: true, available: true })),
}));
jest.mock('../_lib/cors', () => ({ setWebhookCors: jest.fn(), handlePreflight: jest.fn(() => false) }));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn() }));
jest.mock('../_lib/whatsapp-sessions', () => ({ getSessionByPhone: jest.fn() }));
jest.mock('../_services/whatsapp/voice-note-trigger', () => ({ sendConfirmationVoiceNote: jest.fn() }));
jest.mock('../_lib/email', () => ({ sendReservationConfirmationEmail: jest.fn() }));
jest.mock('../_services/conversationLogger', () => {
  const logger = {
    startConversation: jest.fn(), logToolCall: jest.fn(), updateConversation: jest.fn(), endConversation: jest.fn(),
  };
  return { ...logger, forRestaurant: jest.fn(() => logger) };
});

const handler = require('../elevenlabs-webhook');
const tools = require('../_lib/tool-handlers');
const conversationLogger = require('../_services/conversationLogger');
const { trackUsage } = require('../_lib/usage-tracking');
const { sendConfirmationVoiceNote } = require('../_services/whatsapp/voice-note-trigger');
const { sendReservationConfirmationEmail } = require('../_lib/email');
const secret = 'sandbox-only-shared-tool-secret-123456789';
const headers = {
  authorization: `Bearer ${secret}`, 'x-agent-id': 'agent_sandbox',
  'x-conversation-id': 'conversation_sandbox',
  'x-called-number': '+15555550102', 'x-caller-number': '+15555550101',
};
const envKeys = ['ELEVENLABS_SHARED_TOOL_SECRET', 'ELEVENLABS_SHARED_AGENT_ID', 'ELEVENLABS_SHARED_PHONE', 'MULTI_TENANT_MODE'];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

beforeEach(() => {
  jest.clearAllMocks();
  mockBinding = null;
  process.env.ELEVENLABS_SHARED_TOOL_SECRET = secret;
  process.env.ELEVENLABS_SHARED_AGENT_ID = headers['x-agent-id'];
  process.env.ELEVENLABS_SHARED_PHONE = headers['x-called-number'];
  process.env.MULTI_TENANT_MODE = 'false';
  mockFrom.mockImplementation(table => {
    if (table !== 'agent_conversations') throw new Error(`Unexpected operational query: ${table}`);
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: mockBinding, error: null }),
      insert: async row => {
        mockInserted(row);
        mockBinding = { id: 'conversation-row', ...row };
        return { error: null };
      },
    };
    return q;
  });
});

afterAll(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

async function invoke(body) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
  await handler({ method: 'POST', headers: { ...headers }, query: {}, body: { ...body } }, res);
  return { status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] };
}

function expectNoBookingEffects() {
  expect(tools.createReservation).not.toHaveBeenCalled();
  expect(trackUsage).not.toHaveBeenCalled();
  expect(conversationLogger.updateConversation).not.toHaveBeenCalled();
  expect(sendConfirmationVoiceNote).not.toHaveBeenCalled();
  expect(sendReservationConfirmationEmail).not.toHaveBeenCalled();
}

test('a canonical suggestion cannot authorize create, even with its restaurant ID supplied by the model', async () => {
  const suggestion = await invoke({ action: 'identify_restaurant', restaurant_name: 'Seatable e CI Sandbox', city: 'São Paulo' });
  expect(suggestion).toMatchObject({ status: 200, body: {
    success: false, restaurant_identified: false, needs_confirmation: true,
    suggested_restaurant: { restaurant_name: mockRestaurant.restaurant_name, city: mockRestaurant.city },
  } });
  expect(suggestion.body).not.toHaveProperty('restaurant_id');

  const create = await invoke({
    action: 'create_reservation', restaurant_id: mockRestaurant.id,
    date: '2026-11-11', time: '19:00', party_size: 2, customer_name: 'Sandbox Guest',
  });
  expect(create).toEqual({ status: 409, body: { success: false, requires_restaurant_identification: true } });
  expect(mockBinding).toBeNull();
  expect(mockInserted).not.toHaveBeenCalled();
  expectNoBookingEffects();
});

test('confirming the official candidate binds identity; checking a slot still creates no reservation', async () => {
  await invoke({ action: 'identify_restaurant', restaurant_name: 'Seatable e CI Sandbox', city: 'São Paulo' });
  const identity = await invoke({ action: 'identify_restaurant', restaurant_name: mockRestaurant.restaurant_name, city: mockRestaurant.city });
  expect(identity).toMatchObject({ status: 200, body: { success: true, restaurant_identified: true, restaurant_id: mockRestaurant.id } });
  expect(mockInserted).toHaveBeenCalledTimes(1);
  expect(mockBinding).toMatchObject({ restaurant_info_id: mockRestaurant.id, caller_phone: headers['x-caller-number'] });
  expectNoBookingEffects();

  const availability = await invoke({ action: 'check_availability', date: '2026-11-11', time: '19:00', party_size: 2 });
  expect(availability).toMatchObject({ status: 200, body: { success: true, available: true } });
  expect(tools.checkAvailability).toHaveBeenCalledWith(mockRestaurant.id, expect.objectContaining({ id: mockRestaurant.id }), {
    date: '2026-11-11', time: '19:00', party_size: 2,
  });
  expect(mockInserted).toHaveBeenCalledTimes(1);
  expectNoBookingEffects();
});
