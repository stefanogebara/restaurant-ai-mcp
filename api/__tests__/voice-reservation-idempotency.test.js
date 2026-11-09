const mockRows = new Map();
let mockSerial = 0;
let mockLookupError = null;
let mockLegacyBooking = null;
let mockBindingOverride = null;
const mockCreate = jest.fn(async (restaurantId, fields, options = {}) => {
  const key = options.externalId && `${restaurantId}:${options.externalId}`;
  if (key && mockRows.has(key)) return { success: false, code: '23505' };
  const row = { ...fields, restaurant_id: restaurantId, id: `row-${++mockSerial}` };
  mockRows.set(key || `legacy-${mockSerial}`, row);
  return { success: true, data: row };
});
const mockSend = jest.fn(async () => ({ success: true, messageId: 'wamid-once' }));
const mockCapacity = jest.fn(async () => ({ can_accommodate: true, table_ids: ['table-1'] }));
const mockFrom = jest.fn(table => {
  const filters = {};
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn((key, value) => { filters[key] = value; return q; }),
    maybeSingle: jest.fn(async () => ({
      data: table === 'agent_conversations'
        ? (mockBindingOverride || (mockLegacyBooking ? { reservation_id: mockLegacyBooking.reservation_id } : { metadata: { voice_booking_guard: 'external_id_v1' } }))
        : (mockRows.get(`${filters.restaurant_id}:${filters.external_id}`)
          || (mockLegacyBooking && filters.reservation_id === mockLegacyBooking.reservation_id && filters.restaurant_id === mockLegacyBooking.restaurant_id ? mockLegacyBooking : null)),
      error: mockLookupError,
    })),
  };
  return q;
});
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: (...args) => mockFrom(...args) },
  getReservations: jest.fn(async () => ({ success: true, data: { records: [] } })),
  canAccommodateParty: (...args) => mockCapacity(...args),
  createReservation: (...args) => mockCreate(...args),
  generateReservationId: jest.fn(() => `RES-${mockSerial + 1}`),
}));
jest.mock('../_lib/reservation-validator', () => ({
  ...jest.requireActual('../_lib/reservation-validator'),
  validateReservation: jest.fn(() => ({ valid: true })),
}));
jest.mock('../_lib/whatsapp-sender', () => ({ sendTemplateMessage: (...args) => mockSend(...args) }));
jest.mock('../_services/reservationWhatsAppDelivery', () => ({
  beginConfirmation: jest.fn(async () => ({ id: 'tracking', sender_id: 'sender', recipient_phone: '34639672963' })),
  finishConfirmation: jest.fn(async () => {}),
}));
const { createReservation } = require('../_lib/tool-handlers');
const restaurant = { restaurant_name: 'Seatable CI Sandbox', agent_language: 'pt', whatsapp_enabled: true };
const params = { date: '2026-11-10', time: '19:00', party_size: 2, customer_name: 'Teste Safira 90', customer_phone: '+34639672963' };
const context = { conversationId: 'conv_real_verified_123' };
beforeEach(() => { mockRows.clear(); mockSerial = 0; mockLookupError = null; mockLegacyBooking = null; mockBindingOverride = null; jest.clearAllMocks(); mockCapacity.mockReset().mockResolvedValue({ can_accommodate: true, table_ids: ['table-1'] }); });

test('repeating confirmation in one conversation returns one booking and sends one message', async () => {
  const first = await createReservation('tenant-a', restaurant, params, context);
  mockCapacity.mockResolvedValue({ can_accommodate: false });
  const repeated = await createReservation('tenant-a', restaurant, params, context);
  expect(first.success).toBe(true);
  expect(repeated).toEqual(expect.objectContaining({ success: true, reused: true, reservation_id: first.reservation_id }));
  expect(mockRows.size).toBe(1);
  expect(mockCapacity).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledTimes(1);
});

test('concurrent confirmations resolve a unique-key insert conflict without another send', async () => {
  const results = await Promise.all([createReservation('tenant-a', restaurant, params, context), createReservation('tenant-a', restaurant, params, context)]);
  expect(results.every(r => r.success)).toBe(true);
  expect(new Set(results.map(r => r.reservation_id)).size).toBe(1);
  expect(results.filter(r => r.reused)).toHaveLength(1);
  expect(mockRows.size).toBe(1);
  expect(mockSend).toHaveBeenCalledTimes(1);
});

test('a concurrent winner occupying the last table replays success instead of reporting unavailable', async () => {
  let inserted;
  const committed = new Promise(resolve => { inserted = resolve; });
  const write = mockCreate.getMockImplementation();
  mockCreate.mockImplementationOnce(async (...args) => { const result = await write(...args); inserted(); return result; });
  mockCapacity.mockResolvedValueOnce({ can_accommodate: true, table_ids: ['last-table'] })
    .mockImplementationOnce(async () => { await committed; return { can_accommodate: false }; });
  const results = await Promise.all([createReservation('tenant-a', restaurant, params, context), createReservation('tenant-a', restaurant, params, context)]);
  expect(results.every(r => r.success)).toBe(true);
  expect(new Set(results.map(r => r.reservation_id)).size).toBe(1);
  expect(mockCreate).toHaveBeenCalledTimes(1); expect(mockSend).toHaveBeenCalledTimes(1);
});

