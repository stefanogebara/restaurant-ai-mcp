const mockVerify = jest.fn();
const mockModify = jest.fn();
const mockCancel = jest.fn();
jest.mock('../_lib/reservation-mutations', () => ({
  verifyGuestReservation: (...a) => mockVerify(...a),
  modifyGuestReservation: (...a) => mockModify(...a),
  cancelGuestReservation: (...a) => mockCancel(...a),
}), { virtual: true });
const { guestProof, runGuestAction } = require('../_lib/shared-voice-guest');
const code = 'RES-20261110-aB_cD-eF9G12';
const context = { callerNumber: '+34639672963' };
const args = { action: 'lookup_reservation', data: { reservation_id: code }, context, restaurantId: 'tenant-a' };
beforeEach(() => { jest.clearAllMocks(); });

test('preserves case, underscores and hyphens in a full receipt code', () => {
  expect(guestProof({ reservation_id: code }, context)).toEqual({ reservationId: code, customerPhone: context.callerNumber });
});
test.each([{}, { reservation_id: 'RES-123' }, { reservation_id: 'guest name' }, { phone: context.callerNumber },
  { reservation_id: code, customer_phone: '+15555550123' }, { reservation_id: code, caller_phone: '+15555550123' },
  { reservation_id: code, customer_email: 'other@example.test' }])('refuses insufficient or overridden guest proof %j', data => {
  expect(guestProof(data, context)).toBeNull();
});
test('refuses a missing native caller rather than using a model-supplied number', () => {
  expect(guestProof({ reservation_id: code, phone: context.callerNumber }, { callerNumber: null })).toBeNull();
});
test('passes only the bound tenant and native phone to the receipt verifier', async () => {
  mockVerify.mockResolvedValue({ success: false, error: 'not_found' });
  expect(await runGuestAction(args)).toEqual({ success: false, error: 'not_found' });
  expect(mockVerify).toHaveBeenCalledWith({ restaurantId: 'tenant-a', reservationId: code, customerPhone: context.callerNumber });
});
test('preserves invalid values for the deterministic mutation validator instead of coercing them', async () => {
  mockModify.mockResolvedValue({ success: false, error: 'invalid_party_size' });
  await runGuestAction({ ...args, action: 'modify_reservation', data: { reservation_id: code, new_party_size: '2junk', new_time: '25:99' } });
  expect(mockModify).toHaveBeenCalledWith(expect.objectContaining({ newPartySize: '2junk', newTime: '25:99' }));
});
test('logs one verified mutation outcome without raw proof or phone', async () => {
  mockCancel.mockResolvedValue({ success: true, changed: true, reservation: { reservation_id: code } });
  const logToolCall = jest.fn(), updateConversation = jest.fn();
  await runGuestAction({ ...args, action: 'cancel_reservation', conversationId: 'conv-native', conversationLogger: { logToolCall, updateConversation } });
  expect(logToolCall).toHaveBeenCalledWith('conv-native', { tool_name: 'cancel_reservation', parameters: {}, success: true, result: { changed: true } });
  expect(updateConversation).toHaveBeenCalledWith('conv-native', { reservation_id: code, outcome: 'reservation_cancelled', successful_booking: false });
});
test('never calls a mutation or verifier when proof is incomplete', async () => {
  const r = await runGuestAction({ ...args, action: 'cancel_reservation', data: {} });
  expect(r).toMatchObject({ success: false, verification_required: true });
  expect(mockVerify).not.toHaveBeenCalled(); expect(mockModify).not.toHaveBeenCalled(); expect(mockCancel).not.toHaveBeenCalled();
});
