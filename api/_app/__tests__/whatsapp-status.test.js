jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));

const handler = require('../whatsapp-status');
const { verifyAuth } = require('../_lib/auth');
const savedToken = process.env.WHATSAPP_ACCESS_TOKEN;
const savedPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const savedFetch = global.fetch;

function request() {
  const req = { method: 'GET', headers: { authorization: 'Bearer owner' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_ACCESS_TOKEN = 'secret-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
  verifyAuth.mockResolvedValue({ user: { sub: 'owner' } });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ display_phone_number: '+15551234567', verified_name: 'Test Restaurant' }),
  });
});

afterAll(() => {
  if (savedToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
  else process.env.WHATSAPP_ACCESS_TOKEN = savedToken;
  if (savedPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  else process.env.WHATSAPP_PHONE_NUMBER_ID = savedPhoneId;
  global.fetch = savedFetch;
});

test('authenticates before probing Meta', async () => {
  verifyAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
  const { req, res } = request();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('sends the token only in the Authorization header, with a bounded signal', async () => {
  const { req, res } = request();
  await handler(req, res);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url.toString()).toContain('/123456789012345?fields=');
  expect(url.toString()).not.toContain('secret-token');
  expect(options.headers.Authorization).toBe('Bearer secret-token');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    meta: expect.objectContaining({ approved: true, phone_number: '+15551234567' }),
  }));
});

test('does not claim approval for a failed Meta response', async () => {
  global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'Invalid token' } }) });
  const { req, res } = request();
  await handler(req, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    meta: expect.objectContaining({ approved: false, error: 'Invalid token' }),
  }));
});

test('reports an aborted probe without exposing the token', async () => {
  global.fetch.mockRejectedValue(Object.assign(new Error('request aborted'), { name: 'AbortError' }));
  const { req, res } = request();
  await handler(req, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    meta: expect.objectContaining({ approved: false, error: 'Meta API timed out' }),
  }));
});
