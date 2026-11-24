const mockRows = [];
let mockBeforeUpdate = null;
let mockWrites = 0;
const mockFrom = jest.fn(() => {
  const filters = [];
  let payload;
  const matches = row => filters.every(([field, value]) => (row[field] ?? null) === value);
  const q = {
    select: () => q,
    eq: (field, value) => { filters.push([field, value]); return q; },
    is: (field, value) => { filters.push([field, value]); return q; },
    update: value => { payload = value; return q; },
    maybeSingle: async () => {
      if (payload && mockBeforeUpdate) { mockBeforeUpdate(); mockBeforeUpdate = null; }
      const row = mockRows.find(matches);
      if (row && payload) { Object.assign(row, payload); mockWrites++; }
      return { data: row ? { ...row } : null, error: null };
    },
  };
  return q;
});
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: (...args) => mockFrom(...args) } }));
const { ensureVoiceBookingLinked } = require('../_lib/voice-booking-idempotency');
const own = () => mockRows[0];
beforeEach(() => {
  mockRows.length = 0; mockBeforeUpdate = null; mockWrites = 0;
  mockRows.push({ conversation_id: 'conv-real', restaurant_info_id: 'tenant-a', caller_phone: '+34639672963', reservation_id: null,
    successful_booking: false, outcome: 'information_only', ended_at: '2026-11-09T23:00:00Z', customer_name: 'Unchanged' },
  { conversation_id: 'conv-other', restaurant_info_id: 'tenant-b', caller_phone: '+551150283918', reservation_id: null });
});

test('a committed booking replay repairs its missing call link without rewriting completion or guest fields', async () => {
  await ensureVoiceBookingLinked('tenant-a', 'conv-real', '+34639672963', 'RES-ONCE');
  expect(own()).toEqual(expect.objectContaining({ reservation_id: 'RES-ONCE', successful_booking: true, outcome: 'reservation_created',
    ended_at: '2026-11-09T23:00:00Z', customer_name: 'Unchanged' }));
  expect(mockRows[1].reservation_id).toBeNull();
});

test('an already correct link is a read-only replay', async () => {
  Object.assign(own(), { reservation_id: 'RES-ONCE', successful_booking: true, outcome: 'reservation_created' });
  await ensureVoiceBookingLinked('tenant-a', 'conv-real', '+34639672963', 'RES-ONCE');
  expect(mockWrites).toBe(0);
});

test('a conflicting existing link is rejected without mutation', async () => {
  own().reservation_id = 'RES-OTHER';
  await expect(ensureVoiceBookingLinked('tenant-a', 'conv-real', '+34639672963', 'RES-ONCE')).rejects.toThrow('conflict');
  expect(own().reservation_id).toBe('RES-OTHER'); expect(mockWrites).toBe(0);
});

test('a concurrent conflicting link wins the compare-and-set and is never overwritten', async () => {
  mockBeforeUpdate = () => { own().reservation_id = 'RES-OTHER'; };
  await expect(ensureVoiceBookingLinked('tenant-a', 'conv-real', '+34639672963', 'RES-ONCE')).rejects.toThrow('conflict');
  expect(own().reservation_id).toBe('RES-OTHER'); expect(mockWrites).toBe(0);
});

test('a lost CAS cannot report completion while the stored call outcome still contradicts the booking', async () => {
  mockBeforeUpdate = () => { Object.assign(own(), { reservation_id: 'RES-ONCE', successful_booking: true, outcome: 'information_only' }); };
  await expect(ensureVoiceBookingLinked('tenant-a', 'conv-real', '+34639672963', 'RES-ONCE')).rejects.toThrow('conflict');
  expect(mockWrites).toBe(0);
});

test.each([['tenant-b', '+34639672963'], ['tenant-a', '+551150283918']])('foreign tenant/caller cannot repair another call: %s/%s', async (tenant, caller) => {
  await expect(ensureVoiceBookingLinked(tenant, 'conv-real', caller, 'RES-ONCE')).rejects.toThrow('conflict');
  expect(mockWrites).toBe(0);
});
