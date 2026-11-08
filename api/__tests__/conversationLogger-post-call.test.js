const mockExtract = jest.fn().mockResolvedValue(0);
const mockRestaurant = jest.fn().mockResolvedValue({ id: 'rest-1' });
const mockRestaurantById = jest.fn().mockResolvedValue({ id: 'rest-1', is_demo: false, onboarding_completed: true });
const mockCreateAnalysis = jest.fn().mockResolvedValue({ content: [{ text: '{"summary":"Asked about hours","sentiment":"neutral"}' }] });
let mockRow;
let mockUpdated;
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockWarn = jest.fn();
const mockQuery = {
  select: (...args) => { mockSelect(...args); return mockQuery; },
  eq: jest.fn(() => mockQuery),
  is: jest.fn(() => mockQuery),
  maybeSingle: jest.fn(() => Promise.resolve({ data: mockRow, error: null })),
  update: (...args) => { mockUpdate(...args); return mockQuery; },
  insert: (...args) => { mockInsert(...args); return mockQuery; },
  single: jest.fn(() => Promise.resolve({ data: { id: 1 }, error: null })),
  then: (resolve) => Promise.resolve({ data: mockUpdated, error: null }).then(resolve),
};
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: () => mockQuery } }));
jest.mock('../_lib/restaurant-loader', () => ({
  getRestaurantByAgentId: (...args) => mockRestaurant(...args),
  getRestaurantById: (...args) => mockRestaurantById(...args),
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: (...args) => mockWarn(...args), error: jest.fn() }) }));
jest.mock('../_services/memoryExtractor', () => ({ extractMemoriesFromConversation: (...args) => mockExtract(...args) }));
jest.mock('../_lib/ai-client', () => ({ getAIClient: () => ({ messages: { create: (...args) => mockCreateAnalysis(...args) } }), AI_MODEL_FAST: 'test-model' }));
const { ingestCompletedConversation } = require('../_services/conversationLogger');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ELEVENLABS_SHARED_AGENT_ID;
  mockRestaurant.mockResolvedValue({ id: 'rest-1' });
  mockRestaurantById.mockResolvedValue({ id: 'rest-1', is_demo: false, onboarding_completed: true });
  mockRow = { id: 1, restaurant_info_id: 'rest-1', agent_id: 'agent-1', reservation_id: null, elevenlabs_fetched_at: null };
  mockUpdated = [{ id: 1 }];
  mockQuery.maybeSingle.mockReset().mockImplementation(() => Promise.resolve({ data: mockRow, error: null }));
});

test('shared agent uses an existing conversation binding and never resolves by agent ID', async () => {
  process.env.ELEVENLABS_SHARED_AGENT_ID = 'shared-agent';
  mockRow.agent_id = 'shared-agent';
  const result = await ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'shared-agent', status: 'done' });
  expect(result).toEqual({ ingested: true });
  expect(mockRestaurantById).toHaveBeenCalledWith('rest-1');
  expect(mockRestaurant).not.toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ restaurant_info_id: 'rest-1' }));
});

test('unbound shared-agent text previews are acknowledged without a restaurant or call write', async () => {
  process.env.ELEVENLABS_SHARED_AGENT_ID = 'shared-agent';
  mockRow = null;
  await expect(ingestCompletedConversation({
    conversation_id: 'conv-preview', agent_id: 'shared-agent', status: 'done',
    metadata: { call_duration_secs: 12, text_only: true, phone_call: null },
  })).resolves.toEqual({ ingested: false, reason: 'unbound_non_telephony' });
  expect(mockRestaurantById).not.toHaveBeenCalled();
  expect(mockRestaurant).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockInsert).not.toHaveBeenCalled();
});

test('unbound shared-agent calls without a restaurant are acknowledged without a write', async () => {
  process.env.ELEVENLABS_SHARED_AGENT_ID = 'shared-agent';
  mockRow = null;
  await expect(ingestCompletedConversation({
    conversation_id: 'conv-unknown', agent_id: 'shared-agent', status: 'done',
    metadata: { phone_call: null },
  })).resolves.toEqual({ ingested: false, reason: 'unbound_shared_call' });
  expect(mockInsert).not.toHaveBeenCalled();
  expect(mockWarn).toHaveBeenCalledWith('Shared conversation ended without restaurant identification',
    { conversation_id: 'conv-unknown' });
});

