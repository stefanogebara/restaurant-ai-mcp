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
  throw new Error('The retired revenue endpoint must not load an admin DB client');
});

const handler = require('../revenue');

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

test('does not expose the retired route without authentication', async () => {
  mockVerifyAuth.mockResolvedValueOnce({ error: 'Authentication required', status: 401 });
  const res = response();
  await handler({ method: 'GET', query: { action: 'list' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ error: 'legacy_revenue_endpoint_retired' }));
});

test('requires an authenticated restaurant context', async () => {
  mockVerifyAuth.mockResolvedValueOnce({ user: { sub: 'owner-1' } });
  const res = response();
  await handler({ method: 'GET', query: { action: 'list' } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
});

test.each([
  ['POST', 'create'],
  ['GET', 'list'],
  ['PATCH', 'update'],
  ['DELETE', 'delete'],
  ['GET', 'stats'],
  ['GET', 'customer-search'],
])('%s %s fails closed without querying or mutating the database', async (method, action) => {
  const res = response();
  await handler({ method, query: { action }, body: { id: 'other-restaurant-record' } }, res);
  expect(res.status).toHaveBeenCalledWith(410);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: false,
    error: 'legacy_revenue_endpoint_retired',
  }));
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

test('preflight and rate limits return before auth', async () => {
  const res = response();
  mockPreflight.mockReturnValueOnce(true);
  await handler({ method: 'OPTIONS' }, res);
  expect(mockVerifyAuth).not.toHaveBeenCalled();

  mockRateLimit.mockResolvedValueOnce(true);
  await handler({ method: 'GET' }, res);
  expect(mockVerifyAuth).not.toHaveBeenCalled();
});
