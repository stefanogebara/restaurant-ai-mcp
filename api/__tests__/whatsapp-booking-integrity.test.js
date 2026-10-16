'use strict';

const mockRpc = jest.fn();
const mockButtons = jest.fn().mockResolvedValue({ success: true });
const mockEmail = jest.fn().mockResolvedValue(true);
const mockUsage = jest.fn().mockResolvedValue(true);
const mockCreate = jest.fn();

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    rpc: (...args) => mockRpc(...args),
    from: () => ({ select: () => {
      const chain = {
        eq: () => chain,
        limit: async () => ({ data: [] }),
        then: resolve => Promise.resolve({ data: [] }).then(resolve),
      };
      return chain;
    } }),
    schema: () => ({ from: () => ({
      select: () => ({ eq: () => ({
        single: async () => ({ data: null }),
        maybeSingle: async () => ({ data: null }),
      }) }),
    }) }),
  },
  canAccommodateParty: jest.fn(),
}));
jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn(), getAllActiveRestaurants: jest.fn(),
}));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: (...args) => mockUsage(...args) }));
jest.mock('../_lib/secure-id', () => ({ generateSecureReservationId: jest.fn().mockReturnValue('RES-PROPOSED') }));
jest.mock('../_lib/whatsapp-sessions', () => ({ setSessionRestaurant: jest.fn() }));
jest.mock('../_services/whatsapp/message-sender', () => ({
  sendTemplateMessage: jest.fn(),
  sendInteractiveButtonMessage: (...args) => mockButtons(...args),
}));
jest.mock('../_lib/email', () => ({ sendReservationConfirmationEmail: (...args) => mockEmail(...args) }));
jest.mock('../_lib/ai-client', () => ({
  getAI: () => ({ messages: { create: (...args) => mockCreate(...args) } }),
  AI_MODEL: 'test-model', AI_MODEL_FAST: 'test-fast-model',
}));
jest.mock('../_services/guestMemory', () => ({ buildGuestContext: jest.fn().mockResolvedValue('') }));
jest.mock('../_services/whatsapp/waitlist-handler', () => ({
  addCustomerToQueue: jest.fn(), checkQueuePosition: jest.fn(),
}));

const { executeTool } = require('../_services/whatsapp/reservation-tools');
const { bookingExternalId } = require('../_services/whatsapp/booking-intent');
const { processWithAI } = require('../_services/whatsapp/conversation');

const session = {
  sender_phone: '5511999999999',
  restaurant: { id: '11111111-1111-1111-1111-111111111111', restaurant_name: 'Seatable Test', language: 'pt-BR' },
};
const context = { providerName: 'meta', receiver: '123456789012345', messageId: 'wamid.ABC' };
const input = {
  date: '2099-01-01', time: '19:00', party_size: 3,
  customer_name: 'Alice', customer_email: 'alice@example.test', customer_phone: 'ATTACKER-PHONE',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockReset();
  mockCreate.mockReset();
  mockRpc.mockResolvedValue({ data: { status: 'created', reservation_id: 'RES-REAL' }, error: null });
});

test('stable hashed intent changes only with inbound identity, not model-generated details', () => {
  const id = bookingExternalId(context, session.restaurant.id);
  expect(id).toMatch(/^wa:v1:[a-f0-9]{64}$/);
  expect(id).toBe(bookingExternalId({ ...context }, session.restaurant.id));
  expect(id).not.toBe(bookingExternalId({ ...context, messageId: 'wamid.DEF' }, session.restaurant.id));
  expect(id).not.toBe(bookingExternalId({ ...context, receiver: 'OTHER-NUMBER' }, session.restaurant.id));
  expect(id).not.toContain('Alice');
  expect(bookingExternalId({}, session.restaurant.id)).toBeNull();
});

test('new booking uses tenant and sender from session, never the model-provided phone', async () => {
  const result = await executeTool('create_reservation', input, session, context);
  expect(result.success).toBe(true);
  expect(result.reservation.id).toBe('RES-REAL');
  expect(result.confirmation_submission).toBe('accepted');
  expect(mockRpc).toHaveBeenCalledWith('book_whatsapp_reservation', expect.objectContaining({
    p_restaurant_id: session.restaurant.id,
    p_customer_phone: session.sender_phone,
    p_external_id: expect.stringMatching(/^wa:v1:[a-f0-9]{64}$/),
  }));
  expect(mockUsage).toHaveBeenCalledTimes(1);
  expect(mockEmail).toHaveBeenCalledTimes(1);
  expect(mockButtons).toHaveBeenCalledTimes(1);
  expect(mockButtons.mock.calls[0][3]).toEqual({ phoneNumberId: context.receiver });
});

test('a Meta send refusal is reported without pretending the committed booking failed', async () => {
  mockButtons.mockResolvedValueOnce({ success: false, error: 'Meta rejected recipient' });
  const result = await executeTool('create_reservation', input, session, context);
  expect(result).toMatchObject({ success: true, confirmation_submission: 'failed' });
  expect(result.reservation.id).toBe('RES-REAL');
  expect(mockUsage).toHaveBeenCalledTimes(1);
});

test('a thrown notification or metering error never converts a committed booking to failure', async () => {
  mockUsage.mockRejectedValueOnce(new Error('meter offline'));
  mockButtons.mockRejectedValueOnce(new Error('Meta timeout'));
  const result = await executeTool('create_reservation', input, session, context);
  expect(result).toMatchObject({ success: true, confirmation_submission: 'failed' });
  expect(result.reservation.id).toBe('RES-REAL');
});

