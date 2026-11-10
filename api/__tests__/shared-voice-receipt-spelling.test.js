'use strict';
const mockVerify = jest.fn();
const mockModify = jest.fn();
const mockCancel = jest.fn();
jest.mock('../_lib/reservation-mutations', () => ({
  verifyGuestReservation: (...args) => mockVerify(...args),
  modifyGuestReservation: (...args) => mockModify(...args),
  cancelGuestReservation: (...args) => mockCancel(...args),
}), { virtual: true });
const { guestProof, runGuestAction, decodeReservationCodeSpelling } = require('../_lib/shared-voice-guest');
// Synthetic full code: regress the observed case drift at positions 20/21/22/25
// without publishing an actual active receipt or caller identity.
const code = 'RES-20261110-aB_cD9tTXyzQ';
const prefix = 'uppercase Romeo, uppercase Echo, uppercase Sierra, hyphen, two, zero, two, six, one, one, one, zero, hyphen';
const suffix = 'lowercase Alpha, uppercase Bravo, underscore, lowercase Charlie, uppercase Delta, digit nine, lowercase Tango, uppercase Tango, uppercase X-ray, lowercase Yankee, lowercase Zulu, uppercase Quebec';
const spelling = prefix + ', ' + suffix;
const localize = words => spelling.replace(/\b(uppercase|lowercase|hyphen|underscore|digit|zero|one|two|six|nine)\b/g, word => words[word]);
const portuguese = localize({ uppercase: 'maiúscula', lowercase: 'minúscula', hyphen: 'hífen', underscore: 'sublinhado',
  digit: 'dígito', zero: 'zero', one: 'um', two: 'dois', six: 'seis', nine: 'nove' });
const spanish = localize({ uppercase: 'mayúscula', lowercase: 'minúscula', hyphen: 'guión', underscore: 'guion bajo',
  digit: 'dígito', zero: 'cero', one: 'uno', two: 'dos', six: 'seis', nine: 'nueve' });
const context = { callerNumber: '+15555550123' };
const args = { action: 'lookup_reservation', data: { reservation_code_spelling: spelling }, context, restaurantId: 'bound-tenant' };
beforeEach(() => { jest.clearAllMocks(); mockVerify.mockResolvedValue({ success: false, error: { code: 'verification_failed' } }); });

test('spelling proof decodes all 25 characters and preserves the four observed case-sensitive positions', async () => {
  expect(guestProof(args.data, context)).toEqual({ reservationId: code, customerPhone: context.callerNumber });
  expect([code[19], code[20], code[21], code[24]]).toEqual(['t', 'T', 'X', 'Q']);
  await runGuestAction(args);
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith({ restaurantId: 'bound-tenant', reservationId: code, customerPhone: context.callerNumber });
});

test('accepts only explicit letter case, named symbols and individual digit tokens across allowed delimiters', () => {
  expect(decodeReservationCodeSpelling(spelling)).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.replace(/, /g, ';\n\t'))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.toUpperCase())).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.replace('uppercase Romeo', 'uppercase R').replace('digit nine', '9'))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.replace('lowercase Alpha', 'lowercase A'))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.replace('lowercase Alpha', 'lowercase Alfa'))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.replace('digit nine', 'nine'))).toBe(code);
  const withSuffixHyphen = spelling.replace('digit nine', 'hyphen');
  expect(decodeReservationCodeSpelling(withSuffixHyphen)).toBe(code.slice(0, 18) + '-' + code.slice(19));
});

test('ASR full stops with no following whitespace preserve the full NATO spelling and exact case', async () => {
  const withStops = spelling.replace(/, /g, '.').replace(/uppercase/g, 'Uppercase') + '.';
  expect(withStops.startsWith('Uppercase Romeo.Uppercase Echo.Uppercase Sierra.hyphen.')).toBe(true);
  expect(decodeReservationCodeSpelling(withStops)).toBe(code);
  expect(decodeReservationCodeSpelling(withStops)).toHaveLength(25);
  await runGuestAction({ ...args, data: { reservation_code_spelling: withStops } });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith({ restaurantId: 'bound-tenant', reservationId: code, customerPhone: context.callerNumber });
  expect(guestProof({ reservation_id: code + '.' }, context)).toBeNull();
});

