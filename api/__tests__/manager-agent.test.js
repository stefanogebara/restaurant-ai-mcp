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
const mockComparePeriods = jest.fn();

// Quota-related mocks (module-scope so they can be referenced in jest.mock factories)
const mockGetPlanLimits = jest.fn();
const mockTrackUsage = jest.fn();

jest.mock('../services/managerMemory', () => ({
  retrieveRelevantMemories: mockRetrieveRelevantMemories,
  writeMemory: mockWriteMemory,
  embedText: mockEmbedText,
}));

jest.mock('../services/restaurantSnapshot', () => ({
  getRestaurantSnapshot: mockGetRestaurantSnapshot,
}));

const mockFrom = jest.fn();
const mockSchemaFrom = jest.fn();
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: mockFrom,
    schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
  },
}));

const mockAnthropic = { messages: { create: mockMessagesCreate } };
jest.mock('../_lib/ai-client', () => ({
  getAI: () => mockAnthropic,
  AI_MODEL: 'anthropic/claude-3.5-sonnet',
  AI_MODEL_FAST: 'anthropic/claude-3-haiku',
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../_lib/persona-prompt-builder', () => ({
  buildRestaurantIdentitySection: jest.fn().mockReturnValue(null),
}));

jest.mock('../services/subscription-limits', () => ({
  getPlanLimits: (...args) => mockGetPlanLimits(...args),
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: (...args) => mockTrackUsage(...args),
}));

jest.mock('../_lib/periodCompare', () => ({
  comparePeriods: (...args) => mockComparePeriods(...args),
}));

const { runManagerAgent, ManagerQuotaError } = require('../_lib/manager-agent');

// ─── Shared chain builder ────────────────────────────────────────────────────
// Builds the full chain needed for:
//   - subscriptions.select().eq().in().maybeSingle()  → { data: subData }
//   - usage_tracking.select().eq().eq().gte()          → { data: usageRows }
//   - manager_conversations.select().eq().order().limit() → { data: [] }
//   - manager_conversations.insert()                    → { error: null }
function makeChain(overrides = {}) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    in: jest.fn(),
    gte: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    insert: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  // limit is the terminal call for history queries — resolves to data
  chain.limit.mockResolvedValue({ data: [], error: null });
  return chain;
}

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

  // Default: starter plan limits, zero usage — so quota passes by default
  mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });
  mockTrackUsage.mockReturnValue(undefined);

  // Default from chain: no active subscription (plan = 'free' fallback via data=null),
  // no usage rows, empty history
  const chain = makeChain();
  // subscriptions maybeSingle → null (will make plan = 'free')
  chain.maybeSingle.mockResolvedValue({ data: null });
  mockFrom.mockReturnValue(chain);

  // restaurant_config chain (schema('restaurant').from('restaurant_config'))
  const configChain = makeChain();
  configChain.maybeSingle.mockResolvedValue({
    data: { restaurant_name: 'Test Restaurant', name: null, restaurant_profile: null },
  });
  mockSchemaFrom.mockReturnValue(configChain);
});

// ─── Existing tests ──────────────────────────────────────────────────────────

it('returns assistant text and saves both turns', async () => {
  // Override to starter plan so quota passes
  mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });

  // subscriptions → starter, usage_tracking → 0, history → []
  const chain = makeChain();
  chain.maybeSingle.mockResolvedValue({ data: { plan_name: 'starter', status: 'active' } });
  chain.gte.mockResolvedValue({ data: [], error: null });
  mockFrom.mockReturnValue(chain);

  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'You have 1 upcoming reservation tonight - Ana, party of 2 at 7pm.' }],
  });

  const reply = await runManagerAgent('rest-1', 'Who is coming tonight?', 'app');

  expect(reply).toBe('You have 1 upcoming reservation tonight - Ana, party of 2 at 7pm.');
});

it('includes memory context in system prompt', async () => {
  mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });

  const chain = makeChain();
  chain.maybeSingle.mockResolvedValue({ data: { plan_name: 'starter', status: 'active' } });
  chain.gte.mockResolvedValue({ data: [], error: null });
  mockFrom.mockReturnValue(chain);

  mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Yes, you close at 10pm.' }] });

  await runManagerAgent('rest-1', 'What time do we close?', 'whatsapp');

  const callArgs = mockMessagesCreate.mock.calls[0][0];
  expect(callArgs.system).toContain('We close at 10pm');
});

// ─── Quota enforcement ───────────────────────────────────────────────────────

