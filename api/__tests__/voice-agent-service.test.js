const mockSingle = jest.fn();
const mockUpdate = jest.fn();
const mockBuildPersonaPrompt = jest.fn(() => 'Current persona prompt');

const mockChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: (...args) => mockSingle(...args),
  update: (...args) => { mockUpdate(...args); return mockChain; },
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: () => ({ from: () => mockChain }) },
}));
jest.mock('../_lib/persona-prompt-builder', () => ({
  buildPersonaPrompt: (...args) => mockBuildPersonaPrompt(...args),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

const { refreshVoiceAgentPrompt } = require('../_services/voiceAgentService');
const originalKey = process.env.ELEVENLABS_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_API_KEY = 'test-key';
  mockSingle.mockResolvedValue({
    data: {
      id: 'rest-1', restaurant_name: 'Seatable Bistro', agent_language: 'en',
      agent_greeting: 'Welcome to our table!', elevenlabs_agent_id: 'agent-123',
    },
    error: null,
  });
  global.fetch = jest.fn();
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalKey;
});

test('syncs and reads back both prompt and first message without sending other agent fields', async () => {
  global.fetch
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        conversation_config: {
          agent: {
            prompt: { prompt: 'Current persona prompt', llm: 'gpt-4o-mini', tool_ids: ['tool-1'] },
            first_message: 'Welcome to our table!',
          },
          tts: { voice_id: 'voice-1' },
        },
      }),
    });

  const result = await refreshVoiceAgentPrompt('rest-1', { syncGreeting: true });

  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
    conversation_config: {
      agent: {
        prompt: { prompt: 'Current persona prompt' },
        first_message: 'Welcome to our table!',
      },
    },
  });
  expect(global.fetch.mock.calls[1][1].method).toBe('GET');
  expect(result).toEqual({ success: true, prompt_synced: true, greeting_synced: true });
  expect(mockUpdate).toHaveBeenCalledWith({ agent_updated_at: expect.any(String) });
});

test('reports a prompt-only partial success when first message readback differs', async () => {
  global.fetch
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversation_config: { agent: {
        prompt: { prompt: 'Current persona prompt' },
        first_message: 'Old greeting',
      } } }),
    });

  expect(await refreshVoiceAgentPrompt('rest-1', { syncGreeting: true })).toEqual({
    success: false,
    prompt_synced: true,
    greeting_synced: false,
    error: 'agent_readback_mismatch',
  });
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('a cleared greeting restores the default opening, while prompt-only refresh leaves it alone', async () => {
  mockSingle.mockResolvedValue({
    data: {
      id: 'rest-1', restaurant_name: 'Seatable Bistro', agent_language: 'en',
      agent_greeting: '', elevenlabs_agent_id: 'agent-123',
    },
    error: null,
  });
  const fallback = 'Thank you for calling Seatable Bistro. How may I help you today?';
  global.fetch
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      conversation_config: { agent: { prompt: { prompt: 'Current persona prompt' }, first_message: fallback } },
    }) })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      conversation_config: { agent: { prompt: { prompt: 'Current persona prompt' } } },
    }) });

  expect((await refreshVoiceAgentPrompt('rest-1', { syncGreeting: true })).greeting_synced).toBe(true);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).conversation_config.agent.first_message).toBe(fallback);
  expect((await refreshVoiceAgentPrompt('rest-1')).success).toBe(true);
  expect(JSON.parse(global.fetch.mock.calls[2][1].body).conversation_config.agent).toEqual({
    prompt: { prompt: 'Current persona prompt' },
  });
});
