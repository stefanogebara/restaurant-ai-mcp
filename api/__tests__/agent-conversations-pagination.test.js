'use strict';

var queryResult;
var mockQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  single: jest.fn(),
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

test('call list returns only the fields needed for its rows', async () => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'list' } }, res);

  const columns = mockQuery.select.mock.calls[0][0].split(',').map(column => column.trim());
  expect(columns).toEqual([
    'id', 'conversation_id', 'caller_phone', 'called_phone', 'started_at',
    'duration_seconds', 'language', 'outcome', 'customer_name', 'party_size',
  ]);
  expect(res.status).toHaveBeenCalledWith(200);
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

test('conversation detail can load against the deployed call schema', async () => {
  mockQuery.single.mockImplementation(async () => {
    const columns = mockQuery.select.mock.calls.at(-1)[0];
    if (columns.split(',').map(x => x.trim()).includes('ai_notes')) {
      return { data: null, error: { code: '42703', message: 'column agent_conversations.ai_notes does not exist' } };
    }
    return { data: { id: 'call-1', transcript: [] }, error: null };
  });
  const res = response();
  await handler({ method: 'GET', query: { action: 'get', id: 'call-1' } }, res);

  expect(mockQuery.eq).toHaveBeenCalledWith('restaurant_info_id', 'owned');
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ success: true, conversation: { id: 'call-1', transcript: [] } });
});
