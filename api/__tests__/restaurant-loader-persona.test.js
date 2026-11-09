const mockSingle = jest.fn();
const mockChain = {
  schema: jest.fn(), from: jest.fn(), select: jest.fn(), eq: jest.fn(), single: mockSingle,
};
for (const method of ['schema', 'from', 'select', 'eq']) mockChain[method].mockReturnValue(mockChain);

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockChain }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

const { getRestaurantById } = require('../_lib/restaurant-loader');

test('loads the saved voice persona for a new OpenAI call', async () => {
  mockSingle.mockResolvedValue({ data: {
    id: 'rest-1', restaurant_name: 'Bistro', is_active: true,
    voice_engine: 'openai_realtime', agent_name: 'Sofia',
    agent_greeting: 'Olá, aqui é a Sofia!', ai_config: { language: 'pt-BR' },
  }, error: null });

  const restaurant = await getRestaurantById('rest-1');
  expect(mockChain.select).toHaveBeenCalledWith(expect.stringContaining('agent_name'));
  expect(mockChain.select).toHaveBeenCalledWith(expect.stringContaining('agent_greeting'));
  expect(restaurant).toEqual(expect.objectContaining({
    agent_name: 'Sofia', agent_greeting: 'Olá, aqui é a Sofia!',
  }));
});


test('loads the canonical agent language even when ai_config has a stale default', async () => {
  mockSingle.mockResolvedValue({ data: {
    id: 'rest-pt', restaurant_name: 'Sandbox', agent_language: 'pt',
    ai_config: { language: 'en-US' },
  }, error: null });

  const restaurant = await getRestaurantById('rest-pt');
  expect(mockChain.select).toHaveBeenCalledWith(expect.stringContaining('agent_language'));
  expect(restaurant.agent_language).toBe('pt');
});

test('a shared platform phone cannot be resolved through the legacy restaurant loader', async () => {
 const previous=process.env.ELEVENLABS_SHARED_PHONE;process.env.ELEVENLABS_SHARED_PHONE='+551150289356';mockChain.schema.mockClear();
 try {const {getRestaurantByPhone}=require('../_lib/restaurant-loader');expect(await getRestaurantByPhone('+55 (11) 5028-9356')).toBeNull();expect(mockChain.schema).not.toHaveBeenCalled();}
 finally{if(previous===undefined)delete process.env.ELEVENLABS_SHARED_PHONE;else process.env.ELEVENLABS_SHARED_PHONE=previous;}
});


describe.each([
  ['getRestaurantById', 'rest-notices'],
  ['getRestaurantByPhone', '+551140001234'],
  ['getRestaurantByAgentId', 'agent-notices'],
])('%s outbound notice setting', (lookup, identifier) => {
  test.each([false, true])('loads and preserves whatsapp_enabled=%s instead of dropping the explicit setting', async enabled => {
    const row = { id: 'rest-notices', restaurant_name: 'Sandbox', whatsapp_enabled: enabled };
    mockSingle.mockImplementationOnce(async () => {
      // Simulate the selected columns so the test covers both projection and mapping.
      const columns = mockChain.select.mock.calls.at(-1)[0].split(',').map(column => column.trim());
      return { data: Object.fromEntries(columns.filter(column => column in row).map(column => [column, row[column]])), error: null };
    });
    const restaurant = await require('../_lib/restaurant-loader')[lookup](identifier);
    expect(restaurant.whatsapp_enabled).toBe(enabled);
    expect(mockChain.select.mock.calls.at(-1)[0].split(',').map(column => column.trim())).toContain('whatsapp_enabled');
  });
});
