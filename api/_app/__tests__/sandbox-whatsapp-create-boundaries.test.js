'use strict';

// Exercise the real write-tool guard, rather than mocking an RPC refusal.
// Existing provider-refusal/replay tests live in whatsapp-booking-integrity.test.js.
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { rpc: jest.fn(), from: jest.fn(), schema: jest.fn() },
  canAccommodateParty: jest.fn(),
}));
jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn(), getAllActiveRestaurants: jest.fn(),
}));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn() }));
jest.mock('../_lib/whatsapp-sessions', () => ({ setSessionRestaurant: jest.fn() }));
jest.mock('../_lib/secure-id', () => ({ generateSecureReservationId: jest.fn() }));
jest.mock('../_services/whatsapp/message-sender', () => ({
  sendTemplateMessage: jest.fn(), sendInteractiveButtonMessage: jest.fn(),
}));
jest.mock('../_lib/email', () => ({ sendReservationConfirmationEmail: jest.fn() }));
jest.mock('../_services/whatsapp/waitlist-handler', () => ({
  addCustomerToQueue: jest.fn(), checkQueuePosition: jest.fn(),
}));

const { supabaseAdmin } = require('../_lib/supabase');
const { trackUsage } = require('../_lib/usage-tracking');
const { generateSecureReservationId } = require('../_lib/secure-id');
const sender = require('../_services/whatsapp/message-sender');
const { sendReservationConfirmationEmail } = require('../_lib/email');
const { executeTool } = require('../_services/whatsapp/reservation-tools');
const session = {
  sender_phone: '15555550101',
  restaurant: { id: 'sandbox-restaurant', restaurant_name: 'Sandbox Boundary', language: 'en' },
};
const inbound = { providerName: 'meta', receiver: '123456789', messageId: 'wamid.sandbox' };
const details = { date: '2026-11-11', time: '19:00', party_size: 2, customer_name: 'Sandbox Guest' };

beforeEach(() => { jest.clearAllMocks(); });

function expectNoBookingEffects() {
  expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  expect(generateSecureReservationId).not.toHaveBeenCalled();
  expect(trackUsage).not.toHaveBeenCalled();
  expect(sender.sendTemplateMessage).not.toHaveBeenCalled();
  expect(sender.sendInteractiveButtonMessage).not.toHaveBeenCalled();
  expect(sendReservationConfirmationEmail).not.toHaveBeenCalled();
}

test.each([
  ['zero guests', { party_size: 0 }],
  ['fractional guests', { party_size: 2.5 }],
  ['numeric prefix with junk', { party_size: '2people' }],
  ['unresolved relative date', { date: 'tomorrow' }],
  ['missing date', { date: undefined }],
  ['blank guest name', { customer_name: '   ' }],
])('WhatsApp create refuses %s before RPC or any confirmation', async (_label, invalid) => {
  const result = await executeTool('create_reservation', { ...details, ...invalid }, session, inbound);
  expect(result.success).toBe(false);
  expect(result).not.toHaveProperty('reservation');
  expectNoBookingEffects();
});

test('a model-supplied restaurant cannot authorize a create in an unbound WhatsApp session', async () => {
  const result = await executeTool('create_reservation', {
    ...details, restaurant_id: session.restaurant.id, restaurant: session.restaurant,
  }, { sender_phone: session.sender_phone }, inbound);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/identify the restaurant first/i);
  expectNoBookingEffects();
  expect(supabaseAdmin.from).not.toHaveBeenCalled();
  expect(supabaseAdmin.schema).not.toHaveBeenCalled();
});
