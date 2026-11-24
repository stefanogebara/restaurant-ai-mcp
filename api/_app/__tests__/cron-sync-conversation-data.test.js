process.env.CRON_SECRET = 'cron-test';
process.env.ELEVENLABS_API_KEY = 'provider-test';

const mockRows = jest.fn();
const mockIngestCompletedConversation = jest.fn().mockResolvedValue({ ingested: true });
const mockRetryPostCallAnalysis = jest.fn().mockResolvedValue({ attempted: 0, completed: 0, errors: 0 });
const mockQuery = {};
for (const method of ['select', 'not', 'is', 'gte', 'order', 'eq']) mockQuery[method] = jest.fn(() => mockQuery);
mockQuery.limit = jest.fn(() => mockRows());
const mockFrom = jest.fn(() => mockQuery);
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: (...args) => mockFrom(...args) } }));
jest.mock('../_services/conversationLogger', () => ({
  ingestCompletedConversation: (...args) => mockIngestCompletedConversation(...args),
  retryPendingPostCallAnalysis: (...args) => mockRetryPostCallAnalysis(...args),
}));
jest.mock('../_lib/cron-tracker', () => ({ logCronRun: jest.fn(), logCronError: jest.fn() }));
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: jest.fn().mockResolvedValue(true) }));
jest.mock('../_lib/secure-compare', () => ({ bearerEquals: (value, secret) => value === `Bearer ${secret}` }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
const handler = require('../_crons/sync-conversation-data');

function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
async function run() {
  const res = response();
  await handler({ headers: { authorization: 'Bearer cron-test' } }, res);
  return res.json.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRows.mockResolvedValue({ data: [{ id: 1, conversation_id: 'conv-1', restaurant_info_id: 'rest-1' }], error: null });
  mockIngestCompletedConversation.mockResolvedValue({ ingested: true });
  mockRetryPostCallAnalysis.mockResolvedValue({ attempted: 0, completed: 0, errors: 0 });
});

test('closes an open, completed information-only call', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done', transcript: [] }) });
  expect(await run()).toMatchObject({ synced: 1, errors: 0 });
  expect(mockIngestCompletedConversation).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv-1', status: 'done' }), { restaurantId: 'rest-1' });
  expect(mockRetryPostCallAnalysis).toHaveBeenCalledTimes(1);
});

test('provider sync continues when optional analysis recovery fails', async () => {
  mockRetryPostCallAnalysis.mockRejectedValueOnce(new Error('analysis database unavailable'));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200,
    json: async () => ({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done', transcript: [] }) });
  expect(await run()).toMatchObject({ synced: 1, analysis: { failed: true } });
  expect(mockIngestCompletedConversation).toHaveBeenCalledTimes(1);
});

test('fetches a completed call ahead of 20 open calls at the batch limit', async () => {
  mockRows.mockImplementationOnce(async () => {
    const order = mockQuery.order.mock.calls.find(([column]) => column === 'ended_at');
    const open = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1, conversation_id: `open-${index}`, restaurant_info_id: 'rest-1', ended_at: null,
    }));
    const completed = { id: 21, conversation_id: 'completed-1', restaurant_info_id: 'rest-1', ended_at: '2026-11-07T01:00:00Z' };
    return { data: order?.[1]?.nullsFirst === false ? [completed, ...open].slice(0, 20) : open, error: null };
  });
  global.fetch = jest.fn(async url => ({
    ok: true, status: 200,
    json: async () => ({ conversation_id: url.split('/').pop(), agent_id: 'agent-1', status: url.endsWith('completed-1') ? 'done' : 'processing' }),
  }));
  expect(await run()).toMatchObject({ synced: 1, errors: 0, total: 20 });
  expect(mockQuery.order).toHaveBeenCalledWith('ended_at', { ascending: false, nullsFirst: false });
  expect(mockIngestCompletedConversation).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'completed-1' }), { restaurantId: 'rest-1' });
});

test('leaves an in-progress provider call eligible for a later run', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ conversation_id: 'conv-1', status: 'processing' }) });
  expect(await run()).toMatchObject({ synced: 0 });
  expect(mockIngestCompletedConversation).not.toHaveBeenCalled();
});

test('keeps provider failures eligible for retry and does not expose provider body', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'customer private data' });
  const result = await run();
  expect(result).toMatchObject({ synced: 0, errors: 1 });
  expect(mockIngestCompletedConversation).not.toHaveBeenCalled();
  expect(mockQuery.eq).not.toHaveBeenCalledWith('id', 1);
});
