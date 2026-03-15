var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

function makeChain(data) {
  const chain = {
    select: jest.fn(), eq: jest.fn(), single: jest.fn(),
    update: jest.fn(), schema: jest.fn(),
  };
  chain.schema.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data, error: null });
  return chain;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const handler = require('../voice-persona');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ agent_name: 'Sofia', agent_greeting: 'Welcome!' }));
});

it('GET returns agent_name and agent_greeting', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith({ agent_name: 'Sofia', agent_greeting: 'Welcome!' });
});

it('PATCH updates agent_name and agent_greeting', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'Marco', agent_greeting: 'Ciao!' },
  }, res);
  expect(res.json).toHaveBeenCalledWith({ agent_name: 'Sofia', agent_greeting: 'Welcome!' });
});

it('PATCH returns 400 when agent_name exceeds 50 chars', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'A'.repeat(51) },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('PATCH returns 400 when agent_greeting exceeds 200 chars', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_greeting: 'X'.repeat(201) },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for DELETE', async () => {
  const res = mockRes();
  await handler({ method: 'DELETE', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
