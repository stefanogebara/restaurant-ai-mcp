'use strict';

const { sendInteractiveButtonMessage } = require('../_services/whatsapp/message-sender');

const previousToken = process.env.WHATSAPP_ACCESS_TOKEN;
const previousNumber = process.env.WHATSAPP_PHONE_NUMBER_ID;
const previousFetch = global.fetch;

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'unit-test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '999999999999999';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, json: async () => ({ messages: [{ id: 'wamid.test' }] }),
  });
});

afterAll(() => {
  if (previousToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
  else process.env.WHATSAPP_ACCESS_TOKEN = previousToken;
  if (previousNumber === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  else process.env.WHATSAPP_PHONE_NUMBER_ID = previousNumber;
  global.fetch = previousFetch;
});

test('button confirmation replies through the verified receiving Meta number', async () => {
  const result = await sendInteractiveButtonMessage('5511999999999', 'Reserva confirmada', [
    { id: 'cancel_reservation_test', title: 'Cancelar' },
  ], { phoneNumberId: '123456789012345' });

  expect(result).toMatchObject({ success: true, messageId: 'wamid.test' });
  expect(global.fetch.mock.calls[0][0]).toContain('/123456789012345/messages');
  expect(global.fetch.mock.calls[0][0]).not.toContain('/999999999999999/messages');
  expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

test('invalid or empty explicit receiver never falls back to the platform number', async () => {
  for (const phoneNumberId of ['', '../other', '+15551234567']) {
    expect(await sendInteractiveButtonMessage('5511999999999', 'Reserva confirmada', [], {
      phoneNumberId,
    })).toEqual({ success: false, error: 'Invalid Meta receiver' });
  }
  expect(global.fetch).not.toHaveBeenCalled();
});
