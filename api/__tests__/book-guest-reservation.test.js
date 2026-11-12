'use strict';

// The one JavaScript entry point to public.book_guest_reservation (voice and
// booking page). The SQL rule itself is exercised against Postgres in
// scripts/auditoria-reservas/c4-criacao-concorrente.cjs.
const mockRpc = jest.fn();
jest.mock('../_lib/db/clients', () => ({
  supabase: { rpc: (...args) => mockRpc(...args) },
  handleSupabaseResponse: jest.fn(),
}));

const { bookGuestReservation } = require('../_lib/db/reservations');

beforeEach(() => mockRpc.mockReset());

test('maps every field to the function arguments, with nulls for what a channel lacks', async () => {
  mockRpc.mockResolvedValue({ data: { status: 'created', id: 'row-1', reservation_id: 'RES-1' }, error: null });
  const result = await bookGuestReservation('rest-1', {
    reservation_id: 'RES-1', source: 'voice_ai', date: '2026-11-20', time: '19:00', party_size: 4,
    customer_name: 'Ana', customer_phone: '+5511900000000', customer_email: '', special_requests: 'janela',
    table_ids: ['t1'], notes: 'Created via AI Voice System',
  }, { externalId: 'voice:conv_123456' });

  expect(mockRpc).toHaveBeenCalledWith('book_guest_reservation', {
    p_restaurant_id: 'rest-1', p_source: 'voice_ai', p_external_id: 'voice:conv_123456',
    p_reservation_id: 'RES-1', p_date: '2026-11-20', p_time: '19:00', p_party_size: 4,
    p_customer_name: 'Ana', p_customer_phone: '+5511900000000', p_customer_email: null,
    p_special_requests: 'janela', p_table_ids: ['t1'], p_notes: 'Created via AI Voice System',
    p_deposit_payment_intent_id: null, p_deposit_amount: null,
  });
  expect(result).toEqual({ success: true, status: 'created', data: expect.objectContaining({ id: 'row-1' }) });
});

test('a refusal is not a success but keeps its status and data', async () => {
  mockRpc.mockResolvedValue({ data: { status: 'unavailable', seats_available: 2 }, error: null });
  const result = await bookGuestReservation('rest-1', { source: 'online_portal' });
  expect(mockRpc.mock.calls[0][1].p_external_id).toBeNull();
  expect(result).toEqual({ success: false, status: 'unavailable', data: { status: 'unavailable', seats_available: 2 } });
});

test.each([
  [{ data: null, error: { code: 'PGRST202', message: 'function not found' } }],
  [{ data: null, error: null }],
  [{ data: { nope: true }, error: null }],
])('an RPC error or an unreadable result is status error, never success: %p', async reply => {
  mockRpc.mockResolvedValue(reply);
  const result = await bookGuestReservation('rest-1', { source: 'voice_ai' });
  expect(result.success).toBe(false);
  expect(result.status).toBe('error');
});
