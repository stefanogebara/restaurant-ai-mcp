const mockExtract = jest.fn().mockResolvedValue(0);
let mockRows;
let mockBeforeWrite;
let mockWriteError;
let mockReadError;
let mockWrites;

function mockQuery() {
  const filters = [];
  let payload;
  const matches = row => filters.every(([key, value]) => (row[key] ?? null) === value);
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn((key, value) => { filters.push([key, value]); return query; }),
    is: jest.fn((key, value) => { filters.push([key, value]); return query; }),
    update: jest.fn(value => { payload = value; return query; }),
    maybeSingle: jest.fn(async () => ({
      // A database read is a snapshot, not a reference that changes with the row.
      data: structuredClone(mockRows.find(matches) || null), error: mockReadError,
    })),
    then: (resolve, reject) => Promise.resolve().then(async () => {
      const write = { payload, filters };
      mockWrites.push(write);
      await mockBeforeWrite(write, mockWrites.length);
      if (mockWriteError) {
        const error = mockWriteError;
        mockWriteError = null;
        return { data: null, error };
      }
      const rows = mockRows.filter(matches);
      rows.forEach(row => Object.assign(row, payload));
      return { data: rows.map(row => ({ id: row.id })), error: null };
    }).then(resolve, reject),
  };
  return query;
}

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(() => mockQuery()) } }));
jest.mock('../_lib/restaurant-loader', () => ({
  getRestaurantByAgentId: jest.fn(async () => ({ id: 'rest-a' })),
  getRestaurantById: jest.fn(async () => ({ id: 'rest-a', is_demo: false, onboarding_completed: true })),
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
jest.mock('../_services/memoryExtractor', () => ({ extractMemoriesFromConversation: (...args) => mockExtract(...args) }));
const { ingestCompletedConversation } = require('../_services/conversationLogger');

const provider = {
  conversation_id: 'conv-a', agent_id: 'agent-a', status: 'done',
  metadata: { start_time_unix_secs: 1794304800, call_duration_secs: 64, main_language: 'pt-BR' },
  transcript: [{ role: 'user', message: 'Uma mesa para dois.', time_in_call_secs: 4 }],
  analysis: { transcript_summary: 'Reserva para dois.', sentiment_analysis: { overall_label: 'neutral' } },
};
function linkBooking() {
  Object.assign(mockRows[0], { reservation_id: 'RES-LINKED', outcome: 'reservation_created', successful_booking: true });
}
function expectCompletedBooking() {
  expect(mockRows[0]).toEqual(expect.objectContaining({
    reservation_id: 'RES-LINKED', outcome: 'reservation_created', successful_booking: true,
    ended_at: new Date((provider.metadata.start_time_unix_secs + 64) * 1000).toISOString(),
    duration_seconds: 64, elevenlabs_fetched_at: expect.any(String), language: 'pt', summary: 'Reserva para dois.',
    transcript: [{ role: 'user', content: 'Uma mesa para dois.', timestamp: 4 }],
  }));
  expect(mockRows[1]).toEqual({ id: 'row-b', conversation_id: 'conv-b', restaurant_info_id: 'rest-b', agent_id: 'agent-b', reservation_id: null, elevenlabs_fetched_at: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ELEVENLABS_SHARED_AGENT_ID;
  mockRows = [
    { id: 'row-a', conversation_id: 'conv-a', restaurant_info_id: 'rest-a', agent_id: 'agent-a', reservation_id: null, elevenlabs_fetched_at: null },
    { id: 'row-b', conversation_id: 'conv-b', restaurant_info_id: 'rest-b', agent_id: 'agent-b', reservation_id: null, elevenlabs_fetched_at: null },
  ];
  mockBeforeWrite = async () => {};
  mockWriteError = null;
  mockReadError = null;
  mockWrites = [];
});

test.each(['done', 'failed'])('a concurrent booking link cannot be downgraded by provider status %s', async status => {
  mockBeforeWrite = async (_write, attempt) => { if (attempt === 1) linkBooking(); };
  await expect(ingestCompletedConversation({ ...provider, status })).resolves.toEqual({ ingested: true });
  expectCompletedBooking();
  expect(mockExtract).toHaveBeenCalledTimes(1);
});

test('a completed competing ingestion prevents a second enrichment', async () => {
  mockBeforeWrite = async (_write, attempt) => {
    if (attempt === 1) Object.assign(mockRows[0], { elevenlabs_fetched_at: '2026-11-10T10:02:00Z', outcome: 'information_only' });
  };
  await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: false });
  expect(mockWrites).toHaveLength(1);
  expect(mockExtract).not.toHaveBeenCalled();
});

test.each([
  ['restaurant_info_id', 'rest-b'],
  ['agent_id', 'agent-b'],
])('a changed %s cannot receive the previously authorized transcript', async (field, foreignValue) => {
  mockBeforeWrite = async (_write, attempt) => { if (attempt === 1) mockRows[0][field] = foreignValue; };
  await expect(ingestCompletedConversation(provider)).rejects.toThrow(/mismatch/i);
  expect(mockRows[0][field]).toBe(foreignValue);
  expect(mockRows[0]).not.toHaveProperty('transcript');
  expect(mockRows[0].elevenlabs_fetched_at).toBeNull();
  expect(mockExtract).not.toHaveBeenCalled();
});

test('a failed completion write remains retryable and never clears a concurrent booking', async () => {
  mockBeforeWrite = async (_write, attempt) => { if (attempt === 1) linkBooking(); };
  mockWriteError = new Error('temporary write failure');
  await expect(ingestCompletedConversation(provider)).rejects.toThrow('temporary write failure');
  expect(mockRows[0].elevenlabs_fetched_at).toBeNull();
  expect(mockExtract).not.toHaveBeenCalled();
  await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: true });
  expectCompletedBooking();
  expect(mockExtract).toHaveBeenCalledTimes(1);
});

