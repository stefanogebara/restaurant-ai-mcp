'use strict';
const http = require('node:http');
const WebSocket = require('ws');
const twilio = require('twilio');
const mockLookup = jest.fn(), mockConnect = jest.fn(), mockAudio = jest.fn();
const records = new Map();
const mockEval = jest.fn(async (_script, keys, args) => {
  if (keys.length === 2) {
    if (records.has(keys[0])) return records.get(keys[0]);
    records.set(keys[0], args[0]); records.set(keys[1], args[1]); return args[0];
  }
  const value = records.get(keys[0]); records.delete(keys[0]); return value || null;
});
jest.mock('../_lib/redis-client', () => ({ createRedisClient: () => ({ eval: mockEval }) }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
jest.mock('../_lib/restaurant-loader', () => ({ getRestaurantById: mockLookup }));
jest.mock('../_lib/persona-prompt-builder', () => ({ buildPersonaPrompt: () => 'Synthetic policy', buildFirstMessage: () => 'Hello' }));
jest.mock('../_services/guestMemory', () => ({ buildGuestContext: async () => '' }));
jest.mock('../_voice-server/tool-handler', () => ({ executeToolCall: jest.fn() }));
jest.mock('../_voice-server/audio-converter', () => ({ twilioToOpenAI: x => x, openAIToTwilio: x => x }));
jest.mock('../_voice-server/backends/openai-realtime', () => class {
  constructor() { this.connected = true; }
  connect = mockConnect; sendAudio = mockAudio;
  onAudioResponse() {} onToolCall() {} onTranscript() {} onError() {} onDisconnect() {} disconnect() {}
});
const { createVoiceServer } = require('../_voice-server/ws-server');
const { issueVoiceStreamGrant } = require('../_lib/voice-stream-auth');
const { getSession } = require('../_voice-server/session-manager');
const restaurantId = '00000000-0000-4000-8000-000000000001';
const callSid = `CA${'1'.repeat(32)}`, accountSid = `AC${'2'.repeat(32)}`, streamSid = `MZ${'3'.repeat(32)}`;
const wsUrl = 'wss://voice.example.test/ws', authToken = 'synthetic-voice-test-secret';
const envKeys = ['VOICE_WS_URL', 'TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID'];
const envBefore = envKeys.map(key => process.env[key]);
let server, wss, local, clients;
beforeEach(async () => {
  records.clear(); jest.clearAllMocks(); clients = [];
  process.env.VOICE_WS_URL = wsUrl; process.env.TWILIO_AUTH_TOKEN = authToken; process.env.TWILIO_ACCOUNT_SID = accountSid;
  mockLookup.mockResolvedValue({ restaurant_name: 'Synthetic', voice_engine: 'openai_realtime' });
  mockConnect.mockResolvedValue(); mockAudio.mockResolvedValue();
  server = http.createServer(); wss = createVoiceServer({ server });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  local = `ws://127.0.0.1:${server.address().port}/ws`;
});
afterEach(async () => {
  for (const client of clients) client.terminate();
  for (const client of wss.clients) client.terminate();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
});
afterAll(() => envKeys.forEach((key, i) => { if (envBefore[i] === undefined) delete process.env[key]; else process.env[key] = envBefore[i]; }));
function connect(signature = twilio.getExpectedTwilioSignature(authToken, wsUrl, {})) {
  const client = new WebSocket(local, { headers: signature === null ? {} : { 'x-twilio-signature': signature } });
  clients.push(client);
  return new Promise((resolve, reject) => { client.once('open', () => resolve(client)); client.once('error', reject); });
}
async function startMessage(overrides = {}) {
  const token = await issueVoiceStreamGrant({ restaurantId, callerNumber: '+15555550123', callSid, accountSid, wsUrl });
  return { event: 'start', streamSid, start: { streamSid, callSid, accountSid,
    customParameters: { restaurant_id: restaurantId, caller_number: '+15555550123', call_sid: callSid, stream_grant: token }, ...overrides } };
}
const closed = client => new Promise(resolve => client.once('close', code => resolve(code)));
it.each([null, 'forged'])('rejects unauthenticated socket before lookup or provider work %#', async signature => {
  await expect(connect(signature)).rejects.toThrow('401');
  expect(mockLookup).not.toHaveBeenCalled(); expect(mockConnect).not.toHaveBeenCalled();
});
it('rejects signed socket without a grant before tenant lookup', async () => {
  const client = await connect(), closure = closed(client);
  client.send(JSON.stringify({ event: 'start', start: { streamSid, callSid, accountSid, customParameters: { restaurant_id: restaurantId } } }));
  expect(await closure).toBe(1008);
  expect(mockLookup).not.toHaveBeenCalled(); expect(mockConnect).not.toHaveBeenCalled();
});
it('rejects spoofed restaurant even with a provider-signed upgrade', async () => {
  const client = await connect(), closure = closed(client), message = await startMessage();
  message.start.customParameters.restaurant_id = 'other-tenant'; client.send(JSON.stringify(message));
  expect(await closure).toBe(1008); expect(mockLookup).not.toHaveBeenCalled();
});
it('valid signed flow uses bound tenant and prevents grant replay and cross-stream audio', async () => {
  const message = await startMessage();
  const connected = new Promise(resolve => mockConnect.mockImplementationOnce(async () => resolve()));
  const client = await connect(); client.send(JSON.stringify(message)); await connected;
  expect(mockLookup).toHaveBeenCalledWith(restaurantId); expect(mockConnect).toHaveBeenCalledTimes(1);
  const replay = await connect(), replayClosed = closed(replay);
  replay.send(JSON.stringify(message)); expect(await replayClosed).toBe(1008);
  expect(getSession(streamSid)).not.toBeNull(); // rejected replay cannot clean up the valid session
  expect(mockLookup).toHaveBeenCalledTimes(1);
  const audioSent = new Promise(resolve => mockAudio.mockImplementationOnce(async () => resolve()));
  client.send(JSON.stringify({ event: 'media', streamSid, media: { payload: 'AAAA' } }));
  await audioSent;
  expect(mockAudio).toHaveBeenCalledWith('AAAA');
  const closure = closed(client);
  client.send(JSON.stringify({ event: 'media', streamSid: `MZ${'9'.repeat(32)}`, media: { payload: 'AAAA' } }));
  expect(await closure).toBe(1008); expect(mockAudio).toHaveBeenCalledTimes(1);
});
it('accepts media arriving immediately after start while authentication and backend setup run', async () => {
  const message = await startMessage();
  const client = await connect();
  const outcome = Promise.race([
    new Promise(resolve => mockAudio.mockImplementationOnce(async () => resolve('audio'))),
    new Promise(resolve => client.once('close', () => resolve('closed'))),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 1000)),
  ]);
  client.send(JSON.stringify(message));
  client.send(JSON.stringify({ event: 'media', streamSid, media: { payload: 'AAAA' } }));
  expect(await outcome).toBe('audio');
});
it('rejects repeated starts instead of replacing the original session', async () => {
  const connected = new Promise(resolve => mockConnect.mockImplementationOnce(async () => resolve()));
  const client = await connect(), message = await startMessage();
  client.send(JSON.stringify(message)); await connected;
  const closure = closed(client); client.send(JSON.stringify(message));
  expect(await closure).toBe(1008); expect(mockConnect).toHaveBeenCalledTimes(1);
});
it('fails closed when replay storage fails without touching a restaurant', async () => {
  const message = await startMessage(), client = await connect(), closure = closed(client);
  mockEval.mockRejectedValueOnce(new Error('synthetic redis outage'));
  client.send(JSON.stringify(message)); expect(await closure).toBe(1008);
  expect(mockLookup).not.toHaveBeenCalled();
});

it('does not destroy another socket session when a fresh grant tries a colliding stream ID', async () => {
  const connected = new Promise(resolve => mockConnect.mockImplementationOnce(async () => resolve()));
  const original = await connect(), message = await startMessage(); original.send(JSON.stringify(message)); await connected;
  const nextCall = `CA${'8'.repeat(32)}`;
  const token = await issueVoiceStreamGrant({ restaurantId, callerNumber: '+15555550123', callSid: nextCall, accountSid, wsUrl });
  const attacker = await connect(), closure = closed(attacker);
  attacker.send(JSON.stringify({ ...message, start: { ...message.start, callSid: nextCall,
    customParameters: { ...message.start.customParameters, call_sid: nextCall, stream_grant: token } } }));
  expect(await closure).toBe(1008);
  expect(getSession(streamSid)).not.toBeNull(); expect(mockLookup).toHaveBeenCalledTimes(1);
});
