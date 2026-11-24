const mockFrom = jest.fn();
const mockModel = jest.fn();
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: (...args) => mockFrom(...args) } }));
jest.mock('../_lib/restaurant-loader', () => ({ getRestaurantByAgentId: jest.fn() }));
jest.mock('../_services/memoryExtractor', () => ({ extractMemoriesFromConversation: jest.fn() }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), error: jest.fn() }) }));
jest.mock('../_lib/ai-client', () => ({
  getAIClient: () => ({ messages: { create: (...args) => mockModel(...args) } }),
  AI_MODEL_FAST: 'test-model',
}));

const { retryPendingPostCallAnalysis } = require('../_services/conversationLogger');

function candidateQuery(rows) {
  const query = {};
  for (const method of ['select', 'not', 'is', 'lt', 'gte', 'order']) query[method] = jest.fn(() => query);
  query.limit = jest.fn(async () => ({ data: rows, error: null }));
  return query;
}

function claimQuery(rows) {
  const query = {};
  for (const method of ['update', 'eq', 'is']) query[method] = jest.fn(() => query);
  query.select = jest.fn(async () => ({ data: rows, error: null }));
  return query;
}

function writeQuery() {
  const query = {};
  for (const method of ['update', 'eq', 'is']) query[method] = jest.fn(() => query);
  query.then = resolve => Promise.resolve({ error: null }).then(resolve);
  return query;
}

const row = () => ({
  id: 'call-1', transcript: [{ role: 'user', content: 'Could I book a table tomorrow?' }],
  summary: 'Guest asked about a table', post_call_analysis_attempts: 0,
  post_call_analysis_next_at: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockModel.mockResolvedValue({ content: [{ text: '{"sentiment":"neutral","summary":"Guest asked about a table"}' }] });
});

test('claims once and saves recovered sentiment', async () => {
  const candidates = candidateQuery([row()]);
  const claim = claimQuery([{ id: 'call-1' }]);
  const write = writeQuery();
  mockFrom.mockReturnValueOnce(candidates).mockReturnValueOnce(claim).mockReturnValueOnce(write);

  expect(await retryPendingPostCallAnalysis()).toEqual({ attempted: 1, completed: 1, errors: 0 });
  expect(candidates.lt).toHaveBeenCalledWith('post_call_analysis_attempts', 3);
  expect(claim.eq).toHaveBeenCalledWith('post_call_analysis_attempts', 0);
  expect(claim.is).toHaveBeenCalledWith('post_call_analysis_next_at', null);
  expect(write.update).toHaveBeenCalledWith(expect.objectContaining({
    customer_sentiment: 'neutral', post_call_analysis_done_at: expect.any(String),
  }));
  expect(mockModel).toHaveBeenCalledTimes(1);
});

test('a lost concurrent claim does not call the model', async () => {
  mockFrom.mockReturnValueOnce(candidateQuery([row()])).mockReturnValueOnce(claimQuery([]));
  expect(await retryPendingPostCallAnalysis()).toEqual({ attempted: 0, completed: 0, errors: 0 });
  expect(mockModel).not.toHaveBeenCalled();
});

test('a future retry is skipped without a claim', async () => {
  mockFrom.mockReturnValueOnce(candidateQuery([{
    ...row(), post_call_analysis_next_at: new Date(Date.now() + 60_000).toISOString(),
  }]));
  expect(await retryPendingPostCallAnalysis()).toEqual({ attempted: 0, completed: 0, errors: 0 });
  expect(mockFrom).toHaveBeenCalledTimes(1);
});

test('an exhausted call cannot be claimed even if a query returns it', async () => {
  mockFrom.mockReturnValueOnce(candidateQuery([{ ...row(), post_call_analysis_attempts: 3 }]));
  expect(await retryPendingPostCallAnalysis()).toEqual({ attempted: 0, completed: 0, errors: 0 });
  expect(mockFrom).toHaveBeenCalledTimes(1);
});

test('an invalid model answer consumes a bounded attempt but does not claim completion', async () => {
  mockModel.mockResolvedValueOnce({ content: [{ text: 'invalid' }] });
  const claim = claimQuery([{ id: 'call-1' }]);
  mockFrom.mockReturnValueOnce(candidateQuery([row()])).mockReturnValueOnce(claim);
  expect(await retryPendingPostCallAnalysis()).toEqual({ attempted: 1, completed: 0, errors: 1 });
  expect(claim.update).toHaveBeenCalledWith(expect.objectContaining({ post_call_analysis_attempts: 1 }));
  expect(mockFrom).toHaveBeenCalledTimes(2);
});

test('a stalled model returns before the cron deadline and leaves the call retryable', async () => {
  jest.useFakeTimers();
  try {
    mockModel.mockImplementationOnce(() => new Promise(() => {}));
    mockFrom.mockReturnValueOnce(candidateQuery([row()]))
      .mockReturnValueOnce(claimQuery([{ id: 'call-1' }]));
    const result = retryPendingPostCallAnalysis();
    await jest.advanceTimersByTimeAsync(10_100);
    await expect(result).resolves.toEqual({ attempted: 1, completed: 0, errors: 1 });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test('a completed call without transcript is terminal without paying for the model', async () => {
  const write = writeQuery();
  mockFrom.mockReturnValueOnce(candidateQuery([{ ...row(), transcript: [] }]))
    .mockReturnValueOnce(claimQuery([{ id: 'call-1' }])).mockReturnValueOnce(write);
  expect(await retryPendingPostCallAnalysis()).toEqual({ attempted: 1, completed: 1, errors: 0 });
  expect(write.update).toHaveBeenCalledWith({ post_call_analysis_done_at: expect.any(String) });
  expect(mockModel).not.toHaveBeenCalled();
});