test('a failed race re-read is retryable without claiming completion or running enrichment', async () => {
  mockBeforeWrite = async (_write, attempt) => { if (attempt === 1) { linkBooking(); mockReadError = new Error('temporary read failure'); } };
  await expect(ingestCompletedConversation(provider)).rejects.toThrow('temporary read failure');
  expect(mockRows[0].elevenlabs_fetched_at).toBeNull();
  expect(mockExtract).not.toHaveBeenCalled();
  mockReadError = null;
  await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: true });
  expectCompletedBooking();
});

test('legacy unbound metadata can still be completed through the verified provider agent', async () => {
  mockRows[0].restaurant_info_id = null;
  mockRows[0].agent_id = null;
  await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: true });
  expect(mockRows[0]).toEqual(expect.objectContaining({ restaurant_info_id: 'rest-a', agent_id: 'agent-a', outcome: 'information_only', successful_booking: false, elevenlabs_fetched_at: expect.any(String) }));
});

test('a concurrent binding to the same verified agent and tenant can still complete', async () => {
  mockRows[0].restaurant_info_id = null;
  mockRows[0].agent_id = null;
  mockBeforeWrite = async (_write, attempt) => { if (attempt === 1) Object.assign(mockRows[0], { restaurant_info_id: 'rest-a', agent_id: 'agent-a' }); };
  await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: true });
  expect(mockRows[0]).toEqual(expect.objectContaining({ restaurant_info_id: 'rest-a', agent_id: 'agent-a', elevenlabs_fetched_at: expect.any(String) }));
  expect(mockExtract).toHaveBeenCalledTimes(1);
});


test('continued booking changes exhaust a bounded retry without falsely completing the call', async () => {
  mockBeforeWrite = async (_write, attempt) => {
    if (attempt <= 2) Object.assign(mockRows[0], { reservation_id: `RES-RACE-${attempt}`, outcome: 'reservation_created', successful_booking: true });
  };
  await expect(ingestCompletedConversation(provider)).rejects.toThrow('retry required');
  expect(mockWrites).toHaveLength(2);
  expect(mockRows[0].elevenlabs_fetched_at).toBeNull();
  expect(mockRows[0]).toEqual(expect.objectContaining({ reservation_id: 'RES-RACE-2', outcome: 'reservation_created', successful_booking: true }));
  expect(mockExtract).not.toHaveBeenCalled();
  // A stable retry still completes once and retains the newest durable link.
  await expect(ingestCompletedConversation(provider)).resolves.toEqual({ ingested: true });
  expect(mockRows[0].reservation_id).toBe('RES-RACE-2');
  expect(mockRows[0].elevenlabs_fetched_at).toEqual(expect.any(String));
  expect(mockExtract).toHaveBeenCalledTimes(1);
});
