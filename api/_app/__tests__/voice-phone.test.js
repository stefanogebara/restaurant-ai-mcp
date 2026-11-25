/**
 * The Fly voice server saved the phone exactly as the AI wrote it down
 * ("11-5028-3918", real call on 2026-11-25), so the WhatsApp confirmation
 * went to "+11-5028-3918". The ElevenLabs path already made it E.164.
 * Both paths now share normalizePhone.
 */

jest.mock('../_lib/tool-handlers', () => ({
  createReservation: jest.fn(async () => ({ success: true })),
}));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn() }));

const { normalizePhone } = require('../_lib/voice-phone');
const toolHandlers = require('../_lib/tool-handlers');
const { executeToolCall } = require('../_voice-server/tool-handler');

describe('normalizePhone', () => {
  test.each([
    ['11-5028-3918', '+551150283918', '+551150283918'],
    ['(11) 99900-2121', null, '+5511999002121'],
    ['+55 11 99900 2121', null, '+5511999002121'],
    ['5511999002121', null, '+5511999002121'],
    ['0014155552671', null, '+14155552671'],
    ['999002121', '+551150283918', null],
    ['612345678', '+34612345678', null],
  ])('%s (caller %s) -> %s', (raw, caller, expected) => {
    expect(normalizePhone(raw, caller)).toBe(expected);
  });

  test('empty input gives null', () => {
    expect(normalizePhone('', '+551150283918')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('Fly voice server create_reservation phone', () => {
  const context = {
    restaurantId: 'r1',
    restaurantConfig: { timezone: 'America/Sao_Paulo' },
    callerNumber: '+551150283918',
    conversationId: 'c1',
  };
  const args = { date: '2026-11-26', time: '20:00', party_size: 2, customer_name: 'Ana Teste' };

  beforeEach(() => toolHandlers.createReservation.mockClear());

  const savedPhone = () => toolHandlers.createReservation.mock.calls[0][2].customer_phone;

  test('a spoken Brazilian number is saved as E.164', async () => {
    await executeToolCall('create_reservation', { ...args, customer_phone: '11-5028-3918' }, context);
    expect(savedPhone()).toBe('+551150283918');
  });

  test('a number that cannot be read falls back to the caller ID', async () => {
    await executeToolCall('create_reservation', { ...args, customer_phone: '5028-3918' }, context);
    expect(savedPhone()).toBe('+551150283918');
  });

  test('no number given uses the caller ID', async () => {
    await executeToolCall('create_reservation', args, context);
    expect(savedPhone()).toBe('+551150283918');
  });
});
