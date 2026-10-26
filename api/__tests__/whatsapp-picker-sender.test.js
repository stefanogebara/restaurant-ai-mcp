'use strict';

jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(),
}) }));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: jest.fn(), sendTemplateMessage: jest.fn(), getWhatsAppProvider: jest.fn(),
}));

const { sendInteractiveListMessage } = require('../_services/whatsapp/message-sender');
const originalFetch = global.fetch;
const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
const sections = [{ title: 'Restaurantes', rows: [{
  id: 'restaurant_test', title: 'Test', description: '',
}] }];

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
});

afterAll(() => {
  global.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
  else process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
});

test.each([
  [400, true],
  [403, true],
  [500, false],
])('Meta HTTP %i list rejection is definitive=%s', async (status, definitiveFailure) => {
  global.fetch = jest.fn(async () => ({
    ok: false, status, json: async () => ({ error: { message: 'Rejected' } }),
  }));
  const result = await sendInteractiveListMessage('+15550001111', 'Choose', 'Restaurants',
    sections, { phoneNumberId: '99999999999' });
  expect(result).toMatchObject({ success: false, definitiveFailure });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('local receiver validation fails without an external send', async () => {
  global.fetch = jest.fn();
  const result = await sendInteractiveListMessage('+15550001111', 'Choose', 'Restaurants',
    sections, { phoneNumberId: 'invalid' });
  expect(result).toMatchObject({ success: false, definitiveFailure: true });
  expect(global.fetch).not.toHaveBeenCalled();
});