test('an unbound shared telephone event is acknowledged, then a late binding can be ingested', async () => {
  process.env.ELEVENLABS_SHARED_AGENT_ID = 'shared-agent';
  mockRow = null;
  const provider = {
    conversation_id: 'conv-phone', agent_id: 'shared-agent', status: 'done',
    metadata: { text_only: true, phone_call: { agent_number: '+551150289356' } },
  };
  await expect(ingestCompletedConversation(provider))
    .resolves.toEqual({ ingested: false, reason: 'unbound_shared_call' });
  expect(mockInsert).not.toHaveBeenCalled();
  mockRow = { id: 1, restaurant_info_id: 'rest-1', agent_id: 'shared-agent',
    reservation_id: null, elevenlabs_fetched_at: null };
  await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: true });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ restaurant_info_id: 'rest-1' }));
});

test('shared agent still refuses unscoped or inactive existing bindings', async () => {
  process.env.ELEVENLABS_SHARED_AGENT_ID = 'shared-agent';
  mockRow = { id: 1, agent_id: 'shared-agent', restaurant_info_id: null, elevenlabs_fetched_at: null };
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'shared-agent', status: 'done' }))
    .rejects.toThrow('Shared conversation is not bound');
  mockRow.restaurant_info_id = 'rest-1';
  mockRestaurantById.mockResolvedValueOnce(null);
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'shared-agent', status: 'done' }))
    .rejects.toThrow('Shared conversation restaurant unavailable');
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('shared agent refuses demo and incomplete restaurants', async () => {
  process.env.ELEVENLABS_SHARED_AGENT_ID = 'shared-agent';
  mockRow.agent_id = 'shared-agent';
  mockRestaurantById.mockResolvedValueOnce({ id: 'rest-1', is_demo: true, onboarding_completed: true });
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'shared-agent', status: 'done' }))
    .rejects.toThrow('Shared conversation restaurant unavailable');
  mockRestaurantById.mockResolvedValueOnce({ id: 'rest-1', is_demo: false, onboarding_completed: false });
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'shared-agent', status: 'done' }))
    .rejects.toThrow('Shared conversation restaurant unavailable');
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('a duplicate delivery still verifies the agent and restaurant scope', async () => {
  mockRow.elevenlabs_fetched_at = '2026-11-07T00:00:00Z';
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'other', status: 'done' }))
    .rejects.toThrow('Agent mismatch');
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done' }, { restaurantId: 'other' }))
    .rejects.toThrow('Restaurant mismatch');
});

test('finishes an information-only call and stores only transcript fields', async () => {
  const result = await ingestCompletedConversation({
    conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done',
    transcript: [{ role: 'user', message: 'private call content', tool_calls: [{ secret: 'do not store' }], time_in_call_secs: 3 }],
    metadata: { call_duration_secs: 17 }, analysis: { transcript_summary: 'Asked about hours' },
  });
  expect(result).toEqual({ ingested: true });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    outcome: 'information_only', duration_seconds: 17,
    transcript: [{ role: 'user', content: 'private call content', timestamp: 3 }],
  }));
  expect(mockQuery.is).toHaveBeenCalledWith('elevenlabs_fetched_at', null);
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    customer_sentiment: 'neutral', post_call_analysis_done_at: expect.any(String),
  }));
  expect(mockExtract).toHaveBeenCalledWith('conv-1');
});

test('persists provider language and sentiment without a second LLM call', async () => {
  await ingestCompletedConversation({
    conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done',
    transcript: [{ role: 'user', message: 'Tem mesa amanhã?' }],
    metadata: { main_language: 'pt-BR' },
    analysis: { sentiment_analysis: { overall_label: 'neutral' }, transcript_summary: 'Asked about a table' },
  });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    language: 'pt', customer_sentiment: 'neutral',
    post_call_analysis_done_at: expect.any(String),
  }));
  expect(mockCreateAnalysis).not.toHaveBeenCalled();
  expect(mockExtract).toHaveBeenCalledWith('conv-1');
});

test('preserves a reservation outcome and skips a duplicate delivery', async () => {
  mockRow.reservation_id = 'booking-1';
  await ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done' });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'reservation_created', successful_booking: true }));
  mockUpdate.mockClear();
  mockExtract.mockClear();
  mockRow.elevenlabs_fetched_at = '2026-11-07T00:00:00Z';
  expect(await ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done' })).toEqual({ ingested: false });
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockExtract).not.toHaveBeenCalled();
});

