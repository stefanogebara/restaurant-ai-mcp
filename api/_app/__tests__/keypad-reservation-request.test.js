const { createKeypadReservationRequest, SANDBOX_RESTAURANT } = require('../_lib/keypad-reservation-request');

const context = {
  restaurantId: SANDBOX_RESTAURANT,
  accountSid: 'AC' + 'a'.repeat(32),
  callSid: 'CA' + 'b'.repeat(32),
  caller: '+5511999999999',
  called: '+5511500000000',
};
const code = 'RES-20261111-aB2345678901';
const booking = {
  restaurant_id: context.restaurantId,
  reservation_id: code,
  customer_phone: '+55 (11) 99999-9999',
  status: 'confirmed',
  party_size: 2,
  date: '2026-11-15',
  time: '19:00:00',
};
const input = { reservation_id: code, new_time: '20:00' };
const origin = 'https://sandbox.example.test';

function fixture() {
  const deps = {
    origin,
    resolveGrant: jest.fn(grant => grant === 'bound' ? context : null),
    readReservation: jest.fn().mockResolvedValue(booking),
    persistAction: jest.fn().mockResolvedValue(true),
    fetchCall: jest.fn().mockResolvedValue({
      accountSid: context.accountSid, sid: context.callSid, from: context.caller, to: context.called,
      direction: 'inbound', status: 'in-progress',
    }),
    redirectCall: jest.fn().mockResolvedValue(undefined),
  };
  return { ...deps, prepare: createKeypadReservationRequest(deps) };
}

test('freezes the owned booking and redirects to readback only after storing the proposal', async () => {
  const f = fixture();
  await expect(f.prepare('bound', input)).resolves.toEqual({ success: true, state: 'awaiting_keypad', changed: false });
  expect(f.readReservation).toHaveBeenCalledWith(context.restaurantId, code);
  const [action] = f.persistAction.mock.calls[0];
  expect(action).toMatchObject({
    account_sid: context.accountSid, call_sid: context.callSid, caller: context.caller, called: context.called,
    restaurant_id: context.restaurantId, reservation_code: code, reservation_snapshot: booking,
    action: 'modify', changes: { time: '20:00' },
  });
  expect(action.readback).toContain('2 pessoas no dia 15 de novembro de 2026');
  expect(action.readback).toContain('19 horas');
  expect(action.readback).toContain('20 horas');
  expect(action.readback).toContain('Após esta leitura, pressione um');
  expect(f.redirectCall).toHaveBeenCalledWith(context.callSid, `${origin}/keypad-reservation/${action.id}/read`);
  expect(f.persistAction.mock.invocationCallOrder[0]).toBeLessThan(f.redirectCall.mock.invocationCallOrder[0]);
});

test.each([
  { ...input, confirmed: true },
  { ...input, call_sid: 'other' },
  { ...input, caller: '+5511222222222' },
  { ...input, new_time: '24:00' },
  { ...input, reservation_id: 'aB2345678901' },
])('rejects an invalid or model-supplied identity/consent field', async body => {
  const f = fixture();
  await expect(f.prepare('bound', body)).resolves.toEqual({ success: false, state: 'unavailable' });
  expect(f.readReservation).not.toHaveBeenCalled();
  expect(f.persistAction).not.toHaveBeenCalled();
  expect(f.redirectCall).not.toHaveBeenCalled();
});

test.each(['missing-grant', 'different-tenant', 'wrong-phone', 'ended-call', 'wrong-call'])(
  'does not persist or redirect for %s', async scenario => {
    const f = fixture();
    if (scenario === 'different-tenant') f.resolveGrant.mockReturnValue({ ...context, restaurantId: 'another' });
    if (scenario === 'wrong-phone') f.readReservation.mockResolvedValue({ ...booking, customer_phone: '+5511222222222' });
    if (scenario === 'ended-call' || scenario === 'wrong-call') {
      const call = await f.fetchCall();
      f.fetchCall.mockResolvedValue(scenario === 'ended-call' ? { ...call, status: 'completed' } : { ...call, sid: 'other' });
    }
    await expect(f.prepare(scenario === 'missing-grant' ? 'missing' : 'bound', input)).resolves.toEqual({
      success: false, state: 'unavailable',
    });
    expect(f.persistAction).not.toHaveBeenCalled();
    expect(f.redirectCall).not.toHaveBeenCalled();
  },
);

test('does not redirect a call again when the provider retries preparation', async () => {
  const f = fixture();
  f.persistAction.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await f.prepare('bound', input);
  await expect(f.prepare('bound', input)).resolves.toEqual({ success: false, state: 'already_prepared' });
  expect(f.redirectCall).toHaveBeenCalledTimes(1);
});
