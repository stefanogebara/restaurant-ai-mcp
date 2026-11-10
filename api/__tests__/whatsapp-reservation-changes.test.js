'use strict';

const mockRpc = jest.fn();
const mockFrom = jest.fn(() => { throw new Error('Mutations must not bypass the atomic RPC'); });
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: (...args) => mockFrom(...args), rpc: (...args) => mockRpc(...args) },
  canAccommodateParty: jest.fn(),
}));
jest.mock('../_lib/restaurant-registry', () => ({ getRestaurantByName: jest.fn(), getAllActiveRestaurants: jest.fn() }));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn() }));
jest.mock('../_lib/whatsapp-sessions', () => ({ setSessionRestaurant: jest.fn() }));
jest.mock('../_services/whatsapp/message-sender', () => ({ sendTemplateMessage: jest.fn(), sendInteractiveButtonMessage: jest.fn() }));
jest.mock('../_lib/email', () => ({ sendReservationConfirmationEmail: jest.fn() }));
jest.mock('../_services/whatsapp/waitlist-handler', () => ({ addCustomerToQueue: jest.fn(), checkQueuePosition: jest.fn() }));

const { executeTool } = require('../_services/whatsapp/reservation-tools');
const { trackUsage } = require('../_lib/usage-tracking');
const { sendTemplateMessage, sendInteractiveButtonMessage } = require('../_services/whatsapp/message-sender');
const { sendReservationConfirmationEmail } = require('../_lib/email');
const tenant = '11111111-1111-4111-8111-111111111111';
const session = { sender_phone: '15555550101', restaurant_id: tenant, restaurant: { id: tenant, timezone: 'UTC', language: 'pt' } };
const original = { id: 'row-1', reservation_id: 'RES-20261110-AbCdEf012_-3', restaurant_id: tenant,
  customer_phone: '+15555550101', customer_name: 'Guest', date: '2099-01-01', time: '19:00',
  party_size: 2, status: 'confirmed', table_ids: [], special_requests: 'Window' };
const modify = change => executeTool('modify_reservation', { reservation_id: original.reservation_id, ...change }, session);

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockReset().mockResolvedValue({ data: { success: true, changed: true, reservation: original }, error: null });
});

test('a partial change reaches the shared service with exact code and transport identity', async () => {
  const result = await modify({ new_date: '2099-01-02', new_party_size: '03',
    customer_phone: '+15555550999', restaurant_id: 'attacker', status: 'confirmed' });
  expect(result).toMatchObject({ success: true, changed: true, reservation_id: original.reservation_id });
  expect(mockRpc).toHaveBeenCalledWith('mutate_guest_reservation', {
    p_restaurant_id: tenant, p_customer_phone: session.sender_phone, p_reservation_id: original.reservation_id,
    p_action: 'modify', p_changes: { date: '2099-01-02', party_size: 3 },
  });
  expect(mockFrom).not.toHaveBeenCalled();
});

test('WhatsApp retains its existing party limit of 50 before the RPC', async () => {
  expect(await modify({ new_party_size: 51 })).toMatchObject({ success: false, error: { code: 'invalid_party_size' } });
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['past_slot', 'outside_hours', 'unavailable', 'timezone_unavailable', 'invalid_status'])(
  'atomic %s refusal reaches the tool result without a false success', async code => {
    mockRpc.mockResolvedValue({ data: { success: false, changed: false, reservation: null, error: { code } }, error: null });
    const result = await modify({ new_time: '20:00' });
    expect(result).toMatchObject({ success: false, changed: false, reservation: null, error: { code } });
    expect(result.message).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  },
);

test.each(['modify_reservation', 'cancel_reservation'])('%s preserves the RPC no-op result and sends no duplicate side effects', async tool => {
  mockRpc.mockResolvedValue({ data: { success: true, changed: false, reservation: original }, error: null });
  const result = await executeTool(tool, { reservation_id: original.reservation_id, new_time: '19:00' }, session);
  expect(result).toMatchObject({ success: true, changed: false, reservation: original });
  expect(result.message).toMatch(/No change|already cancelled/);
  expect(mockFrom).not.toHaveBeenCalled();
  for (const effect of [trackUsage, sendTemplateMessage, sendInteractiveButtonMessage, sendReservationConfirmationEmail]) {
    expect(effect).not.toHaveBeenCalled();
  }
});

test('an ambiguous cancellation never retries or claims cancellation', async () => {
  mockRpc.mockRejectedValue(new Error('request timed out'));
  const result = await executeTool('cancel_reservation', { reservation_id: original.reservation_id }, session);
  expect(result).toMatchObject({ success: false, changed: false, error: { code: 'mutation_unavailable' } });
  expect(result.message).toBeUndefined();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(sendTemplateMessage).not.toHaveBeenCalled();
});

test.each(['lookup_reservation', 'modify_reservation', 'cancel_reservation'])('%s refuses a contradictory session tenant before privileged access', async tool => {
  const result = await executeTool(tool, { reservation_id: original.reservation_id, new_time: '20:00' },
    { ...session, restaurant_id: '22222222-2222-4222-8222-222222222222' });
  expect(result.success).toBe(false);
  expect(mockFrom).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});
