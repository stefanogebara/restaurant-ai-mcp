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
jest.mock('../_lib/subscription-middleware', () => ({
  inlineCheckSubscription: jest.fn().mockResolvedValue(false),
  softCheckSubscription: jest.fn().mockResolvedValue(false),
  checkSubscriptionByRestaurantId: jest.fn().mockResolvedValue({ active: true, plan: 'growth', status: 'active' }),
  inlineRequireFeature: jest.fn().mockReturnValue(false),
  checkSubscription: jest.fn((req, res, next) => next()),
  requireFeature: jest.fn(() => (req, res, next) => next()),
  checkReservationLimits: jest.fn((req, res, next) => next()),
  isDemoRestaurant: jest.fn().mockResolvedValue(false),
}));

function makeConfigChain(staffing_config) {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: { staffing_config }, error: null });
  return chain;
}

function makeResChain(rows) {
  const chain = { select: jest.fn(), eq: jest.fn(), gte: jest.fn(), lt: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.lt.mockResolvedValue({ data: rows, error: null });
  return chain;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const handler = require('../staffing-forecast');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer bad' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for POST', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

it('returns forecast array with role headcounts', async () => {
  const roles = [{ name: 'FOH', covers_per_staff: 15 }];
  let call = 0;
  mockSupabaseAdmin.from.mockImplementation(() => {
    call++;
    if (call === 1) return makeConfigChain({ roles });
    return makeResChain([{ date: new Date().toISOString().split('T')[0], party_size: 30 }]);
  });

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ forecast: expect.any(Array) })
  );
  const { forecast } = res.json.mock.calls[0][0];
  expect(forecast).toHaveLength(7);
  expect(forecast[0].roles[0].name).toBe('FOH');
});

it('uses default roles when no staffing_config set', async () => {
  let call = 0;
  mockSupabaseAdmin.from.mockImplementation(() => {
    call++;
    if (call === 1) return makeConfigChain(null);
    return makeResChain([]);
  });

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ forecast: expect.any(Array) })
  );
  const { forecast } = res.json.mock.calls[0][0];
  // Default roles: FOH, BOH, Bar
  expect(forecast[0].roles.map(r => r.name)).toEqual(['FOH', 'BOH', 'Bar']);
});
