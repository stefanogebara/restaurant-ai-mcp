'use strict';

let mockRows;
let mockBinding;
const mockInserted = jest.fn();
const mockLoadRestaurant = jest.fn();
jest.mock('../_lib/restaurant-loader', () => ({ getRestaurantById: (...args) => mockLoadRestaurant(...args) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {
  schema: () => ({ from: () => {
    const filters = [];
    const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q; },
      limit: async () => ({ data: mockRows.filter(row => filters.every(([key, value]) => row[key] === value)), error: null }) };
    return q;
  } }),
  from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: mockBinding, error: null }),
      insert: async row => { mockInserted(row); mockBinding = { id: 'conversation-row', ...row }; return { error: null }; } };
    return q;
  },
} }));
const { identifySharedRestaurant, resolveSharedRestaurant } = require('../_lib/shared-voice-binding');
const ctx = { agentId: 'shared-agent', conversationId: 'conversation-123', calledNumber: '+15555550100', callerNumber: '+15555550101' };
const row = (overrides = {}) => ({ id: '11111111-1111-4111-8111-111111111111', restaurant_name: 'Marigold Garden', city: 'São Paulo',
  is_active: true, onboarding_completed: true, is_demo: false,
  ai_config: { phone: { shared_routing_enabled: true } }, ...overrides });
const identify = (spoken, city = 'São Paulo') => identifySharedRestaurant(ctx, spoken, city);
function expectUnbound(result) {
  expect(result).toMatchObject({ success: false, restaurant_identified: false });
  expect(result).not.toHaveProperty('restaurant_id');
  for (const item of mockRows) expect(JSON.stringify(result)).not.toContain(item.id);
  expect(mockBinding).toBeNull();
  expect(mockInserted).not.toHaveBeenCalled();
  expect(mockLoadRestaurant).not.toHaveBeenCalled();
}
function expectNoSuggestion(result) {
  expectUnbound(result);
  expect(result).not.toHaveProperty('suggested_restaurant');
  expect(result).not.toHaveProperty('needs_confirmation');
}
beforeEach(() => {
  jest.clearAllMocks(); mockRows = [row()]; mockBinding = null;
  mockLoadRestaurant.mockImplementation(async id => mockRows.find(item => item.id === id));
});

test.each([
  ['one missing character', 'Marigld Garden'],
  ['one inserted character', 'Marigoald Garden'],
  ['one substituted character', 'Marigolt Garden'],
  ['one adjacent transposition', 'Mariglod Garden'],
  ['last canonical word', 'Marigold Gardem'],
  ['deletion at the first position', 'Arigold Garden'],
  ['insertion at the final position', 'Marigoldx Garden'],
])('offers only a confirmation candidate for %s', async (_, spoken) => {
  const result = await identify(spoken);
  expectUnbound(result);
  expect(result).toMatchObject({ needs_confirmation: true,
    suggested_restaurant: { restaurant_name: 'Marigold Garden', city: 'São Paulo' } });
  expect(Object.keys(result.suggested_restaurant).sort()).toEqual(['city', 'restaurant_name']);
  expect(result.message).toMatch(/next user turn and explicit confirmation/);
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation is not bound');
});

test('recovers the observed Setable utterance through the generic rule with Sandbox as the unchanged anchor', async () => {
  mockRows = [row({ restaurant_name: 'Seatable CI Sandbox' })];
  expect(await identify('Setable CI Sandbox')).toMatchObject({ success: false, restaurant_identified: false,
    needs_confirmation: true, suggested_restaurant: { restaurant_name: 'Seatable CI Sandbox', city: 'São Paulo' } });
  expectUnbound(await identify('Setable CI Sandbox'));
});

test('normalizes accents/case/space, with a single edit in a middle word', async () => {
  mockRows = [row({ restaurant_name: 'Café Marigold Garden' })];
  const result = await identify('  CAFE   marigld  GARDEN ', ' SAO   PAULO ');
  expectUnbound(result);
  expect(result.suggested_restaurant).toEqual({ restaurant_name: 'Café Marigold Garden', city: 'São Paulo' });
});

test.each(['', undefined, 'Campinas', 'São', 'Sao Paulu'])('requires an exact normalized city: %s', async city => {
  expectNoSuggestion(await identifySharedRestaurant(ctx, 'Marigld Garden', city));
});

