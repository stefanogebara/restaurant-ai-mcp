process.env.CRON_SECRET = 'cron-test';
process.env.ELEVENLABS_API_KEY = 'provider-test';

const mockRows = jest.fn();
const mockIngestCompletedConversation = jest.fn().mockResolvedValue({ ingested: true });
const mockQuery = {};
for (const method of ['select', 'not', 'is', 'gte', 'order', 'eq']) mockQuery[method] = jest.fn(() => mockQuery);
mockQuery.limit = jest.fn(() => mockRows());
const mockFrom = jest.fn(() => mockQuery);
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: (...args) => mockFrom(...args) } }));
jest.mock('../_services/conversationLogger', () => ({ ingestCompletedConversation: (...args) => mockIngestCompletedConversation(...args) }));
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
});

test('closes an open, completed information-only call', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done', transcript: [] }) });
  expect(await run()).toMatchObject({ synced: 1, errors: 0 });
  expect(mockIngestCompletedConversation).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv-1', status: 'done' }), { restaurantId: 'rest-1' });
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
