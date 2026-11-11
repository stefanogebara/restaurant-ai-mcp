'use strict';

// Audit 2026-11-11, F4: each restaurant's own voice agent (and the OpenAI voice
// server) used tool handlers that looked a reservation up by NAME and returned
// the guest's phone, e-mail and code, and that cancelled or rescheduled by code
// alone. The caller is whoever speaks to the agent. Required now: lookup only
// with the complete code + the booking phone, verified by the guarded RPC, and
// no phone/e-mail in the answer; changes and cancellations refused by phone.

const mockVerify = jest.fn();
jest.mock('../_lib/reservation-mutations', () => ({
  verifyGuestReservation: (...a) => mockVerify(...a),
  modifyGuestReservation: jest.fn(() => { throw new Error('must not be called by phone'); }),
  cancelGuestReservation: jest.fn(() => { throw new Error('must not be called by phone'); }),
}));
const mockFrom = jest.fn(() => { throw new Error('no direct table access by phone'); });
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: mockFrom }, findReservation: jest.fn(() => { throw new Error('no name search'); }) }));

const tools = require('../_lib/tool-handlers');
const R = '0761e937-6eec-44be-b1d7-000000000001';
const CODE = 'RES-20261111-AAAAAAAAAAAA';
const row = { id: 'u-1', reservation_id: CODE, restaurant_id: R, customer_name: 'Ana Prova', customer_phone: '+5511911110000',
  customer_email: 'ana@example.test', date: '2026-11-25', time: '19:00', party_size: 4, status: 'confirmed', table_ids: [], special_requests: '' };

beforeEach(() => { mockVerify.mockReset(); mockFrom.mockClear(); });

describe('lookup_reservation by phone', () => {
  test.each([
    [{ name: 'Ana' }], [{ phone: '+5511911110000' }], [{ reservation_id: CODE }], [{ name: 'Ana', phone: '+5511911110000' }],
  ])('without the full code AND a phone it reveals nothing: %j', async params => {
    const r = await tools.lookupReservation(R, params);
    expect(r).toMatchObject({ found: false, verification_required: true });
    expect(JSON.stringify(r)).not.toMatch(/Ana|5511911110000|example\.test/);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test('code + phone is verified by the guarded transition and omits phone and e-mail', async () => {
    mockVerify.mockResolvedValueOnce({ success: true, changed: false, reservation: row, error: null });
    const r = await tools.lookupReservation(R, { reservation_id: ` ${CODE} `, phone: '+5511911110000' });
    expect(mockVerify).toHaveBeenCalledWith({ restaurantId: R, reservationId: CODE, customerPhone: '+5511911110000' });
    expect(r.found).toBe(true);
    expect(r.reservations[0]).toEqual({ reservation_id: CODE, customer_name: 'Ana Prova', party_size: 4,
      date: '2026-11-25', time: '19:00', status: 'confirmed' });
    expect(JSON.stringify(r)).not.toMatch(/5511911110000|example\.test/);
  });

  test('a wrong phone reveals nothing', async () => {
    mockVerify.mockResolvedValue({ success: false, changed: false, reservation: null, error: { code: 'verification_failed' } });
    const r = await tools.lookupReservation(R, { reservation_id: CODE, phone: '+5511999990000' });
    expect(r).toMatchObject({ found: false, verification_required: true });
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  test('a Brazilian number said without the country code is retried once with +55', async () => {
    mockVerify
      .mockResolvedValueOnce({ success: false, error: { code: 'verification_failed' } })
      .mockResolvedValueOnce({ success: true, changed: false, reservation: row, error: null });
    const r = await tools.lookupReservation(R, { reservation_id: CODE, phone: '(11) 91111-0000' });
    expect(mockVerify).toHaveBeenLastCalledWith({ restaurantId: R, reservationId: CODE, customerPhone: '+5511911110000' });
    expect(r.found).toBe(true);
  });

  test('a database failure is an error, not "not found"', async () => {
    mockVerify.mockResolvedValueOnce({ success: false, error: { code: 'mutation_unavailable' } });
    const r = await tools.lookupReservation(R, { reservation_id: CODE, phone: '+5511911110000' });
    expect(r).toMatchObject({ success: false, error: true });
  });
});

describe('modify and cancel by phone', () => {
  test.each(['modifyReservation', 'cancelReservation'])('%s is refused and touches nothing', async fn => {
    const r = await tools[fn](R, { reservation_id: CODE, new_time: '03:00', new_party_size: 40 });
    expect(r).toMatchObject({ success: false, changed: false, action_unavailable: true });
    expect(r.message).toMatch(/customer portal/);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
