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
        const filters = [];
        const q = { select: () => q, eq: (field, value) => { filters.push([field, value]); return q; },
          limit: async () => ({ data: mockRestaurants.filter(row => filters.every(([field, value]) => row[field] === value)), error: null }) };
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
    { is_active: true, onboarding_completed: true, is_demo: false, id: 'rest-1', restaurant_name: 'Café Primavera', city: 'São Paulo', ai_config: { phone: { shared_routing_enabled: true } } },
    { is_active: true, onboarding_completed: true, is_demo: false, id: 'rest-2', restaurant_name: 'Café Primavera', city: 'Campinas', ai_config: { phone: { shared_routing_enabled: true } } },
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

test.each(['pt', 'en', 'es'])('does not infer a shared caller language from restaurant language %s', async language => {
  const ctx = readSharedContext(request());
  mockGetRestaurantById.mockResolvedValueOnce({
    id: 'rest-1', is_demo: false, onboarding_completed: true, agent_language: language,
    ai_config: { language, phone: { shared_routing_enabled: true } },
  });
  await expect(identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo'))
    .resolves.toMatchObject({ success: true, restaurant_id: 'rest-1' });
  expect(mockInserted).toHaveBeenCalledWith(expect.objectContaining({ language: null }));
  expect(mockBinding).toMatchObject({ language: null, transcript: [] });
  expect(mockBinding).not.toHaveProperty('ended_at');
});

test.each([null, 'pt', 'en'])('reidentification preserves the existing caller language %s', async language => {
  const ctx = readSharedContext(request());
  mockBinding = { id: 1, conversation_id: ctx.conversationId, agent_id: AGENT,
    restaurant_info_id: 'rest-1', called_phone: CALLED, caller_phone: CALLER, language };
  await expect(identifySharedRestaurant(ctx, 'Cafe Primavera', 'Sao Paulo'))
    .resolves.toMatchObject({ success: true, restaurant_id: 'rest-1' });
  expect(mockInserted).not.toHaveBeenCalled();
  expect(mockBinding.language).toBe(language);
});

test('accepts a configured spoken alias only with the matching city', async () => {
  const ctx = readSharedContext(request());
  mockRestaurants[0].ai_config.phone.shared_name_aliases = ['Seatable C1 Sandbox'];
  mockRestaurants[0].restaurant_name = 'Seatable CI Sandbox';
  expect(await identifySharedRestaurant(ctx, 'Seatable C1 Sandbox'))
    .toEqual(expect.objectContaining({ success: false, needs_clarification: true }));
  expect(mockInserted).not.toHaveBeenCalled();
  expect(await identifySharedRestaurant(ctx, 'Seatable C1 Sandbox', 'São Paulo'))
    .toEqual(expect.objectContaining({ success: true, restaurant_id: 'rest-1' }));
  expect(mockInserted).toHaveBeenCalledTimes(1);
});

test('refuses an alias that collides with another restaurant name in the same city', async () => {
  const ctx = readSharedContext(request());
  mockRestaurants[0].ai_config.phone.shared_name_aliases = ['Seatable C1 Sandbox'];
  mockRestaurants[0].restaurant_name = 'Seatable CI Sandbox';
  mockRestaurants.push({ is_active: true, onboarding_completed: true, is_demo: false, id: 'rest-3', restaurant_name: 'Seatable C1 Sandbox', city: 'São Paulo',
    ai_config: { phone: { shared_routing_enabled: false } } });
  expect(await identifySharedRestaurant(ctx, 'Seatable C1 Sandbox', 'São Paulo'))
    .toEqual(expect.objectContaining({ success: false, restaurant_identified: false }));
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
    is_active: true, onboarding_completed: true, is_demo: false, id: `rest-${index}`, restaurant_name: index === 0 ? 'Café Primavera' : `Other ${index}`,
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

describe('nonbinding canonical connector suggestions', () => {
  const canonical = (overrides = {}) => ({ id: 'rest-1', restaurant_name: 'Seatable CI Sandbox', city: 'São Paulo',
    is_active: true, onboarding_completed: true, is_demo: false,
    ai_config: { phone: { shared_routing_enabled: true } }, ...overrides });
  beforeEach(() => { mockRestaurants = [canonical()]; });
  const identify = (spoken, city = 'São Paulo') => identifySharedRestaurant(readSharedContext(request()), spoken, city);
  function expectUnbound(result) {
    expect(result).toMatchObject({ success: false, restaurant_identified: false });
    expect(result).not.toHaveProperty('restaurant_id');
    expect(mockInserted).not.toHaveBeenCalled(); expect(mockGetRestaurantById).not.toHaveBeenCalled();
  }
  test.each(['e', 'and', 'y'])('suggests only the official name for a single inserted %s', async connector => {
    const result = await identify(`Seatable ${connector} CI Sandbox`, 'Sao Paulo');
    expectUnbound(result);
    expect(result).toMatchObject({ needs_confirmation: true,
      suggested_restaurant: { restaurant_name: 'Seatable CI Sandbox', city: 'São Paulo' } });
    expect(Object.keys(result.suggested_restaurant).sort()).toEqual(['city', 'restaurant_name']);
    expect(result.message).toContain('Seatable CI Sandbox'); expect(result.message).toContain('São Paulo');
    expect(result.message).toMatch(/wait.*next.*user.*turn/i);
  });
  test('suggestion leaves resolve blocked until a later exact canonical identification', async () => {
    const ctx = readSharedContext(request());
    expect((await identify('Seatable e CI Sandbox')).needs_confirmation).toBe(true);
    await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation is not bound');
    expect(mockInserted).not.toHaveBeenCalled();
    expect(await identifySharedRestaurant(ctx, 'Seatable CI Sandbox', 'São Paulo')).toMatchObject({ success: true, restaurant_id: 'rest-1' });
    expect(mockInserted).toHaveBeenCalledTimes(1);
    expect(await resolveSharedRestaurant(ctx)).toMatchObject({ id: 'rest-1' });
  });
  test.each(['', 'Campinas', 'São'])('no suggestion without the exact city: %s', async city => {
    const result = await identify('Seatable e CI Sandbox', city); expectUnbound(result);
    expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test.each(['Sandbox', 'Seatable C1 Sandbox', 'Setable CI Sandbox', 'Seatable CI',
    'e Seatable CI Sandbox', 'Seatable CI Sandbox and', 'Seatable e CI y Sandbox',
    'CI e Seatable Sandbox', 'Seatable with CI Sandbox', 'Completely Unknown'])('no broad fuzzy suggestion: %s', async spoken => {
    const result = await identify(spoken); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test.each([{ is_active: false }, { onboarding_completed: false }, { is_demo: true },
    { ai_config: { phone: { shared_routing_enabled: false } } }, { ai_config: { phone: { shared_routing_enabled: 'true' } } }])('ineligible directory row cannot become a suggestion: %j', async change => {
    mockRestaurants = [canonical(change)];
    const result = await identify('Seatable e CI Sandbox'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test('aliases cannot be the candidate source', async () => {
    mockRestaurants = [canonical({ restaurant_name: 'Different Official Name', ai_config: { phone: {
      shared_routing_enabled: true, shared_name_aliases: ['Seatable CI Sandbox'] } } })];
    const result = await identify('Seatable e CI Sandbox'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test.each(['official', 'alias'])('spoken-name ownership by an opted-out row suppresses suggestion: %s', async mode => {
    mockRestaurants.push(canonical({ id: 'rest-foreign', restaurant_name: mode === 'official' ? 'Seatable e CI Sandbox' : 'Other Restaurant',
      ai_config: { phone: { shared_routing_enabled: false, shared_name_aliases: mode === 'alias' ? ['Seatable e CI Sandbox'] : [] } } }));
    const result = await identify('Seatable e CI Sandbox'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test.each(['official', 'alias'])('canonical-name collision with an opted-out row suppresses suggestion: %s', async mode => {
    mockRestaurants.push(canonical({ id: 'rest-foreign', restaurant_name: mode === 'official' ? 'Seatable CI Sandbox' : 'Other Restaurant',
      ai_config: { phone: { shared_routing_enabled: false, shared_name_aliases: mode === 'alias' ? ['Seatable CI Sandbox'] : [] } } }));
    const result = await identify('Seatable e CI Sandbox'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test('multiple connector-removal candidates remain ambiguous', async () => {
    mockRestaurants = [canonical({ restaurant_name: 'Alpha e Bravo' }), canonical({ id: 'rest-2', restaurant_name: 'Alpha and Bravo' })];
    const result = await identify('Alpha e and Bravo'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test('a same-city duplicate canonical candidate cannot be suggested', async () => {
    mockRestaurants.push(canonical({ id: 'rest-2' }));
    const result = await identify('Seatable e CI Sandbox'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test.each([false, 'true', undefined])('an opted-out or nonboolean-opted candidate still makes the utterance ambiguous: %j', async enabled => {
    mockRestaurants = [canonical({ restaurant_name: 'Alpha e Bravo' }), canonical({ id: 'rest-2', restaurant_name: 'Alpha and Bravo',
      ai_config: { phone: { shared_routing_enabled: enabled } } })];
    const result = await identify('Alpha e and Bravo'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test('ambiguity across enabled and opted-out candidates preserves accent/case/space and exact-city normalization', async () => {
    mockRestaurants = [canonical({ restaurant_name: 'Café e Bravo' }), canonical({ id: 'rest-2', restaurant_name: ' CAFE   and BRAVO ', city: ' SAO   PAULO ',
      ai_config: { phone: { shared_routing_enabled: false } } })];
    const result = await identify(' cafe E and bravo ', ' São  Paulo '); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test.each(['spoken', 'canonical'])('opted-out alias ownership is normalized before suppressing a %s collision', async mode => {
    mockRestaurants.push(canonical({ id: 'rest-2', restaurant_name: 'Other Restaurant', city: ' SAO   PAULO ',
      ai_config: { phone: { shared_routing_enabled: false, shared_name_aliases: [mode === 'spoken' ? ' SEATABLE   E ci SANDBOX ' : ' SEATABLE ci   SANDBOX '] } } }));
    const result = await identify(' seatable e CI sandbox ', 'São Paulo'); expectUnbound(result); expect(result).not.toHaveProperty('suggested_restaurant');
  });
  test('a rejected suggestion and an arbitrary yes never create a binding', async () => {
    expect((await identify('Seatable e CI Sandbox')).needs_confirmation).toBe(true);
    expectUnbound(await identify('No, another restaurant'));
    expectUnbound(await identify('yes'));
    await expect(resolveSharedRestaurant(readSharedContext(request()))).rejects.toThrow('Shared conversation is not bound');
  });
});

test('connector recovery preserves accent/space normalization and permits either internal gap only', async () => {
  mockRestaurants = [{ id: 'rest-1', restaurant_name: 'Café CI Sandbox', city: 'São Paulo',
    is_active: true, onboarding_completed: true, is_demo: false, ai_config: { phone: { shared_routing_enabled: true } } }];
  const result = await identifySharedRestaurant(readSharedContext(request()), '  CAFE   CI  AND Sandbox ', ' Sao Paulo ');
  expect(result).toMatchObject({ success: false, restaurant_identified: false, needs_confirmation: true,
    suggested_restaurant: { restaurant_name: 'Café CI Sandbox', city: 'São Paulo' } });
  expect(mockInserted).not.toHaveBeenCalled();
});
test('suggestion still refuses a capped directory before choosing a candidate', async () => {
  mockRestaurants = Array.from({ length: 1000 }, (_, i) => ({ id: `rest-${i}`, restaurant_name: i ? `Other ${i}` : 'Seatable CI Sandbox',
    city: 'São Paulo', is_active: true, onboarding_completed: true, is_demo: false, ai_config: { phone: { shared_routing_enabled: true } } }));
  await expect(identifySharedRestaurant(readSharedContext(request()), 'Seatable e CI Sandbox', 'São Paulo')).rejects.toThrow('Shared restaurant directory is incomplete');
  expect(mockInserted).not.toHaveBeenCalled(); expect(mockGetRestaurantById).not.toHaveBeenCalled();
});
