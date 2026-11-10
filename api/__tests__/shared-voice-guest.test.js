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

// Only fields returned by an ownership-verified service may enrich Calls.
const logger = () => ({ logToolCall: jest.fn(), updateConversation: jest.fn() });
const actionServices = [
  ['lookup_reservation', mockVerify], ['modify_reservation', mockModify], ['cancel_reservation', mockCancel],
];
const spelling = 'uppercase Romeo uppercase Echo uppercase Sierra hyphen two zero two six one one one zero hyphen lowercase Alpha uppercase Bravo underscore lowercase Charlie uppercase Delta hyphen lowercase Echo uppercase Foxtrot digit nine uppercase Golf digit one digit two';

test('verified lookup enriches the name and party without linking or claiming a booking/mutation', async () => {
  const conversationLogger = logger();
  const reservation = { reservation_id: code, customer_name: 'QA PhoneChange Âmbar', party_size: 2, customer_phone: context.callerNumber };
  mockVerify.mockResolvedValue({ success: true, changed: false, reservation });
  await runGuestAction({ ...args, data: { reservation_code_spelling: spelling, customer_name: 'Model supplied', party_size: 99 },
    conversationId: 'conv-native', conversationLogger });
  expect(mockVerify).toHaveBeenCalledWith({ restaurantId: 'tenant-a', reservationId: code, customerPhone: context.callerNumber });
  expect(conversationLogger.updateConversation).toHaveBeenCalledTimes(1);
  expect(conversationLogger.updateConversation).toHaveBeenCalledWith('conv-native', { customer_name: reservation.customer_name, party_size: 2 });
  expect(conversationLogger.logToolCall).toHaveBeenCalledWith('conv-native', {
    tool_name: 'lookup_reservation', parameters: {}, success: true, result: { changed: false },
  });
  const logged = JSON.stringify(conversationLogger.logToolCall.mock.calls);
  for (const privateValue of [code, spelling, context.callerNumber, reservation.customer_name]) expect(logged).not.toContain(privateValue);
});

test.each([
  ['modify_reservation', mockModify, 'reservation_modified'],
  ['cancel_reservation', mockCancel, 'reservation_cancelled'],
])('%s combines returned guest fields and existing operation metadata in exactly one update', async (action, service, outcome) => {
  const conversationLogger = logger();
  service.mockResolvedValue({ success: true, changed: true,
    reservation: { reservation_id: code, customer_name: 'QA PhoneChange', party_size: 2 } });
  await runGuestAction({ ...args, action, data: { reservation_id: code, customer_name: 'Wrong model name', party_size: 99 },
    conversationId: 'conv-native', conversationLogger });
  expect(conversationLogger.updateConversation).toHaveBeenCalledTimes(1);
  expect(conversationLogger.updateConversation).toHaveBeenCalledWith('conv-native', {
    customer_name: 'QA PhoneChange', party_size: 2, reservation_id: code, outcome, successful_booking: false,
  });
  expect(conversationLogger.logToolCall).toHaveBeenCalledWith('conv-native', {
    tool_name: action, parameters: {}, success: true, result: { changed: true },
  });
});

test.each(actionServices)('successful unchanged %s records only verified guest metadata', async (action, service) => {
  const conversationLogger = logger();
  service.mockResolvedValue({ success: true, changed: false, reservation: { reservation_id: code, customer_name: '李', party_size: 2 } });
  await runGuestAction({ ...args, action, conversationId: 'conv-native', conversationLogger });
  expect(conversationLogger.updateConversation).toHaveBeenCalledTimes(1);
  expect(conversationLogger.updateConversation).toHaveBeenCalledWith('conv-native', { customer_name: '李', party_size: 2 });
});

test.each(actionServices)('failed %s cannot populate metadata even if a failed result contains guest fields', async (action, service) => {
  const conversationLogger = logger();
  service.mockResolvedValue({ success: false, changed: false, error: { code: 'verification_failed' },
    reservation: { reservation_id: code, customer_name: 'Private Guest', party_size: 2, customer_phone: context.callerNumber } });
  await runGuestAction({ ...args, action, conversationId: 'conv-native', conversationLogger });
  expect(conversationLogger.updateConversation).not.toHaveBeenCalled();
  expect(conversationLogger.logToolCall).toHaveBeenCalledWith('conv-native', {
    tool_name: action, parameters: {}, success: false, result: undefined,
  });
});

test.each([
  {}, { customer_name: null }, { customer_name: {} }, { customer_name: ['Guest'] },
  { customer_name: '' }, { customer_name: '  ' }, { customer_name: 'Guest\nInjected' }, { customer_name: 'x'.repeat(101) },
  { party_size: null }, { party_size: '2' }, { party_size: 2.5 }, { party_size: 0 },
  { party_size: -1 }, { party_size: 101 }, { party_size: true }, { party_size: NaN }, { party_size: Infinity },
])('ignores missing or invalid returned metadata without issuing an empty update: %j', async fields => {
  const conversationLogger = logger();
  mockVerify.mockResolvedValue({ success: true, changed: false, reservation: { reservation_id: code, ...fields } });
  await runGuestAction({ ...args, conversationId: 'conv-native', conversationLogger });
  expect(conversationLogger.updateConversation).not.toHaveBeenCalled();
});

test.each([
  [{ customer_name: 'Âmbar', party_size: '2' }, { customer_name: 'Âmbar' }],
  [{ customer_name: {}, party_size: 2 }, { party_size: 2 }],
])('retains each valid returned field independently without undefined values: %j', async (fields, expected) => {
  const conversationLogger = logger();
  mockVerify.mockResolvedValue({ success: true, changed: false, reservation: { reservation_id: code, ...fields } });
  await runGuestAction({ ...args, conversationId: 'conv-native', conversationLogger });
  expect(conversationLogger.updateConversation).toHaveBeenCalledTimes(1);
  expect(conversationLogger.updateConversation).toHaveBeenCalledWith('conv-native', expected);
});

test.each(actionServices)('incomplete proof for %s reaches neither the service nor metadata logger', async (action) => {
  const conversationLogger = logger();
  const result = await runGuestAction({ ...args, action, data: { reservation_id: 'RES-short', customer_name: 'Unverified', party_size: 2 },
    conversationId: 'conv-native', conversationLogger });
  expect(result).toMatchObject({ success: false, verification_required: true });
  expect(mockVerify).not.toHaveBeenCalled(); expect(mockModify).not.toHaveBeenCalled(); expect(mockCancel).not.toHaveBeenCalled();
  expect(conversationLogger.logToolCall).not.toHaveBeenCalled(); expect(conversationLogger.updateConversation).not.toHaveBeenCalled();
});
