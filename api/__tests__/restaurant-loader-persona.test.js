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
