'use strict';
const mockCreateRedis = jest.fn();
jest.mock('../_lib/redis-client', () => ({ createRedisClient: mockCreateRedis }));
const twilio = require('twilio');
const accountSid = `AC${'a'.repeat(32)}`, callSid = `CA${'b'.repeat(32)}`, streamSid = `MZ${'c'.repeat(32)}`;
const restaurantId = '00000000-0000-4000-8000-000000000001';
const wsUrl = 'wss://voice.example.test/ws';
const authToken = 'synthetic-twilio-token-not-real';
const envKeys = ['VOICE_WS_URL', 'TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID'];
const saved = envKeys.map(key => process.env[key]);
let auth, records, mockEval;
const input = () => ({ restaurantId, callerNumber: '+15555550123', accountSid, callSid, wsUrl });
const start = token => ({ streamSid, callSid, accountSid, customParameters: { restaurant_id: restaurantId, caller_number: '+15555550123', call_sid: callSid, stream_grant: token } });
beforeEach(() => {
  jest.resetModules(); records = new Map();
  process.env.VOICE_WS_URL = wsUrl; process.env.TWILIO_AUTH_TOKEN = authToken; process.env.TWILIO_ACCOUNT_SID = accountSid;
  mockEval = jest.fn(async (script, keys, args) => {
    if (keys.length === 2) {
      if (records.has(keys[0])) return records.get(keys[0]);
      records.set(keys[0], args[0]); records.set(keys[1], args[1]); return args[0];
    }
    const record = records.get(keys[0]); records.delete(keys[0]); return record || null;
  });
  mockCreateRedis.mockReset().mockReturnValue({ eval: mockEval });
  auth = require('../_lib/voice-stream-auth');
});
afterAll(() => envKeys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
it('accepts a provider signature for canonical WSS/HTTPS upgrade, ignoring untrusted host headers', () => {
  for (const url of [wsUrl, wsUrl.replace('wss:', 'https:'), `${wsUrl}/`]) {
    const signature = twilio.getExpectedTwilioSignature(authToken, url, {});
    expect(auth.verifyVoiceUpgrade({ method: 'GET', url: '/ws', headers: { host: 'proxy-internal', 'x-forwarded-host': 'evil.example', 'x-twilio-signature': signature } })).toBe(true);
  }
});
it.each([undefined, '', 'forged', ['signature']].map(signature => [signature]))('rejects missing or malformed signature %#', signature => {
  expect(auth.verifyVoiceUpgrade({ method: 'GET', url: '/ws', headers: { 'x-twilio-signature': signature } })).toBe(false);
});
it('rejects alternate path/query/host signatures and missing configuration', () => {
  const signature = twilio.getExpectedTwilioSignature(authToken, 'wss://evil.example/ws', {});
  expect(auth.verifyVoiceUpgrade({ method: 'GET', url: '/ws', headers: { 'x-twilio-signature': signature } })).toBe(false);
  for (const url of ['/ws?restaurant=evil', '/ws/']) expect(auth.verifyVoiceUpgrade({ method: 'GET', url, headers: {} })).toBe(false);
  delete process.env.VOICE_WS_URL;
  expect(auth.verifyVoiceUpgrade({ method: 'GET', url: '/ws', headers: {} })).toBe(false);
});
it('issues an opaque bounded grant, consumes it once and binds trusted identity', async () => {
  const token = await auth.issueVoiceStreamGrant(input());
  expect(token.length).toBe(43);
  expect(mockEval.mock.calls[0][2].slice(2)).toEqual([604800, 120]);
  await expect(auth.consumeVoiceStreamGrant(start(token))).resolves.toEqual({ restaurantId, callerNumber: '+15555550123', callSid });
  await expect(auth.consumeVoiceStreamGrant(start(token))).rejects.toThrow('VOICE_STREAM_UNAUTHORIZED');
});
it.each(['empty', 'omitted'])('allows a call with withheld caller ID when the stream parameter is %s', async form => {
  const token = await auth.issueVoiceStreamGrant({ ...input(), callerNumber: undefined });
  const message = start(token);
  if (form === 'empty') message.customParameters.caller_number = '';
  else delete message.customParameters.caller_number;
  await expect(auth.consumeVoiceStreamGrant(message)).resolves.toEqual({
    restaurantId, callerNumber: '', callSid,
  });
});
it('webhook retry cannot overwrite or recreate a consumed grant', async () => {
  const token = await auth.issueVoiceStreamGrant(input());
  expect(await auth.issueVoiceStreamGrant(input())).toBe(token);
  await auth.consumeVoiceStreamGrant(start(token));
  expect(await auth.issueVoiceStreamGrant(input())).toBe(token);
  await expect(auth.consumeVoiceStreamGrant(start(token))).rejects.toThrow();
  expect(records.size).toBe(1); // replay tombstone only
});
it.each(['restaurant_id', 'caller_number', 'call_sid'])('rejects spoofed %s before returning tenant scope', async key => {
  const token = await auth.issueVoiceStreamGrant(input());
  const message = start(token); message.customParameters[key] = 'forged';
  await expect(auth.consumeVoiceStreamGrant(message)).rejects.toThrow('VOICE_STREAM_UNAUTHORIZED');
});
it('rejects account/call mismatch, expired token and alternative receiver', async () => {
  let token = await auth.issueVoiceStreamGrant(input());
  await expect(auth.consumeVoiceStreamGrant({ ...start(token), callSid: `CA${'d'.repeat(32)}` })).rejects.toThrow();
  records.clear(); token = await auth.issueVoiceStreamGrant(input());
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 121000);
  await expect(auth.consumeVoiceStreamGrant(start(token))).rejects.toThrow(); now.mockRestore();
  records.clear(); token = await auth.issueVoiceStreamGrant(input());
  process.env.VOICE_WS_URL = 'wss://another.example/ws';
  await expect(auth.consumeVoiceStreamGrant(start(token))).rejects.toThrow();
});
it('fails closed without shared storage or on storage failure', async () => {
  mockCreateRedis.mockReturnValue(null);
  await expect(auth.issueVoiceStreamGrant(input())).rejects.toThrow('VOICE_STREAM_UNAVAILABLE');
  mockCreateRedis.mockReturnValue({ eval: mockEval }); mockEval.mockRejectedValue(new Error('private endpoint secret'));
  await expect(auth.issueVoiceStreamGrant(input())).rejects.toThrow('VOICE_STREAM_UNAVAILABLE');
});
it.each(['ws://voice.example/ws', 'wss://voice.example/ws?token=x', 'wss://user:secret@voice.example/ws'])('rejects unsafe destination %#', async url => {
  process.env.VOICE_WS_URL = url;
  await expect(auth.issueVoiceStreamGrant({ ...input(), wsUrl: url })).rejects.toThrow();
  expect(mockEval).not.toHaveBeenCalled();
});