test('a booking created before this release is recovered from its durable conversation binding', async () => {
  mockLegacyBooking = { ...params, id: 'legacy-row', reservation_id: 'RES-LEGACY', restaurant_id: 'tenant-a', status: 'confirmed' };
  const result = await createReservation('tenant-a', restaurant, params, context);
  expect(result).toEqual(expect.objectContaining({ success: true, reused: true, reservation_id: 'RES-LEGACY' }));
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
  const bindingIndex = mockFrom.mock.calls.findIndex(([table]) => table === 'agent_conversations');
  const bindingQuery = mockFrom.mock.results[bindingIndex].value;
  expect(bindingQuery.eq).toHaveBeenCalledWith('conversation_id', context.conversationId);
  expect(bindingQuery.eq).toHaveBeenCalledWith('restaurant_info_id', 'tenant-a');
  expect(bindingQuery.eq).toHaveBeenCalledWith('caller_phone', params.customer_phone);
});

test('a legacy successful tool result recovers its exact booking when the call link is missing', async () => {
  mockLegacyBooking = { ...params, id: 'legacy-row', reservation_id: 'RES-LEGACY', restaurant_id: 'tenant-a', status: 'confirmed' };
  mockBindingOverride = { tools_used: [{ tool_name: 'create_reservation', success: true, result: { reservation_id: 'RES-LEGACY' } }] };
  const result = await createReservation('tenant-a', restaurant, params, context);
  expect(result).toEqual(expect.objectContaining({ success: true, reused: true, reservation_id: 'RES-LEGACY' }));
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});

test.each([
  {},
  { metadata: { voice_booking_guard: 'unknown' } },
  { metadata: { voice_booking_guard: 'external_id_v1' }, ended_at: '2026-11-09T23:00:00Z' },
  { tools_used: [{ tool_name: 'create_reservation', success: null }] },
])('unknown legacy or closed-call state fails closed without guessing a booking: %p', async binding => {
  mockBindingOverride = binding;
  const result = await createReservation('tenant-a', restaurant, params, context);
  expect(result.success).toBe(false); expect(mockCreate).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});

test('conflicting durable legacy codes never choose one arbitrarily', async () => {
  mockLegacyBooking = { ...params, id: 'legacy-row', reservation_id: 'RES-LEGACY', restaurant_id: 'tenant-a', status: 'confirmed' };
  mockBindingOverride = { reservation_id: 'RES-LEGACY', tools_used: [
    { tool_name: 'create_reservation', success: true, result: { reservation_id: 'RES-OTHER' } },
  ] };
  const result = await createReservation('tenant-a', restaurant, params, context);
  expect(result.success).toBe(false); expect(mockCreate).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});

test.each([{ party_size: 3 }, { date: '2026-11-11' }, { time: '20:00' }])('changed details cannot silently create a second booking: %p', async changed => {
  await createReservation('tenant-a', restaurant, params, context);
  const result = await createReservation('tenant-a', restaurant, { ...params, ...changed }, context);
  expect(result).toEqual(expect.objectContaining({ success: false, error: 'voice_booking_already_exists' }));
  expect(mockRows.size).toBe(1); expect(mockSend).toHaveBeenCalledTimes(1);
});

test('same conversation key in another tenant cannot reuse or expose a booking', async () => {
  const a = await createReservation('tenant-a', restaurant, params, context);
  const b = await createReservation('tenant-b', restaurant, params, context);
  expect(a.success && b.success).toBe(true); expect(a.reservation_id).not.toBe(b.reservation_id);
  expect(mockRows.size).toBe(2); expect(mockSend).toHaveBeenCalledTimes(2);
});

test('model-supplied conversation fields cannot choose the durable booking key', async () => {
  await createReservation('tenant-a', restaurant, { ...params, conversation_id: 'conv_forged_123' });
  expect(mockCreate).toHaveBeenCalledWith('tenant-a', expect.not.objectContaining({ external_id: expect.anything() }));
  expect(mockFrom).not.toHaveBeenCalled();
});

test('an unavailable idempotency lookup fails closed before inserting or sending', async () => {
  mockLookupError = { message: 'unavailable' };
  const result = await createReservation('tenant-a', restaurant, params, context);
  expect(result.success).toBe(false); expect(mockCreate).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});

test('caller mismatch and cancellation never resurrect an existing booking', async () => {
  await createReservation('tenant-a', restaurant, params, context);
  const mismatch = await createReservation('tenant-a', restaurant, { ...params, customer_phone: '+551150283918' }, context);
  expect(mismatch.success).toBe(false);
  mockRows.values().next().value.status = 'cancelled';
  const cancelled = await createReservation('tenant-a', restaurant, params, context);
  expect(cancelled.success).toBe(false); expect(mockRows.size).toBe(1); expect(mockSend).toHaveBeenCalledTimes(1);
});
