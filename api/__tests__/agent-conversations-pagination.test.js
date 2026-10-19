'use strict';

var queryResult;
var mockQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  then: jest.fn((resolve) => resolve(queryResult)),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(() => mockQuery) } }));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn().mockResolvedValue({ user: { restaurant_id: 'owned' } }) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ error: jest.fn() }) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));

const handler = require('../agent-conversations');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryResult = { data: [{ id: 'page-two' }], error: null, count: 101 };
});

test('page two fetches exactly rows 50–99, not rows 50–5049', async () => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'list', limit: '50', offset: '50', date_from: '2026-10-05T12:00:00Z' } }, res);

  expect(mockQuery.eq).toHaveBeenCalledWith('restaurant_info_id', 'owned');
  expect(mockQuery.gte).toHaveBeenCalledWith('started_at', '2026-10-05T12:00:00Z');
  expect(mockQuery.range).toHaveBeenCalledWith(50, 99);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    pagination: { total: 101, limit: 50, offset: 50, has_more: true },
  }));
});

test.each([
  { limit: '0', offset: '0' },
  { limit: '101', offset: '0' },
  { limit: '50', offset: '-1' },
  { limit: '50', offset: '1.5' },
])('rejects invalid pagination: %p', async ({ limit, offset }) => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'list', limit, offset } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockQuery.range).not.toHaveBeenCalled();
});

test('statistics use the same exact rolling window across daylight saving changes', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
  try {
    queryResult = { data: [], error: null };
    const res = response();
    await handler({ method: 'GET', query: { action: 'stats', period: '1d' } }, res);
    expect(mockQuery.eq).toHaveBeenCalledWith('restaurant_info_id', 'owned');
    expect(mockQuery.gte).toHaveBeenCalledWith('started_at', '2026-03-29T12:00:00.000Z');
    expect(mockQuery.lte).toHaveBeenCalledWith('started_at', '2026-03-30T12:00:00.000Z');
    expect(res.status).toHaveBeenCalledWith(200);
  } finally {
    jest.useRealTimers();
  }
});
