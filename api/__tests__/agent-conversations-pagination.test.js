'use strict';

var queryResult;
var mockQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
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
    'id', 'conversation_id', 'caller_phone', 'called_phone', 'started_at', 'ended_at',
    'duration_seconds', 'language', 'outcome', 'customer_name', 'party_size',
  ]);
  expect(res.status).toHaveBeenCalledWith(200);
});

test('list preserves completion markers for finished and unfinished calls without a recorded duration', async () => {
  const rows = [
    { id: 'finished', started_at: '2026-11-09T13:00:00Z', ended_at: '2026-11-09T13:01:00Z', duration_seconds: null, language: 'pt', transcript: ['detail-only'] },
    { id: 'unfinished', started_at: '2026-11-09T13:02:00Z', ended_at: null, duration_seconds: null, language: 'en', transcript: [] },
  ];
  // Model the Data API projection: omitted columns must not magically appear
  // in the response just because a fixture has them.
  mockQuery.then.mockImplementationOnce(resolve => {
    const columns = mockQuery.select.mock.calls[0][0].split(',').map(column => column.trim());
    return resolve({
      data: rows.map(row => Object.fromEntries(columns.filter(column => column in row).map(column => [column, row[column]]))),
      error: null,
      count: rows.length,
    });
  });
  const res = response();
  await handler({ method: 'GET', query: { action: 'list', channel: 'phone' } }, res);

  expect(res.status).toHaveBeenCalledWith(200);
  const { conversations } = res.json.mock.calls[0][0];
  expect(conversations).toEqual([
    { id: 'finished', started_at: '2026-11-09T13:00:00Z', ended_at: '2026-11-09T13:01:00Z', duration_seconds: null, language: 'pt' },
    { id: 'unfinished', started_at: '2026-11-09T13:02:00Z', ended_at: null, duration_seconds: null, language: 'en' },
  ]);
});

test('phone history requires caller or called number evidence', async () => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'list', channel: 'phone' } }, res);
  expect(mockQuery.or).toHaveBeenCalledWith('caller_phone.not.is.null,called_phone.not.is.null');
  expect(res.status).toHaveBeenCalledWith(200);
});

test('unclassified history stays accessible without being counted as phone calls', async () => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'list', channel: 'unclassified' } }, res);
  expect(mockQuery.is).toHaveBeenCalledWith('caller_phone', null);
  expect(mockQuery.is).toHaveBeenCalledWith('called_phone', null);
  expect(res.status).toHaveBeenCalledWith(200);
});

test('phone statistics use the same source filter as phone history', async () => {
  queryResult = { data: [], error: null };
  const res = response();
  await handler({ method: 'GET', query: { action: 'stats', channel: 'phone' } }, res);
  expect(mockQuery.or).toHaveBeenCalledWith('caller_phone.not.is.null,called_phone.not.is.null');
  expect(res.status).toHaveBeenCalledWith(200);
});

test('rejects an unsupported channel filter', async () => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'list', channel: 'other' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockQuery.range).not.toHaveBeenCalled();
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

test('an information call counts as completed without being called a booking', async () => {
  queryResult = { data: [
    { id: 'info', started_at: '2026-11-07T12:00:00Z', ended_at: '2026-11-07T12:01:20Z', duration_seconds: 80, outcome: 'information_only', successful_booking: false, language: 'pt', customer_sentiment: 'neutral' },
    { id: 'booking', started_at: '2026-11-07T12:01:00Z', ended_at: '2026-11-07T12:02:40Z', duration_seconds: 100, outcome: 'reservation_created', successful_booking: true, language: 'es', customer_sentiment: 'positive' },
    { id: 'failed', started_at: '2026-11-07T12:02:00Z', ended_at: '2026-11-07T12:02:10Z', duration_seconds: 10, outcome: 'error', successful_booking: false, language: 'en', customer_sentiment: null },
  ], error: null };
  const res = response();
  await handler({ method: 'GET', query: { action: 'stats', period: '90d' } }, res);

  expect(mockQuery.select.mock.calls[0][0]).toContain('language');
  const body = res.json.mock.calls[0][0];
  expect(body.stats.overview).toEqual(expect.objectContaining({
    total_calls: 3, successful_bookings: 1, completed_calls: 2, completion_rate: 66.7,
  }));
  expect(body.stats.breakdowns.by_language).toEqual({ pt: 1, es: 1, en: 1 });
});

test.each([
  { name: 'unfinished booked call', outcome: 'reservation_created', ended_at: null, booked: true, completed: 0 },
  { name: 'finalized booked call', outcome: 'reservation_created', ended_at: '2026-11-07T12:01:20Z', booked: true, completed: 1 },
  { name: 'completed information call', outcome: 'information_only', ended_at: '2026-11-07T12:01:20Z', booked: false, completed: 1 },
  { name: 'zero-second completed call', outcome: 'information_only', ended_at: '2026-11-07T12:00:00Z', duration_seconds: 0, booked: false, completed: 1 },
  { name: 'completed call without recorded duration', outcome: 'reservation_created', ended_at: '2026-11-07T12:01:20.000+00:00', duration_seconds: null, booked: true, completed: 1 },
  { name: 'ended error call', outcome: 'error', ended_at: '2026-11-07T12:01:20Z', booked: false, completed: 0 },
  { name: 'unfinished information call', outcome: 'information_only', ended_at: null, booked: false, completed: 0 },
  ...[undefined, '', '   ', 'not-a-date', '2026-99-07T12:01:20Z', 0, true, {}].map(ended_at => ({
    name: `booked call with invalid end time ${JSON.stringify(ended_at)}`,
    outcome: 'reservation_created', ended_at, booked: true, completed: 0,
  })),
])('completion statistics: $name', async ({ outcome, ended_at, duration_seconds = 80, booked, completed }) => {
  const row = {
    id: 'call', started_at: '2026-11-07T12:00:00Z', duration_seconds,
    outcome, successful_booking: booked, language: 'pt',
    ...(ended_at === undefined ? {} : { ended_at }),
  };
  // Match the Data API projection so the test also requires selecting ended_at.
  mockQuery.then.mockImplementationOnce(resolve => {
    const columns = mockQuery.select.mock.calls[0][0].split(',').map(column => column.trim());
    return resolve({
      data: [Object.fromEntries(columns.filter(column => column in row).map(column => [column, row[column]]))],
      error: null,
    });
  });
  const res = response();
  await handler({ method: 'GET', query: { action: 'stats', period: '90d', channel: 'phone' } }, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockQuery.eq).toHaveBeenCalledWith('restaurant_info_id', 'owned');
  expect(mockQuery.or).toHaveBeenCalledWith('caller_phone.not.is.null,called_phone.not.is.null');
  expect(res.json.mock.calls[0][0].stats.overview).toEqual({
    total_calls: 1,
    successful_bookings: Number(booked),
    success_rate: booked ? 100 : 0,
    completed_calls: completed,
    completion_rate: completed * 100,
    average_duration_seconds: duration_seconds || 0,
    average_duration_formatted: duration_seconds ? '1m 20s' : '0s',
  });
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
