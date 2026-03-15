var mockVerifyJWT = jest.fn();
var mockComparePeriods = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/periodCompare', () => ({
  comparePeriods: (...a) => mockComparePeriods(...a),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

const handler = require('../analytics/compare');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.getHeader = jest.fn();
  return res;
}

const MOCK_RESULT = {
  period_a: { label: 'last_week', reservations: 10, covers: 30 },
  period_b: { label: 'this_week', reservations: 12, covers: 38 },
  delta: { reservations: 2, covers: 8, covers_pct: 26.7 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
  mockComparePeriods.mockResolvedValue(MOCK_RESULT);
});

it('GET returns comparison result with success:true', async () => {
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
    query: { period_a: 'last_week', period_b: 'this_week' },
  };
  const res = mockRes();

  await handler(req, res);

  expect(mockComparePeriods).toHaveBeenCalledWith('rest-1', 'last_week', 'this_week');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it('defaults to last_week vs this_week when query params omitted', async () => {
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
    query: {},
  };
  const res = mockRes();

  await handler(req, res);

  expect(mockComparePeriods).toHaveBeenCalledWith('rest-1', 'last_week', 'this_week');
});

it('returns 400 for invalid period label', async () => {
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer token' },
    query: { period_a: 'next_year', period_b: 'this_week' },
  };
  const res = mockRes();

  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Invalid period') }));
  expect(mockComparePeriods).not.toHaveBeenCalled();
});

it('returns 401 when JWT is invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });

  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer bad' },
    query: {},
  };
  const res = mockRes();

  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for non-GET methods', async () => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    query: {},
  };
  const res = mockRes();

  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(405);
});
