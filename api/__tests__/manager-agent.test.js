// Module-scope mock functions (must be declared before jest.mock calls)
const mockRetrieveRelevantMemories = jest.fn().mockResolvedValue([
  { content: 'We close at 10pm', type: 'fact', category: 'ops', importance: 8 },
]);
const mockWriteMemory = jest.fn().mockResolvedValue(undefined);
const mockEmbedText = jest.fn().mockResolvedValue(new Array(1536).fill(0));
const mockGetRestaurantSnapshot = jest.fn().mockResolvedValue({
  snapshot_time: new Date().toISOString(),
  upcoming_reservations: [{ guest_name: 'Ana', party_size: 2, reservation_time: '2026-03-01T19:00:00Z' }],
  active_parties: [],
  waitlist_count: 0,
});
const mockMessagesCreate = jest.fn();

jest.mock('../services/managerMemory', () => ({
  retrieveRelevantMemories: mockRetrieveRelevantMemories,
  writeMemory: mockWriteMemory,
  embedText: mockEmbedText,
}));

jest.mock('../services/restaurantSnapshot', () => ({
  getRestaurantSnapshot: mockGetRestaurantSnapshot,
}));

const mockFrom = jest.fn();
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const mockAnthropic = { messages: { create: mockMessagesCreate } };
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => mockAnthropic),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const { runManagerAgent } = require('../_lib/manager-agent');

beforeEach(() => {
  jest.clearAllMocks();

  // Re-set default resolved values after clearAllMocks
  mockRetrieveRelevantMemories.mockResolvedValue([
    { content: 'We close at 10pm', type: 'fact', category: 'ops', importance: 8 },
  ]);
  mockWriteMemory.mockResolvedValue(undefined);
  mockGetRestaurantSnapshot.mockResolvedValue({
    snapshot_time: new Date().toISOString(),
    upcoming_reservations: [{ guest_name: 'Ana', party_size: 2, reservation_time: '2026-03-01T19:00:00Z' }],
    active_parties: [],
    waitlist_count: 0,
  });

  // supabaseAdmin.from returns an object with BOTH select chain AND insert method
  const historyChain = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    insert: jest.fn().mockResolvedValue({ error: null }),
  };
  historyChain.select.mockReturnValue(historyChain);
  historyChain.eq.mockReturnValue(historyChain);
  historyChain.order.mockReturnValue(historyChain);
  historyChain.limit.mockResolvedValue({ data: [], error: null });

  mockFrom.mockReturnValue(historyChain);
});

it('returns assistant text and saves both turns', async () => {
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'You have 1 upcoming reservation tonight - Ana, party of 2 at 7pm.' }],
  });

  const reply = await runManagerAgent('rest-1', 'Who is coming tonight?', 'app');

  expect(reply).toBe('You have 1 upcoming reservation tonight - Ana, party of 2 at 7pm.');
});

it('includes memory context in system prompt', async () => {
  mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Yes, you close at 10pm.' }] });

  await runManagerAgent('rest-1', 'What time do we close?', 'whatsapp');

  const callArgs = mockMessagesCreate.mock.calls[0][0];
  expect(callArgs.system).toContain('We close at 10pm');
});
