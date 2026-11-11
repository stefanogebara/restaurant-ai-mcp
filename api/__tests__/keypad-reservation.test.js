'use strict';

const twilio = require('twilio');
const { createKeypadHandler, callbackUrl } = require('../_lib/keypad-reservation');

const origin = 'https://keypad.example.test';
const accountSid = 'AC' + 'a'.repeat(32);
const callSid = 'CA' + 'a'.repeat(32);
const authToken = 'test-token';
const id = '72979033-f59b-49d9-b7a0-0cd25b6abec9';
const fields = { AccountSid: accountSid, CallSid: callSid, From: '+15555550123', To: '+15555550124', CallStatus: 'in-progress' };

function request(phase, overrides = {}) {
  const body = { ...fields, ...overrides };
  const url = callbackUrl(origin, id, phase);
  return { method: 'POST', path: new URL(url).pathname, body,
    signature: twilio.getExpectedTwilioSignature(authToken, url, body) };
}

const setup = reply => {
  const advance = jest.fn().mockResolvedValue(reply);
  return { advance, handle: createKeypadHandler({ origin, accountSid, authToken, advance }) };
};

test('reads the exact escaped proposal before starting a separate consent step', async () => {
  const { handle } = setup({ state: 'reading', readback: 'Mesa & Terraço <19h> para 2 pessoas.' });
  const out = await handle(request('read'));
  expect(out.status).toBe(200);
  expect(out.xml).toContain('Mesa &amp; Terraço &lt;19h&gt;');
  expect(out.xml).toContain('</Say><Redirect');
  expect(out.xml).not.toContain('<Gather');
});

test('the arm response only listens for one keypad digit, including empty results', async () => {
  const { handle } = setup({ state: 'armed' });
  const out = await handle(request('arm'));
  expect(out.xml).toContain('input="dtmf"');
  expect(out.xml).toContain('numDigits="1"');
  expect(out.xml).toContain('actionOnEmptyResult="true"');
  expect(out.xml).not.toContain('<Say');
});

test('binds the signature to the exact phase and rejects an early digit', async () => {
  const { handle, advance } = setup({ state: 'committed' });
  const spoofed = { ...request('read'), path: new URL(callbackUrl(origin, id, 'result')).pathname };
  expect((await handle(spoofed)).status).toBe(403);
  expect((await handle(request('read', { Digits: '1' }))).status).toBe(403);
  expect((await handle(request('result', { AccountSid: 'AC' + 'b'.repeat(32), Digits: '1' }))).status).toBe(403);
  expect(advance).not.toHaveBeenCalled();
});

test.each([['1', 'committed'], ['2', 'no_change'], ['', 'no_change'], [undefined, 'no_change']])(
  'passes signed result %s and speaks the durable state', async (digit, state) => {
    const { handle, advance } = setup({ state });
    const out = await handle(request('result', digit === undefined ? {} : { Digits: digit }));
    expect(advance).toHaveBeenCalledWith({ p_id: id, p_account_sid: accountSid, p_call_sid: callSid,
      p_from: fields.From, p_to: fields.To, p_phase: 'result', p_digit: digit ?? null });
    expect(out.state).toBe(state);
    expect(out.xml).toContain(state === 'committed' ? 'alteração foi confirmada' : 'reserva permaneceu');
  },
);

test('signed end events carry no consent and ignore nonterminal events', async () => {
  const { handle, advance } = setup({ state: 'no_change' });
  expect((await handle(request('end'))).status).toBe(204);
  expect(advance).not.toHaveBeenCalled();
  expect(await handle(request('end', { CallStatus: 'completed' }))).toEqual({ status: 204, state: 'no_change' });
  expect(advance).toHaveBeenCalledWith(expect.objectContaining({ p_phase: 'end', p_digit: null }));
});