test.each([
  ['English', spelling], ['Portuguese', portuguese], ['Spanish', spanish],
  ['PT decomposed controls', portuguese.normalize('NFD')], ['ES decomposed controls', spanish.normalize('NFD')],
  ['PT uppercase controls', portuguese.toUpperCase()], ['ES uppercase controls', spanish.toUpperCase()],
  ['PT unaccented controls', portuguese.replace(/maiúscula/g, 'maiuscula').replace(/minúscula/g, 'minuscula').replace(/hífen/g, 'hifen').replace(/dígito/g, 'digito')],
  ['ES unaccented controls', spanish.replace(/mayúscula/g, 'mayuscula').replace(/minúscula/g, 'minuscula').replace(/guión/g, 'guion').replace(/dígito/g, 'digito')],
])('%s spelling yields the same full case-sensitive native proof', async (_, value) => {
  expect(decodeReservationCodeSpelling(value)).toBe(code);
  expect(guestProof({ reservation_code_spelling: value }, context)).toEqual({ reservationId: code, customerPhone: context.callerNumber });
  await runGuestAction({ ...args, data: { reservation_code_spelling: value } });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith({ restaurantId: 'bound-tenant', reservationId: code, customerPhone: context.callerNumber });
  expect(guestProof({ reservation_code_spelling: value, customer_phone: '+15555550999' }, context)).toBeNull();
});

test.each([
  ['zero', '0'], ['um', '1'], ['dois', '2'], ['três', '3'], ['três'.normalize('NFD'), '3'], ['tres', '3'], ['quatro', '4'],
  ['cinco', '5'], ['seis', '6'], ['sete', '7'], ['oito', '8'], ['nove', '9'], ['cero', '0'], ['uno', '1'], ['dos', '2'],
  ['cuatro', '4'], ['siete', '7'], ['ocho', '8'], ['nueve', '9'],
])('known digit %s is a single character, with or without a localized digit marker', (word, expected) => {
  for (const marker of ['', 'dígito ', 'digito ']) {
    expect(decodeReservationCodeSpelling(spelling.replace('digit nine', marker + word)))
      .toBe(code.slice(0, 18) + expected + code.slice(19));
  }
});

test.each(['guion', 'guión'])('%s means hyphen except for the adjacent known bajo phrase', word => {
  expect(decodeReservationCodeSpelling(spelling.replace('hyphen', word))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.replace('underscore', word + ' bajo'))).toBe(code);
});

test.each([
  portuguese + '.por.favor', spanish + '.por.favor', spanish.replace('guion bajo', 'guion por bajo'),
  spanish.replace('guion bajo', 'guionbajo'), spanish.replace('guion bajo', 'hífen bajo'),
  portuguese.replace('maiúscula', 'maíuscula'), portuguese.replace('maiúscula', 'maıuscula'),
  portuguese.replace('dígito', 'dígіto'), portuguese.replace('Romeo', 'Rómeo'),
  portuguese.replace('Romeo', 'Ｒ'), portuguese.replace('Romeo', 'K'), portuguese.replace('Romeo', 'Kilo'),
  portuguese.replace('Quebec', 'K'), portuguese.replace('Quebec', 'Kilo'),
  portuguese.replace('Tango', 'Τango'), portuguese.replace('nove', '９'), portuguese.replace('nove', '٩'),
  spelling.replace('digit nine', 'ﬁve'), spanish.replace('nueve', 'nuebe'), portuguese.replace('dois', 'duas'),
])('unknown localized/prose/lookalike tokens remain invalid with no reservation service calls %#', async value => {
  expect(decodeReservationCodeSpelling(value)).toBeNull();
  expect(await runGuestAction({ ...args, data: { reservation_code_spelling: value } })).toMatchObject({ success: false, verification_required: true });
  expect(mockVerify).not.toHaveBeenCalled(); expect(mockModify).not.toHaveBeenCalled(); expect(mockCancel).not.toHaveBeenCalled();
});

test('NFC dictionaries do not normalize or transliterate opaque literal codes or letter operands', () => {
  expect(guestProof({ reservation_id: code.replace('Q', 'K') }, context)).toBeNull();
  expect(guestProof({ reservation_id: code.replace('T', 'Ｔ') }, context)).toBeNull();
  expect(decodeReservationCodeSpelling(spelling.replace('uppercase Quebec', 'maiúscula Q'))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.replace('uppercase Quebec', 'maiúscula ℚ'))).toBeNull();
});

