const mockVerifyAuth = jest.fn();
const mockRateLimit = jest.fn();
const mockPreflight = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyAuth: mockVerifyAuth }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: mockRateLimit }));
jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: mockPreflight,
}));
jest.mock('../_lib/supabase', () => {
  throw new Error('Retired Customer DNA endpoint must not import a service-role DB client');
});

const handler = require('../customer-dna');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateLimit.mockResolvedValue(false);
  mockPreflight.mockReturnValue(false);
  mockVerifyAuth.mockResolvedValue({ user: { sub: 'owner-1', restaurant_id: 'restaurant-1' } });
});

test('requires authentication', async () => {
  mockVerifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });
  const res = response();
  await handler({ method: 'GET', query: { action: 'profile' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

test('requires an authenticated restaurant context', async () => {
  mockVerifyAuth.mockResolvedValueOnce({ user: { sub: 'owner-1' } });
  const res = response();
  await handler({ method: 'GET', query: { action: 'profile' } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
});

test.each([
  ['GET', 'profile'],
  ['GET', 'list'],
  ['GET', 'get'],
  ['GET', 'stats'],
  ['GET', 'search'],
  ['GET', 'occasions'],
  ['GET', 'predictions'],
  ['GET', 'companions'],
  ['POST', 'analyze'],
  ['POST', 'analyze-all'],
])('%s %s fails closed without loading global profile data', async (method, action) => {
  const res = response();
  await handler({ method, query: { action, customer_id: 'another-house-guest' } }, res);
  expect(res.status).toHaveBeenCalledWith(410);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: false,
    error: 'legacy_customer_dna_endpoint_retired',
  }));
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

test('preflight and rate limit return before authentication', async () => {
  const res = response();
  mockPreflight.mockReturnValueOnce(true);
  await handler({ method: 'OPTIONS' }, res);
  expect(mockVerifyAuth).not.toHaveBeenCalled();

  mockRateLimit.mockResolvedValueOnce(true);
  await handler({ method: 'GET' }, res);
  expect(mockVerifyAuth).not.toHaveBeenCalled();
});
