let mockResult;
const mockInsert = jest.fn();
const mockQuery = { insert: (...args) => { mockInsert(...args); return mockQuery; }, select: () => mockQuery, single: async () => mockResult };
jest.mock('../_lib/db/clients', () => ({
  supabase: { from: jest.fn(() => mockQuery) },
  handleSupabaseResponse: (data, error) => error ? { success: false, error: true, message: error.message } : { success: true, data },
}));
const { createReservation } = require('../_lib/db/reservations');
const fields = { reservation_id: 'RES-ONCE', customer_name: 'QA', customer_phone: '+34639672963', date: '2026-11-10', time: '19:00', party_size: 2, status: 'confirmed', source: 'voice_ai' };
beforeEach(() => { jest.clearAllMocks(); mockResult = { data: { id: 'row', ...fields }, error: null }; });

test('persists only the server-supplied key covered by the tenant/source/external unique index', async () => {
  const r = await createReservation('tenant-a', { ...fields, external_id: 'model-forged' }, { externalId: 'voice:conv_verified_123' });
  expect(r.success).toBe(true);
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ restaurant_id: 'tenant-a', source: 'voice_ai', external_id: 'voice:conv_verified_123' }));
});

test('legacy and model fields cannot populate the voice idempotency key', async () => {
  await createReservation('tenant-a', { ...fields, external_id: 'model-forged' });
  expect(mockInsert.mock.calls[0][0]).not.toHaveProperty('external_id');
});

test('preserves a duplicate-key error for the guarded voice caller to resolve', async () => {
  mockResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
  const r = await createReservation('tenant-a', fields, { externalId: 'voice:conv_verified_123' });
  expect(r).toEqual(expect.objectContaining({ success: false, code: '23505' }));
});
