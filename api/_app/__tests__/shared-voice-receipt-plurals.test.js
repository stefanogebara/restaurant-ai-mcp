'use strict';
const mockVerify = jest.fn();
const mockModify = jest.fn();
const mockCancel = jest.fn();
jest.mock('../_lib/reservation-mutations', () => ({
  verifyGuestReservation: (...args) => mockVerify(...args),
  modifyGuestReservation: (...args) => mockModify(...args),
  cancelGuestReservation: (...args) => mockCancel(...args),
}), { virtual: true });
const { decodeReservationCodeSpelling, guestProof, runGuestAction } = require('../_lib/shared-voice-guest');
// Synthetic receipt only. No active call code or caller identity is committed.
const code = 'RES-20261110-aB_cD9tTXyzQ';
const prefix = 'maiúsculas R maiúsculas E maiúsculas S hífen dois zero dois seis um um um zero hífen';
const chunks = [
  'minúsculas Alpha maiúsculas Bravo sublinhado minúsculas Charlie',
  'maiúsculas Delta dígito nove minúsculas Tango maiúsculas Tango',
  'maiúsculas X-ray minúsculas Yankee minúsculas Zulu maiúsculas Quebec',
];
const spelling = prefix + ' ' + chunks.join(' ');
const context = { callerNumber: '+15555550123' };
const args = { action: 'lookup_reservation', context, restaurantId: 'bound-tenant' };
beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockResolvedValue({ success: true, changed: false, reservation: { reservation_id: code } });
});

test.each([
  ['PT accented plurals', spelling],
  ['PT unaccented plurals', spelling.replace(/maiúsculas/g, 'maiusculas').replace(/minúsculas/g, 'minusculas')],
  ['uppercase plurals', spelling.toUpperCase()],
  ['NFD plurals', spelling.normalize('NFD')],
  ['Spanish with shared lowercase plural', spelling.replace(/maiúsculas/g, 'mayúscula').replace(/hífen/g, 'guion').replace(/sublinhado/g, 'guion bajo').replace(/dois/g, 'dos').replace(/zero/g, 'cero').replace(/\bum\b/g, 'uno').replace(/nove/g, 'nueve')],
])('%s decodes the exact full proof and retains bound tenant/native caller', async (_, value) => {
  expect(decodeReservationCodeSpelling(value)).toBe(code);
  expect(guestProof({ reservation_code_spelling: value }, context)).toEqual({ reservationId: code, customerPhone: context.callerNumber });
  expect(await runGuestAction({ ...args, data: { reservation_code_spelling: value } })).toMatchObject({ success: true, changed: false });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith({ restaurantId: 'bound-tenant', customerPhone: context.callerNumber, reservationId: code });
});

test.each([
  ['ANK is not a NATO operand', spelling.replace('maiúsculas Quebec', 'maiúsculas ANK')],
  ['invented chunk hyphens are not removed', prefix + ' ' + chunks.join(' hífen ')],
  ['last chunk is required', prefix + ' ' + chunks.slice(0, 2).join(' ')],
  ['one missing suffix character is not guessed', spelling.replace(' maiúsculas Quebec', '')],
  ['accented NATO operand is not transliterated', spelling.replace('Quebec', 'québec')],
  ['Unicode letter is not normalized', spelling.replace('Quebec', 'ℚ')],
  ['unknown plural is not guessed', spelling.replace('maiúsculas', 'maiúsculaz')],
  ['no new English plural control', spelling.replace('maiúsculas', 'uppercases')],
])('%s still refuses without calling any reservation service', async (_, value) => {
  expect(decodeReservationCodeSpelling(value)).toBeNull();
  expect(await runGuestAction({ ...args, action: 'cancel_reservation', data: { reservation_code_spelling: value } }))
    .toMatchObject({ success: false, verification_required: true });
  expect(mockVerify).not.toHaveBeenCalled(); expect(mockModify).not.toHaveBeenCalled(); expect(mockCancel).not.toHaveBeenCalled();
});

test('plural controls do not change literal, representation-exclusivity or native-identity guards', () => {
  expect(guestProof({ reservation_id: code }, context)).toEqual({ reservationId: code, customerPhone: context.callerNumber });
  expect(guestProof({ reservation_id: code, reservation_code_spelling: spelling }, context)).toBeNull();
  expect(guestProof({ reservation_code_spelling: spelling, customer_phone: '+15555550999' }, context)).toBeNull();
  expect(guestProof({ reservation_code_spelling: spelling }, { callerNumber: null })).toBeNull();
});
