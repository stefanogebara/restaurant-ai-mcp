'use strict';

let mockRows, mockQueries, mockBeforeWrite;
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: table => {
    if (table !== 'reservations') throw new Error('Unexpected table');
    const filters = [];
    let updates;
    const finish = async () => {
      if (updates) mockBeforeWrite();
      const rows = mockRows.filter(row => filters.every(([field, value]) => String(row[field]) === String(value)));
      if (updates) rows.forEach(row => Object.assign(row, updates));
      return { data: rows.length === 1 ? { ...rows[0] } : null, error: rows.length === 1 ? null : { message: 'No row matched' } };
    };
    const q = { select: () => q, eq: (field, value) => { filters.push([field, value]); return q; },
      update: value => { updates = value; return q; }, single: finish, maybeSingle: finish };
    mockQueries.push({ filters, updates: () => updates });
    return q;
  } }, canAccommodateParty: jest.fn(),
}));
jest.mock('../_lib/restaurant-registry', () => ({ getRestaurantByName: jest.fn(), getAllActiveRestaurants: jest.fn() }));
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn() }));
jest.mock('../_lib/whatsapp-sessions', () => ({ setSessionRestaurant: jest.fn() }));
jest.mock('../_services/whatsapp/message-sender', () => ({ sendTemplateMessage: jest.fn(), sendInteractiveButtonMessage: jest.fn() }));
jest.mock('../_lib/email', () => ({ sendReservationConfirmationEmail: jest.fn() }));
jest.mock('../_services/whatsapp/waitlist-handler', () => ({ addCustomerToQueue: jest.fn(), checkQueuePosition: jest.fn() }));

const { executeTool } = require('../_services/whatsapp/reservation-tools');
const session = { sender_phone: '15555550101', restaurant_id: 'rest-a', restaurant: { id: 'rest-a', timezone: 'UTC', language: 'pt' } };
const context = { providerName: 'meta', receiver: '123456789', messageId: 'wamid.change', timezone: 'UTC', language: 'pt' };
const original = { reservation_id: 'RES-OWNED', restaurant_id: 'rest-a', customer_phone: '+15555550101', customer_name: 'Guest',
  date: '2026-11-11', time: '19:00', party_size: 2, status: 'confirmed', table_ids: ['table-a'], special_requests: 'Window' };
const modify = change => executeTool('modify_reservation', { reservation_id: original.reservation_id, ...change }, session, context);
const writes = () => mockQueries.filter(q => q.updates());
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-10T12:00:00Z') });
  mockRows = [{ ...original }, { ...original, reservation_id: 'RES-OTHER', restaurant_id: 'rest-b' }];
  mockQueries = []; mockBeforeWrite = () => {};
});
afterEach(() => jest.useRealTimers());

test.each([
  { new_party_size: 2.5 }, { new_party_size: '2people' }, { new_party_size: 0 },
  { new_party_size: -1 }, { new_party_size: null }, { new_party_size: 51 },
  { new_time: '25:00' }, { new_time: '12:61' }, { new_time: null },
  { new_date: '2026-11-31' }, { new_date: '2027-02-29' }, { new_date: '2023-11-11' },
])('rejects an invalid reschedule without any UPDATE: %j', async change => {
  const result = await modify(change);
  expect(result.success).toBe(false);
  expect(writes()).toHaveLength(0);
  expect(mockRows[0]).toEqual(original);
});

test('a valid partial change preserves the exact reservation, guest and unrelated data', async () => {
  const result = await modify({ new_date: '2026-11-12', new_time: '20:00', new_party_size: '03', customer_phone: '+15555550999' });
  expect(result).toMatchObject({ success: true, reservation_id: original.reservation_id });
  expect(mockRows[0]).toEqual({ ...original, date: '2026-11-12', time: '20:00', party_size: 3 });
  expect(mockRows[1]).toEqual({ ...original, reservation_id: 'RES-OTHER', restaurant_id: 'rest-b' });
});

test('repeating the same requested values is a read-only success', async () => {
  expect((await modify({ new_time: '19:00', new_party_size: 2 })).success).toBe(true);
  expect(writes()).toHaveLength(0);
});

test('a replay after a committed modification does not issue a second UPDATE', async () => {
  expect((await modify({ new_time: '20:00' })).success).toBe(true);
  expect(await modify({ new_time: '20:00' })).toMatchObject({ success: true, reused: true });
  expect(writes()).toHaveLength(1);
});

test('a date-only modification preserves the stored SQL time representation', async () => {
  mockRows[0].time = '19:00:00';
  expect((await modify({ new_date: '2026-11-12' })).success).toBe(true);
  expect(mockRows[0].time).toBe('19:00:00');
  expect(writes()[0].updates()).toEqual({ date: '2026-11-12' });
});

test('missing timezone refuses the mutation instead of guessing', async () => {
  expect(await executeTool('modify_reservation', { reservation_id: original.reservation_id, new_time: '20:00' },
    { ...session, restaurant: { ...session.restaurant, timezone: undefined } }, { ...context, timezone: undefined }))
    .toMatchObject({ success: false });
  expect(writes()).toHaveLength(0);
});

test.each([
  ['America/Sao_Paulo', '2026-11-11T01:30:00Z', '2026-11-10', '23:00', true],
  ['Asia/Tokyo', '2026-11-10T23:30:00Z', '2026-11-10', '23:45', false],
])('checks the restaurant-local clock in %s', async (timezone, now, new_date, new_time, success) => {
  jest.setSystemTime(new Date(now));
  const result = await executeTool('modify_reservation', { reservation_id: original.reservation_id, new_date, new_time }, session, { ...context, timezone });
  expect(result.success).toBe(success);
  expect(writes()).toHaveLength(success ? 1 : 0);
});

test.each([{ date: '2026-11-12' }, { time: '21:00' }, { party_size: 4 }, { status: 'cancelled' }])(
  'does not overwrite a concurrent reservation change: %j', async change => {
    mockBeforeWrite = () => Object.assign(mockRows[0], change);
    const result = await modify({ new_time: '20:00' });
    expect(result.success).toBe(false);
    expect(mockRows[0]).toEqual({ ...original, ...change });
  },
);

test('cancel releases reservation table references and changes no other fields', async () => {
  const result = await executeTool('cancel_reservation', { reservation_id: original.reservation_id }, session, context);
  expect(result).toMatchObject({ success: true, reservation_id: original.reservation_id });
  expect(mockRows[0]).toEqual({ ...original, status: 'cancelled', table_ids: [] });
  expect(mockRows[1]).toEqual({ ...original, reservation_id: 'RES-OTHER', restaurant_id: 'rest-b' });
});

test.each(['lookup_reservation', 'modify_reservation', 'cancel_reservation'])('%s refuses a contradictory session tenant before privileged reads', async tool => {
  const result = await executeTool(tool, { reservation_id: original.reservation_id, new_time: '20:00' },
    { ...session, restaurant_id: 'rest-b' }, context);
  expect(result.success).toBe(false);
  expect(mockQueries).toHaveLength(0);
});