test.each([
  ['Cafe Garden', 'Caf Garden'], // edited canonical word is too short
  ['Marigold CI', 'Marigld CI'], // no unchanged word of at least three letters
  ['Marigold', 'Marigld'],
  ['Marigold and', 'Marigld and'],
  ['Marigold The', 'Marigld The'],
  ['Marigold Restaurant', 'Marigld Restaurant'],
  ['Marigold 123', 'Marigld 123'],
  ['Marigold Marigold', 'Marigld Marigold'],
])('does not use a short, generic or repeated anchor: %s', async (canonical, spoken) => {
  mockRows = [row({ restaurant_name: canonical })];
  expectNoSuggestion(await identify(spoken));
});

test.each(['Marigld Gardem', 'Marild Garden', 'Mraiglod Garden', 'Garden Marigold',
  'Marigld and Garden', 'Marigld', 'Marigld Garden Extra'])('does not combine edits or widen word-count/order matching: %s', async spoken => {
  expectNoSuggestion(await identify(spoken));
});

test.each([true, false, 'true', undefined])('counts every plausible canonical owner before opt-in filtering: %j', async enabled => {
  mockRows.push(row({ id: '22222222-2222-4222-8222-222222222222', restaurant_name: 'Marigolt Garden',
    ai_config: { phone: { shared_routing_enabled: enabled } } }));
  expectNoSuggestion(await identify('Marigole Garden'));
});

test.each([false, 'true', undefined])('never offers an opted-out/nonboolean candidate: %j', async enabled => {
  mockRows = [row({ ai_config: { phone: { shared_routing_enabled: enabled } } })];
  expectNoSuggestion(await identify('Marigld Garden'));
});

test.each(['spoken canonical', 'spoken alias', 'candidate alias', 'plausible alias'])('%s owned by an opted-out row blocks steering', async kind => {
  mockRows.push(row({ id: '22222222-2222-4222-8222-222222222222',
    restaurant_name: kind === 'spoken canonical' ? 'Marigole Garden' : 'Different Official Name',
    ai_config: { phone: { shared_routing_enabled: false, shared_name_aliases:
      kind === 'spoken alias' ? [' MARIGOLE   GARDEN '] : kind === 'candidate alias' ? ['Marigold Garden'] :
        kind === 'plausible alias' ? ['Marigolt Garden'] : [] } } }));
  expectNoSuggestion(await identify('Marigole Garden'));
});

test('an alias alone cannot supply the canonical suggestion', async () => {
  mockRows = [row({ restaurant_name: 'Different Official Name',
    ai_config: { phone: { shared_routing_enabled: true, shared_name_aliases: ['Marigold Garden'] } } })];
  expectNoSuggestion(await identify('Marigld Garden'));
});

test('an existing exact owner wins over the nearby canonical candidate', async () => {
  mockRows.push(row({ id: '22222222-2222-4222-8222-222222222222', restaurant_name: 'Marigole Garden' }));
  const result = await identify('Marigole Garden');
  expect(result).toMatchObject({ success: true, restaurant_identified: true, restaurant_id: mockRows[1].id });
  expect(result).not.toHaveProperty('suggested_restaurant');
  expect(mockInserted).toHaveBeenCalledTimes(1);
});

test('a suggestion or arbitrary yes cannot bind; a later canonical identify still runs full ownership checks', async () => {
  expect((await identify('Marigld Garden')).needs_confirmation).toBe(true);
  expectNoSuggestion(await identify('yes'));
  mockRows.push(row({ id: '22222222-2222-4222-8222-222222222222', restaurant_name: 'Other Official Name',
    ai_config: { phone: { shared_routing_enabled: false, shared_name_aliases: ['Marigold Garden'] } } }));
  expectNoSuggestion(await identify('Marigold Garden'));
  await expect(resolveSharedRestaurant(ctx)).rejects.toThrow('Shared conversation is not bound');
  mockRows.pop();
  expect(await identify('Marigold Garden')).toMatchObject({ success: true, restaurant_id: mockRows[0].id });
  expect(mockInserted).toHaveBeenCalledTimes(1);
  expect(await resolveSharedRestaurant(ctx)).toMatchObject({ id: mockRows[0].id });
});