test('literal proof keeps its existing exact case, separators and surrounding-whitespace behavior', async () => {
  expect(guestProof({ reservation_id: ' ' + code + ' ' }, context)).toEqual({ reservationId: code, customerPhone: context.callerNumber });
  const differentCase = code.slice(0, 19) + 'T' + code.slice(20);
  const result = await runGuestAction({ ...args, data: { reservation_id: differentCase } });
  expect(result).toEqual({ success: false, error: { code: 'verification_failed' } });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith(expect.objectContaining({ reservationId: differentCase }));
});

const invalid = [
  undefined, null, 123, [], {}, '', ', ; \n', 'RES-20261110-aB_cD9tTXyzQ',
  'The code is ' + spelling, spelling + ' please', spelling.replace(', ', ': '),
  'The.code.is.' + spelling.replace(/, /g, '.'), spelling.replace(/, /g, '.') + '.please.repeat',
  spelling + '.period', spelling + '.dot',
  spelling.replace('lowercase Tango', 'Tango'), spelling.replace('lowercase Tango', 't'),
  spelling.replace('lowercase Tango', 'uppercase lowercase Tango'), spelling.replace('digit nine', 'digit 09'),
  spelling.replace('digit nine', 'digit ten'), spelling.replace('digit nine', 'oh'),
  spelling.replace('uppercase Romeo', 'lowercase Romeo'), spelling.replace('uppercase X-ray', 'uppercase X ray'),
  spelling.replace('lowercase Charlie', 'lowercase Charly'), spelling.replace('uppercase Delta', 'uppercase Δ'),
  spelling.replace('lowercase Tango', 'lowercase Τango'), spelling.replace('uppercase Romeo', 'uppercase ℝ'),
  spelling.replace(', uppercase Quebec', ''), spelling.replace(', uppercase Quebec', '').replace(', lowercase Zulu', ''),
  spelling + ', digit one', spelling.replace('digit nine', '-'), spelling.replace('digit nine', '_'),
  spelling + ' '.repeat(1501),
];
test.each(invalid)('invalid/incomplete spelling consumes no partial proof and calls no reservation service %#', async value => {
  const data = { reservation_code_spelling: value };
  expect(guestProof(data, context)).toBeNull();
  const result = await runGuestAction({ ...args, action: 'cancel_reservation', data });
  expect(result).toMatchObject({ success: false, verification_required: true });
  expect(result).not.toHaveProperty('reservation');
  expect(result).not.toHaveProperty('reservation_id');
  expect(mockVerify).not.toHaveBeenCalled(); expect(mockModify).not.toHaveBeenCalled(); expect(mockCancel).not.toHaveBeenCalled();
});

test('enforces the 1500-character raw input bound', () => {
  expect(decodeReservationCodeSpelling(spelling.padEnd(1500, ' '))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling.padEnd(1501, ' '))).toBeNull();
});

test.each([code, '', null, undefined])('never accepts both representations, even if they decode identically (%j)', async literal => {
  const data = { reservation_id: literal, reservation_code_spelling: spelling };
  expect(guestProof(data, context)).toBeNull();
  expect(await runGuestAction({ ...args, data })).toMatchObject({ success: false, verification_required: true });
  expect(mockVerify).not.toHaveBeenCalled();
});

test('requires an explicitly supplied own code field instead of inherited proof', () => {
  expect(guestProof(Object.create({ reservation_code_spelling: spelling }), context)).toBeNull();
  expect(guestProof(Object.create({ reservation_id: code }), context)).toBeNull();
});

test.each(['phone', 'customer_phone', 'caller_phone', 'sender_phone', 'customer_email'])('spelling cannot override native identity through %s', async key => {
  const data = { ...args.data, [key]: key === 'customer_email' ? 'other@example.test' : '+15555550999' };
  expect(guestProof(data, context)).toBeNull();
  await runGuestAction({ ...args, data });
  expect(mockVerify).not.toHaveBeenCalled();
});

test.each([null, '', ['+15555550123'], '+1 (555) 555-0123', '15555550123'])('spelling never supplies a missing/invalid native caller %j', async callerNumber => {
  expect(guestProof(args.data, { callerNumber })).toBeNull();
  await runGuestAction({ ...args, context: { callerNumber } });
  expect(mockVerify).not.toHaveBeenCalled();
});

test('spelling remains unavailable without a bound tenant and cannot use a suffix as proof', async () => {
  expect(await runGuestAction({ ...args, restaurantId: null })).toMatchObject({ success: false, verification_required: true });
  expect(guestProof({ reservation_code_spelling: suffix }, context)).toBeNull();
  expect(guestProof({ reservation_id: code.slice(13) }, context)).toBeNull();
  expect(mockVerify).not.toHaveBeenCalled();
});
