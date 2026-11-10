'use strict';
const { decodeReservationCodeSpelling, guestProof, runGuestAction } = require('../_lib/shared-voice-guest');
// Synthetic receipt only; the actual archived proof is checked privately/offline.
const code = 'RES-20261110-jB_cD9tTXyzJ';
const context = { callerNumber: '+15555550123' };
const spelling = word => 'uppercase R uppercase E uppercase S hyphen two zero two six one one one zero hyphen ' +
  `lowercase ${word} uppercase Bravo underscore lowercase Charlie uppercase Delta digit nine lowercase Tango ` +
  `uppercase Tango uppercase X-ray lowercase Yankee lowercase Zulu uppercase ${word}`;

test.each(['Juliet', 'Juliett', 'JULIET', 'juliet'])('exact %s operand preserves both explicit cases in a full 25-character proof', word => {
  expect(decodeReservationCodeSpelling(spelling(word))).toBe(code);
  expect(decodeReservationCodeSpelling(spelling(word))).toHaveLength(25);
  expect(guestProof({ reservation_code_spelling: spelling(word) }, context))
    .toEqual({ reservationId: code, customerPhone: context.callerNumber });
});

test.each(['Juli', 'Julietta', 'ANK', 'Julіet', 'Ｊuliet'])('unknown or lookalike %s is never inferred', word => {
  expect(decodeReservationCodeSpelling(spelling(word))).toBeNull();
  expect(guestProof({ reservation_code_spelling: spelling(word) }, context)).toBeNull();
});

test('Juliet does not complete a missing character or remove an extra code hyphen', () => {
  const full = spelling('Juliet');
  expect(decodeReservationCodeSpelling(full.replace(' uppercase Juliet', ''))).toBeNull();
  expect(decodeReservationCodeSpelling(full + ' hyphen')).toBeNull();
  expect(guestProof({ reservation_id: code }, context)).toEqual({ reservationId: code, customerPhone: context.callerNumber });
  expect(guestProof({ reservation_id: code, reservation_code_spelling: full }, context)).toBeNull();
  expect(guestProof({ reservation_code_spelling: full, customer_phone: '+15555550999' }, context)).toBeNull();
});

test.each(['modify_reservation', 'cancel_reservation'])('%s remains unavailable even when the Juliet proof decodes successfully', async action => {
  expect(await runGuestAction({ action, data: { reservation_code_spelling: spelling('Juliet'), user_confirmed: true },
    context, restaurantId: 'bound-tenant' }))
    .toMatchObject({ success: false, changed: false, action_unavailable: true, requires_secure_confirmation: true });
});
