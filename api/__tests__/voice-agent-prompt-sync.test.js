const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();
const mockChain = {
  from: jest.fn(), select: jest.fn(), eq: mockEq, single: mockSingle, update: mockUpdate,
};
mockChain.from.mockReturnValue(mockChain);
mockChain.select.mockReturnValue(mockChain);
mockChain.eq.mockReturnValue(mockChain);
mockChain.update.mockReturnValue(mockChain);

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { schema: () => mockChain } }));
jest.mock('../_lib/persona-prompt-builder', () => ({ buildPersonaPrompt: jest.fn(() => 'Current persona prompt') }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }) }));

const { refreshVoiceAgentPrompt } = require('../_services/voiceAgentService');
const originalElevenLabsKey = process.env.ELEVENLABS_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_API_KEY = 'test-key';
  mockSingle.mockResolvedValue({ data: {
    id: 'rest-1', restaurant_name: 'Bistro', agent_language: 'pt',
    agent_greeting: 'Bem-vindo ao nosso bistrô!', elevenlabs_agent_id: 'agent-1',
  }, error: null });
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterAll(() => {
  if (originalElevenLabsKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalElevenLabsKey;
});

it('syncs a custom opening greeting with the current prompt when requested', async () => {
  const result = await refreshVoiceAgentPrompt('rest-1', { syncFirstMessage: true });
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.conversation_config.agent).toEqual({
    prompt: { prompt: 'Current persona prompt' },
    first_message: 'Bem-vindo ao nosso bistrô!',
  });
  expect(result).toEqual({ success: true });
});

it('loads the restaurant knowledge and policies before rebuilding the live prompt', async () => {
  await refreshVoiceAgentPrompt('rest-1', { syncFirstMessage: true });
  const selectedColumns = mockChain.select.mock.calls[0][0].split(',').map(column => column.trim());
  expect(selectedColumns).toEqual(expect.arrayContaining([
    'restaurant_profile', 'scraped_data', 'ai_strategy_doc', 'deposit_config',
    'website', 'persona_prompt_override',
  ]));
});

it('does not change the opening greeting when only the agent name changes', async () => {
  await refreshVoiceAgentPrompt('rest-1', { syncFirstMessage: false });
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.conversation_config.agent.first_message).toBeUndefined();
});

it('restores a language-specific default after clearing the custom greeting', async () => {
  mockSingle.mockResolvedValueOnce({ data: {
    id: 'rest-1', restaurant_name: 'Bistro', agent_language: 'pt-BR',
    agent_greeting: '', elevenlabs_agent_id: 'agent-1',
  }, error: null });
  await refreshVoiceAgentPrompt('rest-1', { syncFirstMessage: true });
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.conversation_config.agent.first_message).toMatch(/Bistro/);
  expect(body.conversation_config.agent.first_message).toMatch(/ligar/i);
});
