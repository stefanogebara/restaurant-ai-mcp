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
  { name: 'unfinished booked call', outcome: 'reservation_created', ended_at: null, booked: true, completed: 0, average: 0 },
  { name: 'finalized booked call', outcome: 'reservation_created', ended_at: '2026-11-07T12:01:20Z', booked: true, completed: 1 },
  { name: 'completed information call', outcome: 'information_only', ended_at: '2026-11-07T12:01:20Z', booked: false, completed: 1 },
  { name: 'completed reschedule', outcome: 'reservation_modified', ended_at: '2026-11-07T12:01:20Z', booked: false, completed: 1 },
  { name: 'completed cancellation', outcome: 'reservation_cancelled', ended_at: '2026-11-07T12:01:20Z', booked: false, completed: 1 },
  { name: 'zero-second completed call', outcome: 'information_only', ended_at: '2026-11-07T12:00:00Z', duration_seconds: 0, booked: false, completed: 1, average: 0 },
  { name: 'completed call without recorded duration', outcome: 'reservation_created', ended_at: '2026-11-07T12:01:20.000+00:00', duration_seconds: null, booked: true, completed: 1, average: 0 },
  { name: 'ended error call', outcome: 'error', ended_at: '2026-11-07T12:01:20Z', booked: false, completed: 0 },
  { name: 'unfinished information call', outcome: 'information_only', ended_at: null, booked: false, completed: 0, average: 0 },
  ...[undefined, '', '   ', 'not-a-date', '2026-99-07T12:01:20Z', 0, true, {}].map(ended_at => ({
    name: `booked call with invalid end time ${JSON.stringify(ended_at)}`,
    outcome: 'reservation_created', ended_at, booked: true, completed: 0, average: 0,
  })),
])('completion statistics: $name', async ({ outcome, ended_at, duration_seconds = 80, booked, completed, average = 80 }) => {
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
    average_duration_seconds: average,
    average_duration_formatted: average ? '1m 20s' : '0s',
  });
});

describe('average call duration uses ended calls with recorded duration samples', () => {
  const endedCall = (id, duration_seconds, extra = {}) => ({
    id, started_at: '2026-11-10T12:00:00Z', ended_at: '2026-11-10T12:02:00Z',
    duration_seconds, outcome: 'information_only', successful_booking: false, ...extra,
  });
  async function overview(rows) {
    queryResult = { data: rows, error: null };
    const res = response();
    await handler({ method: 'GET', query: { action: 'stats', channel: 'phone', period: '90d' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockQuery.eq).toHaveBeenCalledWith('restaurant_info_id', 'owned');
    expect(mockQuery.or).toHaveBeenCalledWith('caller_phone.not.is.null,called_phone.not.is.null');
    return res.json.mock.calls.at(-1)[0].stats.overview;
  }

  test('starting call 119 changes total calls without lowering the 15-call average', async () => {
    const completed = Array.from({ length: 15 }, (_, i) => endedCall(`call-${i}`, 92));
    const before = await overview(completed);
    expect(before).toMatchObject({ total_calls: 15, completed_calls: 15, average_duration_seconds: 92 });

    const active = endedCall('call-119', null, { ended_at: null });
    const during = await overview([...completed, active]);
    expect(during).toMatchObject({
      total_calls: 16, completed_calls: 15, successful_bookings: 0,
      average_duration_seconds: 92, average_duration_formatted: '1m 32s',
    });
    expect(await overview([...completed, {
      ...active, ended_at: '2026-11-10T12:01:48Z', duration_seconds: 108,
    }])).toMatchObject({ total_calls: 16, completed_calls: 16, average_duration_seconds: 93, average_duration_formatted: '1m 33s' });
  });

  test.each([null, undefined, NaN, Infinity, -1, '180', '', false])(
    'excludes an ended call with unavailable or invalid duration %p from the denominator', async duration => {
      expect(await overview([endedCall('valid', 90), endedCall('invalid', duration)]))
        .toMatchObject({ total_calls: 2, completed_calls: 2, average_duration_seconds: 90, average_duration_formatted: '1m 30s' });
    },
  );

  test.each([null, '', 'not-a-date'])('excludes duration recorded before a valid end timestamp: %p', async ended_at => {
    expect(await overview([endedCall('finished', 90), endedCall('unfinished', 300, { ended_at })]))
      .toMatchObject({ total_calls: 2, completed_calls: 1, average_duration_seconds: 90 });
  });

  test('includes an actual zero-second sample and preserves ended error-call duration', async () => {
    expect(await overview([
      endedCall('zero', 0),
      endedCall('error', 120, { outcome: 'error' }),
      endedCall('booked', 60, { outcome: 'reservation_created', successful_booking: true }),
    ])).toMatchObject({
      total_calls: 3, completed_calls: 2, successful_bookings: 1,
      average_duration_seconds: 60, average_duration_formatted: '1m 0s',
    });
  });

  test.each([
    { durations: [87, 88], seconds: 88, formatted: '1m 28s' },
    { durations: [59, 60], seconds: 60, formatted: '1m 0s' },
  ])('formats the same rounded $seconds seconds returned by the API', async ({ durations, seconds, formatted }) => {
    expect(await overview(durations.map((duration, i) => endedCall(`call-${i}`, duration))))
      .toMatchObject({ average_duration_seconds: seconds, average_duration_formatted: formatted });
  });

  test.each([
    { name: 'no calls', rows: [] },
    { name: 'calls without duration samples', rows: [endedCall('missing', null), endedCall('active', null, { ended_at: null })] },
  ])(
    'preserves the existing zero-sample fallback for $name', async ({ rows }) => {
      expect(await overview(rows)).toMatchObject({ average_duration_seconds: 0, average_duration_formatted: '0s' });
    },
  );
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