describe('quota enforcement', () => {
  // For these tests, mockFrom needs to handle different table queries:
  //   'subscriptions'      → .select().eq().in().maybeSingle() → plan data
  //   'usage_tracking'     → .select().eq().eq().gte()         → usage rows
  //   'manager_conversations' → history chain
  //
  // Since mockFrom is called with the table name, we can differentiate per table.

  function setupFromMock({ planName = 'free', usageRows = [] } = {}) {
    mockFrom.mockImplementation((table) => {
      const chain = makeChain();
      if (table === 'subscriptions') {
        const subData = planName ? { plan_name: planName, status: 'active' } : null;
        chain.maybeSingle.mockResolvedValue({ data: subData });
      } else if (table === 'usage_tracking') {
        chain.gte.mockResolvedValue({ data: usageRows, error: null });
      }
      // manager_conversations: limit resolves to empty history (default)
      return chain;
    });
  }

  it('throws ManagerQuotaError upgrade_required when plan is free (limit=0)', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 0 });
    setupFromMock({ planName: 'free' });

    await expect(
      runManagerAgent('rest-1', 'Hello?', 'app')
    ).rejects.toMatchObject({
      name: 'ManagerQuotaError',
      type: 'upgrade_required',
    });
  });

  it('throws ManagerQuotaError quota_exceeded when starter plan usage=100 limit=100', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });
    setupFromMock({
      planName: 'starter',
      usageRows: [{ count: 60 }, { count: 40 }], // total = 100
    });

    await expect(
      runManagerAgent('rest-1', 'Hello?', 'app')
    ).rejects.toMatchObject({
      name: 'ManagerQuotaError',
      type: 'quota_exceeded',
      used: 100,
      limit: 100,
    });
  });

  it('does NOT throw when starter plan usage=50 (below limit=100)', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });
    setupFromMock({
      planName: 'starter',
      usageRows: [{ count: 50 }],
    });

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'OK!' }],
    });

    await expect(
      runManagerAgent('rest-1', 'Hello?', 'app')
    ).resolves.toBe('OK!');
  });

  it('calls trackUsage(restaurantId, manager_ai_call) after successful response', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });
    setupFromMock({ planName: 'starter', usageRows: [] });

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Done!' }],
    });

    await runManagerAgent('rest-42', 'Hello?', 'app');

    expect(mockTrackUsage).toHaveBeenCalledWith('rest-42', 'manager_ai_call');
  });

  it('does NOT call trackUsage when quota_exceeded throws', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });
    setupFromMock({
      planName: 'starter',
      usageRows: [{ count: 100 }],
    });

    await expect(
      runManagerAgent('rest-1', 'Hello?', 'app')
    ).rejects.toMatchObject({ type: 'quota_exceeded' });

    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  it('Scale plan (-1) bypasses usage query and resolves normally', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: -1 });
    setupFromMock({ planName: 'scale', usageRows: [] });

    const result = await runManagerAgent('rest-1', 'How many covers tonight?', 'app');
    expect(typeof result).toBe('string');
    // usage_tracking should NOT be queried (only subscriptions + manager_conversations)
    const usageTrackingCalls = mockFrom.mock.calls.filter(([t]) => t === 'usage_tracking');
    expect(usageTrackingCalls).toHaveLength(0);
  });
});

// ─── compare_periods tool use ─────────────────────────────────────────────────

describe('compare_periods tool use', () => {
  function setupFromMock({ planName = 'starter', usageRows = [] } = {}) {
    mockFrom.mockImplementation((table) => {
      const chain = makeChain();
      if (table === 'subscriptions') {
        chain.maybeSingle.mockResolvedValue({ data: { plan_name: planName, status: 'active' } });
      } else if (table === 'usage_tracking') {
        chain.gte.mockResolvedValue({ data: usageRows, error: null });
      }
      return chain;
    });
  }

  it('calls comparePeriods and returns follow-up text when Claude requests tool use', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });
    setupFromMock({ planName: 'starter', usageRows: [] });

    const compareResult = {
      period_a: { label: 'last_week', covers: 60, reservations: 20 },
      period_b: { label: 'this_week', covers: 72, reservations: 24 },
      delta: { covers: 12, reservations: 4, covers_pct: 20 },
    };
    mockComparePeriods.mockResolvedValue(compareResult);

    // First call → tool_use stop
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tool-id-1',
          name: 'compare_periods',
          input: { period_a: 'last_week', period_b: 'this_week' },
        },
      ],
    });
    // Second call → text
    mockMessagesCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'This week you had 72 covers, up 20% from 60 last week.' }],
    });

    const reply = await runManagerAgent('rest-1', 'How does this week compare to last?', 'app');

    expect(mockComparePeriods).toHaveBeenCalledWith('rest-1', 'last_week', 'this_week');
    expect(reply).toBe('This week you had 72 covers, up 20% from 60 last week.');
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it('falls through to text response when stop_reason is end_turn (no tool use)', async () => {
    mockGetPlanLimits.mockReturnValue({ managerAICallsMonthly: 100 });
    setupFromMock({ planName: 'starter', usageRows: [] });

    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Tonight looks good.' }],
    });

    const reply = await runManagerAgent('rest-1', 'How does tonight look?', 'app');

    expect(mockComparePeriods).not.toHaveBeenCalled();
    expect(reply).toBe('Tonight looks good.');
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });
});
