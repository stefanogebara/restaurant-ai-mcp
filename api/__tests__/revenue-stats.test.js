var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.getHeader = jest.fn();
  return res;
}

const handler = require('../revenue-stats');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
});

it('GET returns avg_spend_per_cover and data_points from service_records', async () => {
  const rows = [
    { total_bill: 120, party_size: 4 },
    { total_bill: 90,  party_size: 3 },
    { total_bill: 150, party_size: 5 },
    { total_bill: 80,  party_size: 2 },
    { total_bill: 100, party_size: 4 },
  ];
  const chain = { select: jest.fn(), eq: jest.fn(), not: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockResolvedValue({ data: rows, error: null });
  mockSupabaseAdmin.from.mockReturnValue(chain);

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    avg_spend_per_cover: expect.any(Number),
    data_points: 5,
    using_default: false,
  }));
});

it('GET returns default avg_spend when fewer than 5 data points', async () => {
  const chain = { select: jest.fn(), eq: jest.fn(), not: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockResolvedValue({ data: [{ total_bill: 100, party_size: 2 }], error: null });
  mockSupabaseAdmin.from.mockReturnValue(chain);

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);

  const call = res.json.mock.calls[0][0];
  expect(call.using_default).toBe(true);
  expect(call.avg_spend_per_cover).toBe(80);
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
