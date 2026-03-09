var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

function makeChain(data) {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn(), update: jest.fn() };
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

const handler = require('../staffing-config');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
});

it('GET returns staffing_config', async () => {
  const config = { roles: [{ name: 'FOH', covers_per_staff: 15 }] };
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ staffing_config: config }));
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith({ staffing_config: config });
});

it('PATCH updates staffing_config', async () => {
  const newConfig = { roles: [{ name: 'FOH', covers_per_staff: 12 }] };
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ staffing_config: newConfig }));
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: newConfig,
  }, res);
  expect(res.json).toHaveBeenCalledWith({ staffing_config: newConfig });
});

it('PATCH returns 400 when roles is not an array', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { roles: 'not-array' },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('PATCH returns 400 when a role is missing covers_per_staff', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { roles: [{ name: 'FOH' }] },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('PATCH returns 400 when a role is missing name', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { roles: [{ covers_per_staff: 15 }] },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer bad' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for DELETE', async () => {
  const res = mockRes();
  await handler({ method: 'DELETE', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
