'use strict';
const mockIssueGrant = jest.fn(), mockRestaurant = jest.fn(), mockSchema = jest.fn();
jest.mock('../_lib/voice-stream-auth', () => ({ issueVoiceStreamGrant: mockIssueGrant }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { schema: mockSchema } }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
jest.mock('../_lib/cors', () => ({ setWebhookCors() {}, handlePreflight: () => false }));
const twilio = require('twilio');
const authToken = 'synthetic-twilio-token', accountSid = `AC${'a'.repeat(32)}`, callSid = `CA${'b'.repeat(32)}`;
const restaurantId = '00000000-0000-4000-8000-000000000001';
const wsUrl = 'wss://voice.example.test/ws';
const envKeys = ['TWILIO_AUTH_TOKEN', 'VOICE_WS_URL', 'ELEVENLABS_API_KEY'];
const envBefore = envKeys.map(key => process.env[key]);
let handler;
beforeEach(() => {
  jest.clearAllMocks(); process.env.TWILIO_AUTH_TOKEN = authToken; process.env.VOICE_WS_URL = wsUrl;
  mockIssueGrant.mockReset().mockResolvedValue('synthetic-single-use-grant');
  mockRestaurant.mockReset().mockResolvedValue({ id: restaurantId, restaurant_name: 'Synthetic', voice_engine: 'openai_realtime', voice_engine_status: 'active' });
  mockSchema.mockImplementation(() => ({ from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, filter() { return this; },
      neq() { return this; }, in() { return this; },
      limit: () => mockRestaurant().then(data => ({ data: [{
        ...data,
        ai_config: { phone: { number: '+15555550999', status: 'active', number_id: 'PNsynthetic' } },
      }] })),
      maybeSingle: () => table === 'voice_ab_tests' ? Promise.resolve({ data: null }) : mockRestaurant().then(data => ({ data })),
    };
    return query;
  } }));
  jest.isolateModules(() => { handler = require('../twilio-voice-connect'); });
});
afterAll(() => envKeys.forEach((key, i) => { if (envBefore[i] === undefined) delete process.env[key]; else process.env[key] = envBefore[i]; }));
function request(body = { To: '+15555550999', From: '+15555550123', CallSid: callSid, AccountSid: accountSid }) {
  const req = { method: 'POST', url: '/api/twilio-voice-connect', headers: { host: 'example.test' }, body };
  req.headers['x-twilio-signature'] = twilio.getExpectedTwilioSignature(authToken, `https://example.test${req.url}`, body);
  return req;
}
function response() { return { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() }; }
it('authenticated OpenAI call embeds one call-bound grant in TwiML custom parameters', async () => {
  const req = request(), res = response(); await handler(req, res);
  expect(mockIssueGrant).toHaveBeenCalledWith({ restaurantId, callerNumber: req.body.From, callSid, accountSid, wsUrl });
  expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<Parameter name="stream_grant" value="synthetic-single-use-grant" />'));
  expect(res.send.mock.calls[0][0]).toContain(`<Stream url="${wsUrl}">`);
});
it.each([undefined, 'forged', ['duplicate-signature']].map(signature => [signature]))('rejects invalid HTTP signature before lookup or grant minting %#', async signature => {
  const req = request(), res = response(); req.headers['x-twilio-signature'] = signature;
  await handler(req, res); expect(res.status).toHaveBeenCalledWith(403);
  expect(mockSchema).not.toHaveBeenCalled(); expect(mockIssueGrant).not.toHaveBeenCalled();
});
it('does not accept unsigned query fallback call identifiers', async () => {
  const req = request({}), res = response(); req.query = { To: '+15555550999', CallSid: callSid };
  await handler(req, res); expect(mockSchema).not.toHaveBeenCalled(); expect(mockIssueGrant).not.toHaveBeenCalled();
});
it('returns safe spoken error without opening stream when shared authorization store is unavailable', async () => {
  mockIssueGrant.mockRejectedValueOnce(new Error('VOICE_STREAM_UNAVAILABLE'));
  const res = response(); await handler(request(), res);
  expect(res.send.mock.calls[0][0]).toContain('<Hangup />');
  expect(res.send.mock.calls[0][0]).not.toContain('<Stream');
});
it('leaves ElevenLabs managed route independent of new grant configuration', async () => {
  mockRestaurant.mockResolvedValueOnce({ id: restaurantId, restaurant_name: 'Synthetic', voice_engine: 'elevenlabs' });
  const res = response(); await handler(request(), res);
  expect(mockIssueGrant).not.toHaveBeenCalled();
  expect(res.send.mock.calls[0][0]).toContain('not yet configured');
});
it('rejects non-POST calls', async () => {
  const req = request(), res = response(); req.method = 'GET'; await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(405); expect(mockSchema).not.toHaveBeenCalled();
});
