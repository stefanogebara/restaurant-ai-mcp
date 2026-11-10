'use strict';

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { rpc: (...args) => mockRpc(...args), from: (...args) => mockFrom(...args) },
  canAccommodateParty: jest.fn(),
}));
jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn(), getAllActiveRestaurants: jest.fn(),
}));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn() }));
jest.mock('../_lib/whatsapp-sessions', () => ({ setSessionRestaurant: jest.fn() }));
jest.mock('../_services/whatsapp/message-sender', () => ({
  sendTemplateMessage: jest.fn(), sendInteractiveButtonMessage: jest.fn(),
}));
jest.mock('../_lib/email', () => ({ sendReservationConfirmationEmail: jest.fn() }));
jest.mock('../_services/whatsapp/waitlist-handler', () => ({
  addCustomerToQueue: jest.fn(), checkQueuePosition: jest.fn(),
}));

const { executeTool } = require('../_services/whatsapp/reservation-tools');
const restaurant = { id: '11111111-1111-4111-8111-111111111111', timezone: 'UTC' };
const sender = { restaurant, sender_phone: '5511999002121' };
const otherGuest = {
  reservation_id: 'RES-KNOWN', customer_name: 'Private Guest',
  customer_phone: '+5511988887777', date: '2026-10-30', time: '19:00',
  party_size: 2, status: 'confirmed',
};
const ownGuest = { ...otherGuest, id: 'row-1', restaurant_id: restaurant.id, customer_phone: '+55 (11) 99900-2121' };

function chain({ row = null, rows = row ? [row] : [], result = row } = {}) {
  const query = {};
  for (const method of ['select', 'eq', 'in', 'order', 'update']) {
    query[method] = jest.fn().mockReturnValue(query);
  }
  query.limit = jest.fn().mockResolvedValue({ data: rows, error: null });
  query.single = jest.fn().mockResolvedValue({ data: result, error: null });
  query.maybeSingle = jest.fn().mockResolvedValue({ data: result, error: null });
  return query;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset().mockResolvedValue({ data: { success: false, error: { code: 'verification_failed' } }, error: null });
  jest.useFakeTimers({ now: new Date('2026-10-29T12:00:00Z') });
});
afterEach(() => jest.useRealTimers());

test.each(['lookup_reservation', 'cancel_reservation', 'modify_reservation'])(
  '%s rejects a known reservation ID belonging to another sender', async tool => {
    const read = chain({ row: otherGuest });
    mockFrom.mockReturnValue(read);
    const result = await executeTool(tool, {
      reservation_id: otherGuest.reservation_id, new_time: '20:00',
    }, sender);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(otherGuest.customer_name);
    expect(read.update).not.toHaveBeenCalled();
    if (tool === 'lookup_reservation') expect(mockFrom).toHaveBeenCalledTimes(1);
    else {
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledWith('mutate_guest_reservation', expect.objectContaining({
        p_customer_phone: sender.sender_phone, p_restaurant_id: restaurant.id,
        p_reservation_id: otherGuest.reservation_id,
      }));
    }
  },
);

test.each(['lookup_reservation', 'cancel_reservation', 'modify_reservation'])(
  '%s fails closed when the transport sender is missing', async tool => {
    const result = await executeTool(tool, {
      reservation_id: otherGuest.reservation_id,
      customer_phone: ownGuest.customer_phone,
      new_time: '20:00',
    }, { restaurant });
    expect(result.success).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  },
);

test('phone lookup ignores model-supplied phone and returns only the sender\'s reservations', async () => {
  const read = chain({ rows: [otherGuest, ownGuest] });
  mockFrom.mockReturnValue(read);
  const result = await executeTool('lookup_reservation', {
    customer_phone: otherGuest.customer_phone,
  }, sender);
  expect(result).toMatchObject({ success: true, count: 1 });
  expect(result.reservations).toHaveLength(1);
  expect(read.in.mock.calls[0][1]).not.toContain(otherGuest.customer_phone);
});

test('the authenticated sender can look up their own reservation despite phone punctuation', async () => {
  mockFrom.mockReturnValue(chain({ row: ownGuest }));
  const result = await executeTool('lookup_reservation', {
    reservation_id: ownGuest.reservation_id,
  }, sender);
  expect(result).toMatchObject({ success: true, count: 1 });
});

// The SQL harness tests status/ownership inside the atomic UPDATE. These
// adapter cases prove identity comes from the session and refusal is preserved.
test.each(['cancel_reservation', 'modify_reservation'])('%s passes only authoritative ownership to the atomic RPC', async tool => {
  mockRpc.mockResolvedValue({ data: { success: true, changed: true, reservation: ownGuest }, error: null });
  const result = await executeTool(tool, {
    reservation_id: ownGuest.reservation_id, new_time: '20:00',
    customer_phone: otherGuest.customer_phone, restaurant_id: 'attacker', status: 'confirmed',
  }, sender);
  expect(result.success).toBe(true);
  expect(mockRpc).toHaveBeenCalledWith('mutate_guest_reservation', {
    p_restaurant_id: restaurant.id, p_customer_phone: sender.sender_phone,
    p_reservation_id: ownGuest.reservation_id,
    p_action: tool === 'cancel_reservation' ? 'cancel' : 'modify',
    p_changes: tool === 'cancel_reservation' ? {} : { time: '20:00' },
  });
  expect(mockFrom).not.toHaveBeenCalled();
});

test.each(['cancel_reservation', 'modify_reservation'])('%s propagates atomic ownership refusal without guest data', async tool => {
  const result = await executeTool(tool, { reservation_id: ownGuest.reservation_id, new_time: '20:00' }, sender);
  expect(result).toMatchObject({ success: false, changed: false, reservation: null, error: { code: 'verification_failed' } });
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockFrom).not.toHaveBeenCalled();
});
