const mockGetRestaurantById = jest.fn();
let mockBinding;
let mockRestaurants;
let mockInsertError;
let mockRaceWinner;
const mockInserted = jest.fn();

jest.mock('../_lib/restaurant-loader', () => ({
  getRestaurantById: (...args) => mockGetRestaurantById(...args),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: table => {
      if (table !== 'agent_conversations') throw new Error('Unexpected table');
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: mockBinding, error: null }),
        insert: async row => {
          mockInserted(row);
          if (mockInsertError) {
            mockBinding = mockRaceWinner;
            return { error: mockInsertError };
          }
          mockBinding = { id: 1, ...row };
          return { error: null };
        },
      };
      return q;
    },
    schema: schema => {
      if (schema !== 'restaurant') throw new Error('Unexpected schema');
      return { from: table => {
        if (table !== 'restaurant_config') throw new Error('Unexpected table');
        const q = { select: () => q, eq: () => q, limit: async () => ({ data: mockRestaurants, error: null }) };
        return q;
      } };
    },
  },
}));

const { isSharedToolAuth, readSharedContext, identifySharedRestaurant, resolveSharedRestaurant } = require('../_lib/shared-voice-binding');
const SECRET = 's'.repeat(40);
const AGENT = 'agent_shared_test';
const CALLER = '+5511999990000';
const CALLED = '+15551234567';
const request = (overrides = {}) => ({
  headers: {
    authorization: `Bearer ${SECRET}`,
    'x-agent-id': AGENT,
    'x-conversation-id': 'conv-shared-1',
    'x-called-number': CALLED,
    'x-caller-number': CALLER,
    ...overrides.headers,
  },
  body: overrides.body || {}, query: overrides.query || {},
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_SHARED_TOOL_SECRET = SECRET;
  process.env.ELEVENLABS_SHARED_AGENT_ID = AGENT;
  process.env.ELEVENLABS_SHARED_PHONE = CALLED;
  mockBinding = null;
  mockInsertError = null;
  mockRaceWinner = null;
  mockRestaurants = [
    { id: 'rest-1', restaurant_name: 'Café Primavera', city: 'São Paulo', ai_config: { phone: { shared_routing_enabled: true } } },
    { id: 'rest-2', restaurant_name: 'Café Primavera', city: 'Campinas', ai_config: { phone: { shared_routing_enabled: true } } },
  ];
  mockGetRestaurantById.mockResolvedValue({ id: 'rest-1', is_demo: false, onboarding_completed: true, ai_config: { phone: { shared_routing_enabled: true } } });
});

afterAll(() => {
  delete process.env.ELEVENLABS_SHARED_TOOL_SECRET;
  delete process.env.ELEVENLABS_SHARED_AGENT_ID;
  delete process.env.ELEVENLABS_SHARED_PHONE;
});