test('rejects agent or restaurant mismatch before writing', async () => {
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'other', status: 'done' })).rejects.toThrow('Agent mismatch');
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done' }, { restaurantId: 'other' })).rejects.toThrow('Restaurant mismatch');
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('rejects an agent that belongs to another restaurant', async () => {
  mockRestaurant.mockResolvedValueOnce({ id: 'rest-2' });
  await expect(ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done' }))
    .rejects.toThrow('Agent restaurant mismatch');
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('a racing duplicate does not run memory extraction', async () => {
  mockUpdated = [];
  expect(await ingestCompletedConversation({
    conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done',
    transcript: [{ role: 'user', message: 'question' }],
  })).toEqual({ ingested: false });
  expect(mockExtract).not.toHaveBeenCalled();
  expect(mockCreateAnalysis).not.toHaveBeenCalled();
});

test('creates a completed call that never invoked a tool', async () => {
  mockQuery.maybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: mockRow, error: null });
  await ingestCompletedConversation({
    conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done', transcript: [],
    metadata: {
      start_time_unix_secs: 1793287914,
      call_duration_secs: 7,
      phone_call: { external_number: '+15551234567', agent_number: '+15559876543' },
    },
  });
  expect(mockRestaurant).toHaveBeenCalledWith('agent-1');
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
    conversation_id: 'conv-1', restaurant_info_id: 'rest-1', agent_id: 'agent-1',
    started_at: new Date(1793287914 * 1000).toISOString(),
    caller_phone: '+15551234567', called_phone: '+15559876543',
  }));
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    outcome: 'information_only',
    started_at: new Date(1793287914 * 1000).toISOString(),
    ended_at: new Date((1793287914 + 7) * 1000).toISOString(),
  }));
});

test('does not overwrite a caller already captured during the conversation', async () => {
  mockRow.caller_phone = '+15551111111';
  await ingestCompletedConversation({
    conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done',
    metadata: { phone_call: { external_number: '+15551234567' } },
  });
  expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('caller_phone');
});

test('marks a provider failed call as an error when no reservation exists', async () => {
  await ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'failed' });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error', successful_booking: false }));
});

test('preserves a confirmed booking if the provider later marks the call failed', async () => {
  mockRow.reservation_id = 'booking-1';
  await ingestCompletedConversation({ conversation_id: 'conv-1', agent_id: 'agent-1', status: 'failed' });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'reservation_created', successful_booking: true }));
});

test('returns after durable completion when analysis and memory hang', async () => {
  jest.useFakeTimers();
  try {
    mockCreateAnalysis.mockImplementationOnce(() => new Promise(() => {}));
    mockExtract.mockImplementationOnce(() => new Promise(() => {}));
    const completion = ingestCompletedConversation({
      conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done',
      transcript: [{ role: 'user', message: 'question' }],
    });
    await jest.advanceTimersByTimeAsync(5000);
    await expect(completion).resolves.toEqual({ ingested: true });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ elevenlabs_fetched_at: expect.any(String) }));
  } finally {
    jest.useRealTimers();
  }
});

test('documents that timed-out enrichment is not retried by a duplicate delivery', async () => {
  jest.useFakeTimers();
  try {
    mockCreateAnalysis.mockImplementationOnce(() => new Promise(() => {}));
    mockExtract.mockImplementationOnce(() => new Promise(() => {}));
    const provider = {
      conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done',
      transcript: [{ role: 'user', message: 'question' }],
    };
    const first = ingestCompletedConversation(provider);
    await jest.advanceTimersByTimeAsync(5000);
    await expect(first).resolves.toEqual({ ingested: true });

    // Model the row returned after the successful conditional completion write.
    mockRow.elevenlabs_fetched_at = '2026-11-07T00:00:00Z';
    await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: false });
    expect(mockCreateAnalysis).toHaveBeenCalledTimes(1);
    expect(mockExtract).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('a late analysis result does not write after the webhook deadline', async () => {
  jest.useFakeTimers();
  try {
    let finishAnalysis;
    mockCreateAnalysis.mockImplementationOnce(() => new Promise(resolve => { finishAnalysis = resolve; }));
    const completion = ingestCompletedConversation({
      conversation_id: 'conv-1', agent_id: 'agent-1', status: 'done',
      transcript: [{ role: 'user', message: 'question' }],
    });
    await jest.advanceTimersByTimeAsync(5000);
    await completion;
    finishAnalysis({ content: [{ text: '{"summary":"Late","sentiment":"neutral"}' }] });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockUpdate).not.toHaveBeenCalledWith({ summary: 'Late', customer_sentiment: 'neutral' });
  } finally {
    jest.useRealTimers();
  }
});
