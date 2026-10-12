const mockVerifyAuth = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyAuth: mockVerifyAuth }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn() }));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn(async (_req, _res, next) => next()),
  requireFeature: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: jest.fn(() => { throw new Error('Retired trends must not query the database'); }) },
}));

const handler = require('../ltv');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyAuth.mockResolvedValue({ user: { restaurant_id: 'restaurant-1' } });
});

test('requires authentication before revealing retired action', async () => {
  mockVerifyAuth.mockResolvedValueOnce({ error: 'Authentication required', status: 401 });
  const res = response();
  await handler({ method: 'GET', query: { action: 'trends' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ error: 'ltv_trends_retired' }));
});

test('retires obsolete trends without reading customer or revenue data', async () => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'trends' } }, res);
  expect(res.status).toHaveBeenCalledWith(410);
  expect(res.json).toHaveBeenCalledWith({ success: false, error: 'ltv_trends_retired' });
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

test('does not advertise the retired action', async () => {
  const res = response();
  await handler({ method: 'GET', query: {} }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    available_actions: ['calculate-all', 'get', 'list', 'stats'],
  }));
});