test('a Twilio booking never sends confirmation from the Meta number', async () => {
  const result = await executeTool('create_reservation', input, session, {
    ...context, providerName: 'twilio', receiver: '+15551234567',
  });
  expect(result).toMatchObject({ success: true, confirmation_submission: 'channel_reply' });
  expect(mockButtons).not.toHaveBeenCalled();
});

test.each([
  { providerName: 'meta', receiver: '' },
  { providerName: 'meta', receiver: 'restaurant-uuid-fallback' },
  { providerName: 'twilio', receiver: '123456789012345' },
])('invalid $providerName receiver refuses the booking before commit', async invalid => {
  const result = await executeTool('create_reservation', input, session, {
    ...context, ...invalid,
  });
  expect(result.success).toBe(false);
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockButtons).not.toHaveBeenCalled();
});

test('does not return before metering and Meta confirmation settle', async () => {
  let finishUsage;
  let finishButtons;
  mockUsage.mockImplementationOnce(() => new Promise(resolve => { finishUsage = resolve; }));
  mockButtons.mockImplementationOnce(() => new Promise(resolve => { finishButtons = resolve; }));
  let settled = false;
  const booking = executeTool('create_reservation', input, session, context)
    .then(result => { settled = true; return result; });
  for (let i = 0; i < 20 && !finishUsage; i++) await new Promise(setImmediate);
  expect(typeof finishUsage).toBe('function');
  expect(settled).toBe(false);
  finishUsage();
  for (let i = 0; i < 20 && !finishButtons; i++) await new Promise(setImmediate);
  expect(typeof finishButtons).toBe('function');
  expect(settled).toBe(false);
  finishButtons({ success: true });
  expect(await booking).toMatchObject({ success: true, confirmation_submission: 'accepted' });
});

test('model retry sees committed booking without duplicate billing or outbound confirmation', async () => {
  mockRpc
    .mockResolvedValueOnce({ data: { status: 'created', reservation_id: 'RES-REAL' }, error: null })
    .mockResolvedValueOnce({ data: {
      status: 'existing', reservation_id: 'RES-REAL',
      date: '2099-01-01', time: '19:00', party_size: 3, customer_name: 'Alice',
    }, error: null });

  const first = await executeTool('create_reservation', input, session, context);
  const retry = await executeTool('create_reservation', input, session, context);
  expect(first.reservation.id).toBe(retry.reservation.id);
  expect(mockRpc.mock.calls[0][1].p_external_id).toBe(mockRpc.mock.calls[1][1].p_external_id);
  expect(mockUsage).toHaveBeenCalledTimes(1);
  expect(mockEmail).toHaveBeenCalledTimes(1);
  expect(mockButtons).toHaveBeenCalledTimes(1);
});

test('conversation retry after model failure reuses the committed reservation', async () => {
  mockRpc
    .mockResolvedValueOnce({ data: { status: 'created', reservation_id: 'RES-REAL' }, error: null })
    .mockResolvedValueOnce({ data: {
      status: 'existing', reservation_id: 'RES-REAL',
      date: '2099-01-01', time: '19:00', party_size: 3, customer_name: 'Alice',
    }, error: null });
  const toolTurn = {
    content: [{ type: 'tool_use', id: 'tool-call', name: 'create_reservation', input }],
    stop_reason: 'tool_use',
  };
  mockCreate
    .mockResolvedValueOnce(toolTurn)
    .mockRejectedValueOnce(new Error('model unavailable after commit'))
    .mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tool-call-2', name: 'create_reservation', input: { ...input, time: '20:00' } }],
      stop_reason: 'tool_use',
    })
    .mockResolvedValueOnce({ content: [{ type: 'text', text: 'A reserva está confirmada.' }], stop_reason: 'end_turn' });

  const reply = await processWithAI('Confirme para Alice', session, [], context);
  expect(reply).toBe('A reserva está confirmada.');
  expect(mockRpc).toHaveBeenCalledTimes(2);
  expect(mockRpc.mock.calls[0][1].p_external_id).toBe(mockRpc.mock.calls[1][1].p_external_id);
  expect(mockRpc.mock.calls[0][1].p_time).not.toBe(mockRpc.mock.calls[1][1].p_time);
  expect(mockUsage).toHaveBeenCalledTimes(1);
  expect(mockEmail).toHaveBeenCalledTimes(1);
  expect(mockButtons).toHaveBeenCalledTimes(1);
  const finalMessages = mockCreate.mock.calls[3][0].messages;
  const retryResult = finalMessages.find(message => Array.isArray(message.content)
    && message.content.some(block => block.type === 'tool_result'));
  expect(JSON.parse(retryResult.content[0].content).reservation.time).toBe('19:00');
}, 10000);

test.each(['unavailable', 'outside_hours', 'too_late', 'past_slot', 'too_far', 'cancelled_intent', 'invalid_input'])(
  'does not claim a booking or notify the customer when RPC returns %s', async status => {
    mockRpc.mockResolvedValue({ data: { status }, error: null });
    const result = await executeTool('create_reservation', input, session, context);
    expect(result.success).toBe(false);
    expect(mockUsage).not.toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockButtons).not.toHaveBeenCalled();
  }
);

test('missing provider identity refuses unsafe write', async () => {
  const result = await executeTool('create_reservation', input, session);
  expect(result.success).toBe(false);
  expect(mockRpc).not.toHaveBeenCalled();
});

test('conflicting restaurant identifiers fail closed before database access', async () => {
  const inconsistent = { ...session, restaurant_id: '22222222-2222-2222-2222-222222222222' };
  const result = await executeTool('create_reservation', input, inconsistent, context);
  expect(result.success).toBe(false);
  expect(mockRpc).not.toHaveBeenCalled();
});
