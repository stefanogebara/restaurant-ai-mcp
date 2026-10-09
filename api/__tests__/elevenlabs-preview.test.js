jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn().mockResolvedValue({ user: { restaurant_id: 'rest-1' } }) }));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn(async (_req, _res, next) => next()),
  requireFeature: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), error: jest.fn() }) }));
jest.mock('../_lib/validation', () => ({ validateElevenLabsVoiceId: () => ({ valid: true }) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));

const handler = require('../elevenlabs-preview');
const originalKey = process.env.ELEVENLABS_API_KEY;

function request(text) {
  const req = { method: 'POST', body: { voice_id: 'voice-1', text } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'test-only';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('audio') });
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalKey;
  delete global.fetch;
});

test.each(['', '  ', 'x'.repeat(241), { value: 'hello' }])('rejects invalid audition text before TTS', async (text) => {
  const { req, res } = request(text);
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('sends the trimmed audition line to TTS', async () => {
  const { req, res } = request('  Boa noite, posso ajudar?  ');
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).text).toBe('Boa noite, posso ajudar?');
});
