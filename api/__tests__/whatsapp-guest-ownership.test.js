'use strict';

const mockFrom = jest.fn();

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: (...args) => mockFrom(...args) },
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
const restaurant = { id: 'restaurant-1' };
const sender = { restaurant, sender_phone: '5511999002121' };
const otherGuest = {
  reservation_id: 'RES-KNOWN', customer_name: 'Private Guest',
  customer_phone: '+5511988887777', date: '2026-10-30', time: '19:00',
  party_size: 2, status: 'confirmed',
};
const ownGuest = { ...otherGuest, customer_phone: '+55 (11) 99900-2121' };

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

beforeEach(() => mockFrom.mockReset());

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
    expect(mockFrom).toHaveBeenCalledTimes(1);
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

test('cancel is conditional on tenant, exact stored phone and previous status', async () => {
  const read = chain({ row: ownGuest });
  const write = chain({ result: { reservation_id: ownGuest.reservation_id } });
  mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(write);
  const result = await executeTool('cancel_reservation', {
    reservation_id: ownGuest.reservation_id,
  }, sender);
  expect(result.success).toBe(true);
  expect(write.eq).toHaveBeenCalledWith('restaurant_id', restaurant.id);
  expect(write.eq).toHaveBeenCalledWith('customer_phone', ownGuest.customer_phone);
  expect(write.eq).toHaveBeenCalledWith('status', ownGuest.status);
  expect(write.select).toHaveBeenCalledWith('reservation_id');
});

test('cancel does not report success if the guarded update matched no row', async () => {
  mockFrom.mockReturnValueOnce(chain({ row: ownGuest }))
    .mockReturnValueOnce(chain({ result: null }));
  const result = await executeTool('cancel_reservation', {
    reservation_id: ownGuest.reservation_id,
  }, sender);
  expect(result.success).toBe(false);
});

test('modify is conditional on tenant, exact stored phone and previous status', async () => {
  const write = chain({ result: { ...ownGuest, time: '20:00' } });
  mockFrom.mockReturnValueOnce(chain({ row: ownGuest })).mockReturnValueOnce(write);
  const result = await executeTool('modify_reservation', {
    reservation_id: ownGuest.reservation_id, new_time: '20:00',
  }, sender);
  expect(result.success).toBe(true);
  expect(write.eq).toHaveBeenCalledWith('restaurant_id', restaurant.id);
  expect(write.eq).toHaveBeenCalledWith('customer_phone', ownGuest.customer_phone);
  expect(write.eq).toHaveBeenCalledWith('status', ownGuest.status);
});

test('modify does not report success if the guarded update matched no row', async () => {
  mockFrom.mockReturnValueOnce(chain({ row: ownGuest }))
    .mockReturnValueOnce(chain({ result: null }));
  const result = await executeTool('modify_reservation', {
    reservation_id: ownGuest.reservation_id, new_time: '20:00',
  }, sender);
  expect(result.success).toBe(false);
});
