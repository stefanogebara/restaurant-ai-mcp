'use strict';

// Real booking handler and validator; only persistence and outbound I/O are fake.
// Existing opt-out/rejection cases live in voice-reservation-source.test.js.
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  getReservations: jest.fn(), canAccommodateParty: jest.fn(), createReservation: jest.fn(),
  generateReservationId: jest.fn(() => 'RES-SANDBOX-BOUNDARY'),
}));
jest.mock('../_lib/whatsapp-sender', () => ({ sendTemplateMessage: jest.fn() }));
jest.mock('../_services/reservationWhatsAppDelivery', () => ({
  beginConfirmation: jest.fn(), finishConfirmation: jest.fn(),
}));

const db = require('../_lib/supabase');
const { sendTemplateMessage } = require('../_lib/whatsapp-sender');
const { beginConfirmation, finishConfirmation } = require('../_services/reservationWhatsAppDelivery');
const { createReservation } = require('../_lib/tool-handlers');

const restaurant = {
  restaurant_name: 'Sandbox Boundary', timezone: 'UTC', agent_language: 'en', whatsapp_enabled: true,
};
const details = {
  date: '2026-11-11', time: '19:00', party_size: 2,
  customer_name: 'Sandbox Guest', customer_phone: '+15555550101',
};
const tracking = { id: 'tracking-sandbox', sender_id: '123456789', recipient_phone: '15555550101' };
const book = overrides => createReservation('sandbox-restaurant', restaurant, { ...details, ...overrides });

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ now: new Date('2026-11-10T12:00:00Z') });
  db.getReservations.mockResolvedValue({ success: true, data: { records: [] } });
  db.canAccommodateParty.mockResolvedValue({ can_accommodate: true, table_ids: ['sandbox-table'] });
  db.generateReservationId.mockReturnValue('RES-SANDBOX-BOUNDARY');
  db.createReservation.mockResolvedValue({ success: true, data: { id: 'sandbox-reservation' } });
  beginConfirmation.mockResolvedValue(tracking);
  finishConfirmation.mockResolvedValue(undefined);
  sendTemplateMessage.mockResolvedValue({ success: true, messageId: 'wamid.sandbox' });
});

afterEach(() => { jest.useRealTimers(); });

function expectNoBookingEffects() {
  expect(db.createReservation).not.toHaveBeenCalled();
  expect(beginConfirmation).not.toHaveBeenCalled();
  expect(finishConfirmation).not.toHaveBeenCalled();
  expect(sendTemplateMessage).not.toHaveBeenCalled();
}

test.each([
  ['zero guests', { party_size: 0 }],
  ['negative guests', { party_size: -1 }],
  ['fractional guests', { party_size: 2.5 }],
  ['numeric prefix with junk', { party_size: '2people' }],
  ['past date', { date: '2026-11-09' }],
  ['impossible calendar date', { date: '2026-11-31' }],
  ['missing guest name', { customer_name: '' }],
])('voice create refuses %s without persisting or sending', async (_label, invalid) => {
  const result = await book(invalid);
  // Check effects first: a failure here shows an attempted commit, not just bad copy.
  expectNoBookingEffects();
  expect(result.success).toBe(false);
  expect(result).not.toHaveProperty('reservation_id');
});

test('a voice confirmation transport exception keeps the booking and makes no second send attempt', async () => {
  sendTemplateMessage.mockRejectedValueOnce(new Error('socket closed after submission'));
  const result = await book();

  expect(result).toMatchObject({ success: true, reservation_id: 'RES-SANDBOX-BOUNDARY' });
  expect(result.message).toMatch(/could not confirm.*WhatsApp/i);
  expect(result.message).not.toMatch(/will receive|requested.*WhatsApp/i);
  expect(db.createReservation).toHaveBeenCalledTimes(1);
  expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
});

test.each([
  ['accepted', { success: true, messageId: 'wamid.late' }],
  ['ambiguous', { success: false, ambiguo: true, errorCode: 132001 }],
])('the voice deadline returns without a delivery promise; a late %s result never starts another send', async (_label, lateResult) => {
  let settleProvider;
  sendTemplateMessage.mockImplementationOnce(() => new Promise(resolve => { settleProvider = resolve; }));
  let response;
  const pending = book().then(value => { response = value; return value; });

  await jest.advanceTimersByTimeAsync(0);
  expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(2999);
  expect(response).toBeUndefined();
  await jest.advanceTimersByTimeAsync(1);
  const result = await pending;
  expect(result).toMatchObject({ success: true, reservation_id: 'RES-SANDBOX-BOUNDARY' });
  expect(result.message).toMatch(/could not confirm.*WhatsApp/i);
  expect(result.message).not.toMatch(/will receive|requested.*WhatsApp/i);
  expect(finishConfirmation).not.toHaveBeenCalled();

  settleProvider(lateResult);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(finishConfirmation).toHaveBeenCalledTimes(1);
  expect(finishConfirmation).toHaveBeenCalledWith(tracking, lateResult);
  expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
  expect(db.createReservation).toHaveBeenCalledTimes(1);
  expect(response).toBe(result);
  expect(response.message).toMatch(/could not confirm.*WhatsApp/i);
});