test('requires a distinct configured Bearer secret and trusted provider headers', () => {
  expect(isSharedToolAuth(request())).toBe(true);
  expect(isSharedToolAuth(request({ headers: { authorization: 'Bearer wrong' } }))).toBe(false);
  expect(readSharedContext(request())).toEqual(expect.objectContaining({ agentId: AGENT, conversationId: 'conv-shared-1', calledNumber: CALLED, callerNumber: CALLER }));
  expect(() => readSharedContext(request({ headers: { 'x-agent-id': 'other' } }))).toThrow('Invalid shared voice context');
  expect(() => readSharedContext(request({ headers: { 'x-conversation-id': undefined } }))).toThrow('Invalid shared voice context');
  expect(() => readSharedContext(request({ headers: { 'x-called-number': '+15557654321' } }))).toThrow('Invalid shared voice context');
  expect(() => readSharedContext(request({ body: { conversation_id: 'other' } }))).toThrow('Invalid shared voice context');
  process.env.ELEVENLABS_SHARED_TOOL_SECRET = 'short';
  expect(isSharedToolAuth(request({ headers: { authorization: 'Bearer short' } }))).toBe(false);
  const originalCronSecret = process.env.CRON_SECRET;
  process.env.ELEVENLABS_SHARED_TOOL_SECRET = process.env.CRON_SECRET = SECRET;
  expect(isSharedToolAuth(request())).toBe(false);
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

test('identifies only a real exact-name match and requires city when ambiguous', async () => {
  const ctx = readSharedContext(request());
  const ambiguous = await identifySharedRestaurant(ctx, 'Cafe Primavera');
  expect(ambiguous).toEqual(expect.objectContaining({ success: false, needs_clarification: true }));
  expect(mockInserted).not.toHaveBeenCalled();
  const bound = await identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo');
  expect(bound).toEqual(expect.objectContaining({ success: true, restaurant_id: 'rest-1' }));
  expect(mockInserted).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv-shared-1', agent_id: AGENT, restaurant_info_id: 'rest-1', called_phone: CALLED, caller_phone: CALLER }));
  expect(await resolveSharedRestaurant(ctx)).toEqual(expect.objectContaining({ id: 'rest-1' }));
});

test('does not bind an unknown or fuzzy restaurant', async () => {
  const ctx = readSharedContext(request());
  expect(await identifySharedRestaurant(ctx, 'Primavera')).toEqual(expect.objectContaining({ success: false, restaurant_identified: false }));
  expect(mockInserted).not.toHaveBeenCalled();
});

test('does not route restaurants without an explicit shared-phone opt-in', async () => {
  const ctx = readSharedContext(request());
  mockRestaurants[0].ai_config.phone.shared_routing_enabled = false;
  expect(await identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo'))
    .toEqual(expect.objectContaining({ success: false, restaurant_identified: false }));
  mockBinding = { id: 1, agent_id: AGENT, restaurant_info_id: 'rest-1', called_phone: CALLED, caller_phone: CALLER };
  mockGetRestaurantById.mockResolvedValueOnce({ id: 'rest-1', is_demo: false, onboarding_completed: true, ai_config: { phone: { shared_routing_enabled: false } } });
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation restaurant unavailable');
});

test('refuses to identify from a truncated directory that could hide a duplicate name', async () => {
  const ctx = readSharedContext(request());
  mockRestaurants = Array.from({ length: 1000 }, (_, index) => ({
    id: `rest-${index}`, restaurant_name: index === 0 ? 'Café Primavera' : `Other ${index}`,
    city: 'São Paulo', ai_config: { phone: { shared_routing_enabled: true } },
  }));
  await expect(identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo'))
    .rejects.toThrow('Shared restaurant directory is incomplete');
  expect(mockInserted).not.toHaveBeenCalled();
});

test('keeps the first conversation binding immutable', async () => {
  const ctx = readSharedContext(request());
  mockBinding = { id: 1, conversation_id: ctx.conversationId, agent_id: AGENT, restaurant_info_id: 'rest-2', called_phone: CALLED, caller_phone: CALLER };
  await expect(identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo')).rejects.toThrow('Shared conversation binding conflict');
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation restaurant unavailable');
  expect(mockInserted).not.toHaveBeenCalled();
});

test('rejects unbound, wrong-agent, wrong-number, demo and incomplete conversations', async () => {
  const ctx = readSharedContext(request());
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation is not bound');
  mockBinding = { id: 1, conversation_id: ctx.conversationId, agent_id: 'other', restaurant_info_id: 'rest-1', called_phone: CALLED, caller_phone: CALLER };
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation binding conflict');
  mockBinding.agent_id = AGENT;
  mockBinding.called_phone = '+15557654321';
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation binding conflict');
  mockBinding.called_phone = CALLED;
  mockBinding.caller_phone = '+15557654321';
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation binding conflict');
  mockBinding.caller_phone = CALLER;
  mockGetRestaurantById.mockResolvedValueOnce({ id: 'rest-1', is_demo: true, onboarding_completed: true });
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation restaurant unavailable');
  mockGetRestaurantById.mockResolvedValueOnce({ id: 'rest-1', is_demo: false, onboarding_completed: false });
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation restaurant unavailable');
});

test('a racing duplicate is accepted only when the winning binding matches', async () => {
  const ctx = readSharedContext(request());
  mockInsertError = { code: '23505' };
  mockRaceWinner = { id: 1, conversation_id: ctx.conversationId, agent_id: AGENT, restaurant_info_id: 'rest-1', called_phone: CALLED, caller_phone: CALLER };
  const bound = await identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo');
  expect(bound.success).toBe(true);
  expect(mockInserted).toHaveBeenCalledTimes(1);
  mockBinding.restaurant_info_id = 'rest-2';
  await expect(identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo')).rejects.toThrow('Shared conversation binding conflict');
});
