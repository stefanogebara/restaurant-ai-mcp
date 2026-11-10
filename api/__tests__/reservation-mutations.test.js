'use strict';
const mockRpc = jest.fn();
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { rpc: (...args) => mockRpc(...args) } }));
const { verifyGuestReservation, modifyGuestReservation, cancelGuestReservation } = require('../_lib/reservation-mutations');
const actor = { restaurantId: '11111111-1111-4111-8111-111111111111', reservationId: 'RES-20261110-AbCdEf012_-3', customerPhone: '+1 (555) 555-0101' };
const row = { id: '22222222-2222-4222-8222-222222222222', restaurant_id: actor.restaurantId,
  reservation_id: actor.reservationId, customer_phone: '+15555550101', customer_name: 'Guest',
  date: '2026-11-11', time: '20:00', party_size: 2, status: 'confirmed', table_ids: [], special_requests: '' };
const ok = (changed = false, reservation = row) => ({ data: { success: true, changed, reservation, error: null }, error: null });
beforeEach(() => { mockRpc.mockReset().mockResolvedValue(ok()); });

test.each([
  ['verify', verifyGuestReservation, {}],
  ['modify', modifyGuestReservation, { newDate: '2028-02-29', newTime: '21:30', newPartySize: '03' }],
  ['cancel', cancelGuestReservation, {}],
])('%s supplies independent tenant/phone/full-code proof to the atomic RPC', async (action, invoke, change) => {
  mockRpc.mockResolvedValue(ok(action !== 'verify', { ...row, secret_internal_field: 'not exposed' }));
  const result = await invoke({ ...actor, ...change, customer_phone: '+19999999999', status: 'seated' });
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('mutate_guest_reservation', {
    p_action: action, p_restaurant_id: actor.restaurantId, p_customer_phone: '15555550101',
    p_reservation_id: actor.reservationId,
    p_changes: action === 'modify' ? { date: '2028-02-29', time: '21:30', party_size: 3 } : {},
  });
  expect(result).toEqual({ success: true, changed: action !== 'verify', reservation: row, error: null });
});

test.each([
  { restaurantId: '' }, { restaurantId: 'foreign-not-a-uuid' }, { reservationId: '' }, { reservationId: 'short code' },
  { reservationId: null }, { customerPhone: null }, { customerPhone: 'attacker15555550101' }, { customerPhone: '+123' },
])('refuses missing or malformed identity proof before an RPC: %j', async invalid => {
  expect(await cancelGuestReservation({ ...actor, ...invalid })).toMatchObject({ success: false, changed: false, reservation: null, error: { code: 'verification_failed' } });
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([
  [{ newDate: '2026-11-31' }, 'invalid_date'], [{ newDate: null }, 'invalid_date'],
  [{ newDate: '2027-02-29' }, 'invalid_date'], [{ newTime: '25:00' }, 'invalid_time'],
  [{ newTime: '20:00\n' }, 'invalid_time'], [{ newPartySize: 2.5 }, 'invalid_party_size'],
  [{ newPartySize: '2people' }, 'invalid_party_size'], [{ newPartySize: '2\n' }, 'invalid_party_size'],
  [{ newPartySize: null }, 'invalid_party_size'], [{ newPartySize: true }, 'invalid_party_size'],
  [{ newPartySize: 101 }, 'invalid_party_size'], [{}, 'invalid_input'],
])('rejects malformed partial changes %j', async (changes, code) => {
  expect(await modifyGuestReservation({ ...actor, ...changes })).toMatchObject({ success: false, changed: false, reservation: null, error: { code } });
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['verification_failed', 'invalid_status', 'past_slot', 'outside_hours', 'too_late', 'too_far', 'unavailable']) (
  'returns a normalized %s refusal without leaking returned row/error details', async code => {
    mockRpc.mockResolvedValue({ data: { success: false, changed: true, reservation: row, error: { code, message: 'private provider/DB details' } }, error: null });
    const result = await modifyGuestReservation({ ...actor, newTime: '20:30' });
    expect(result).toMatchObject({ success: false, changed: false, reservation: null, error: { code } });
    expect(JSON.stringify(result)).not.toMatch(/private provider|Guest/);
  },
);

test.each([
  { ...row, restaurant_id: '33333333-3333-4333-8333-333333333333' },
  { ...row, reservation_id: 'different-code' }, { ...row, customer_phone: '+15555550999' },
])('refuses an incoherent RPC success instead of exposing a foreign reservation', async reservation => {
  mockRpc.mockResolvedValue(ok(true, reservation));
  expect(await cancelGuestReservation(actor)).toMatchObject({ success: false, changed: false, reservation: null, error: { code: 'mutation_unavailable' } });
});

test('never retries an ambiguous timeout and exposes no raw database error', async () => {
  mockRpc.mockRejectedValue(new Error('private SQL timeout after commit'));
  const result = await cancelGuestReservation(actor);
  expect(result).toMatchObject({ success: false, changed: false, reservation: null, error: { code: 'mutation_unavailable' } });
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toMatch(/private SQL/);
});

test('preserves changed:false on a repeated cancellation', async () => {
  mockRpc.mockResolvedValueOnce(ok(true, { ...row, status: 'cancelled' }))
    .mockResolvedValueOnce(ok(false, { ...row, status: 'cancelled' }));
  expect(await cancelGuestReservation(actor)).toMatchObject({ success: true, changed: true });
  expect(await cancelGuestReservation(actor)).toMatchObject({ success: true, changed: false });
  expect(mockRpc).toHaveBeenCalledTimes(2);
});

test('matches opaque formats exactly without imposing a voice-specific format globally', async () => {
  const reservationId = '44444444-4444-4444-8444-444444444444';
  mockRpc.mockResolvedValue(ok(false, { ...row, reservation_id: reservationId }));
  expect(await verifyGuestReservation({ ...actor, reservationId })).toMatchObject({ success: true });
  expect(mockRpc.mock.calls[0][1].p_reservation_id).toBe(reservationId);
});
