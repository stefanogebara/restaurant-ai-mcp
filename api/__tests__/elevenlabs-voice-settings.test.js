const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();
let mockAwaitQueue = [];

function mockCreateChain() {
  const chain = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'select') return (...args) => { mockSelect(...args); return chain; };
      if (prop === 'eq') return (...args) => { mockEq(...args); return chain; };
      if (prop === 'update') return (...args) => { mockUpdate(...args); return chain; };
      if (prop === 'maybeSingle') return () => mockMaybeSingle();
      if (prop === 'then') {
        return (resolve, reject) => Promise.resolve(
          mockAwaitQueue.length > 0 ? mockAwaitQueue.shift() : { data: null, error: null }
        ).then(resolve, reject);
      }
      return () => chain;
    },
  });

  return chain;
}

const mockDbChain = mockCreateChain();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => mockDbChain,
    }),
  },
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn(async (_req, _res, next) => next()),
  requireFeature: jest.fn(() => (_req, _res, next) => next()),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../_lib/validation', () => ({
  validateElevenLabsVoiceId: jest.fn(() => ({ valid: true })),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

const handler = require('../elevenlabs-voice-settings');
const { verifyAuth } = require('../_lib/auth');

function createMockReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
    query: overrides.query || {},
    body: overrides.body || {},
    headers: overrides.headers || { authorization: 'Bearer test-token' },
    ...overrides,
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn(),
    setHeader: jest.fn(),
  };

  return { req, res };
}

const originalElevenLabsKey = process.env.ELEVENLABS_API_KEY;
const liveAgentResponse = () => ({ ok: true, json: async () => ({
  conversation_config: { tts: { model_id: 'eleven_flash_v2_5' } },
  platform_settings: { summary_language: 'pt-br' },
}) });

beforeEach(() => {
  jest.clearAllMocks();
  mockAwaitQueue = [];
  delete process.env.ELEVENLABS_API_KEY;
  global.fetch = jest.fn();
  verifyAuth.mockResolvedValue({
    user: { restaurant_id: 'rest-1', email: 'owner@test.com' },
  });
});

describe('language saves keep the live TTS and summary configuration compatible', () => {
  function arrange({ model = 'eleven_flash_v2', summary = 'en', country = 'BR', currentLanguage = 'en' } = {}) {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({ data: {
      id: 'rest-1', restaurant_name: 'Bistro', elevenlabs_agent_id: 'agent-123',
      agent_language: currentLanguage, agent_greeting: 'Owner opening', country,
    }, error: null });
    global.fetch.mockImplementation(async (_url, options) => options.method === 'GET'
      ? { ok: true, json: async () => ({
        conversation_config: { tts: { model_id: model, voice_id: 'keep-live-voice', stability: 0.8 } },
        platform_settings: { summary_language: summary },
      }) }
      : { ok: true });
  }

  function savedPayload() {
    const call = global.fetch.mock.calls.find(([, options]) => options.method === 'PATCH');
    return JSON.parse(call[1].body);
  }

  test.each([
    ['eleven_flash_v2', 'eleven_flash_v2_5'],
    ['eleven_turbo_v2', 'eleven_turbo_v2_5'],
  ])('pairs %s with a multilingual model in the same language update', async (model, expected) => {
    arrange({ model });
    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'pt', voice_settings: { speed: 1.1 } } });
    await handler(req, res);
    const payload = savedPayload();
    expect(payload.conversation_config.tts).toEqual({ model_id: expected, speed: 1.1 });
    expect(payload.conversation_config.agent).toEqual({ language: 'pt', first_message: 'Owner opening' });
    expect(payload.platform_settings).toEqual({ summary_language: 'pt-br' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test.each(['eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_v3_conversational'])('preserves the compatible live model %s and Brazilian summary locale', async model => {
    arrange({ model, summary: 'pt_BR' });
    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'pt', voice_id: 'new-voice' } });
    await handler(req, res);
    expect(savedPayload().conversation_config.tts).toEqual({ voice_id: 'new-voice' });
    expect(savedPayload().platform_settings).toEqual({ summary_language: 'pt-br' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test.each([
    ['pt', 'PT', 'pt_PT', 'pt'],
    ['pt-BR', 'BR', 'pt_BR', 'pt-br'],
    ['pt-PT', 'BR', 'pt_BR', 'pt'],
    ['pt-BR', 'PT', 'pt_PT', 'pt-br'],
    ['es', 'BR', 'pt_BR', 'es'],
    ['pt', 'PT', 'pt-br', 'pt-br'],
    ['pt', 'BR', 'pt', 'pt'],
    ['pt', 'BR', 'pt_PT', 'pt'],
    ['en-GB', 'GB', 'en', 'en'],
  ])('keeps summary language aligned with %s in %s', async (language, country, summary, expected) => {
    arrange({ country, summary });
    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language } });
    await handler(req, res);
    expect(savedPayload().platform_settings).toEqual({ summary_language: expected });
    if (language === 'en-GB') expect(savedPayload().conversation_config.tts).toBeUndefined();
  });

  test('uses an explicitly selected compatible model without replacing it', async () => {
    arrange();
    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'pt', tts_model_id: 'eleven_v3_conversational' } });
    await handler(req, res);
    expect(savedPayload().conversation_config.tts.model_id).toBe('eleven_v3_conversational');
  });

  test('fails closed before any write when the current model cannot be read', async () => {
    arrange();
    global.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' });
    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'pt' } });
    await handler(req, res);
    expect(global.fetch.mock.calls.some(([, options]) => options.method === 'PATCH')).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('does not invent a current model when the provider response is incomplete', async () => {
    arrange();
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ conversation_config: { tts: {} } }) });
    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'pt' } });
    await handler(req, res);
    expect(global.fetch.mock.calls.some(([, options]) => options.method === 'PATCH')).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('a tuning-only save neither reads nor changes language, model, or summary', async () => {
    arrange();
    const { req, res } = createMockReqRes({ method: 'PATCH', body: { voice_settings: { stability: 0.6 } } });
    await handler(req, res);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(savedPayload()).toEqual({ conversation_config: { tts: { stability: 0.6 } } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

afterAll(() => {
  process.env.ELEVENLABS_API_KEY = originalElevenLabsKey;
});

describe('ElevenLabs Voice Settings degradation', () => {
  test('GET returns stored settings when ElevenLabs is not configured', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'rest-1',
        restaurant_name: 'Seatable Bistro',
        elevenlabs_agent_id: 'agent-123',
        // Column renamed: agent_voice_id → voice_id (matches handler SELECT)
        voice_id: 'voice-123',
        agent_language: 'pt',
        voice_settings: { stability: 0.7, similarity_boost: 0.8, style: 0.2, speed: 1.0 },
        tts_model_id: 'eleven_turbo_v2_5',
        agent_updated_at: '2026-04-10T10:00:00.000Z',
      },
      error: null,
    });

    const { req, res } = createMockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        source: 'database_only',
        voice_id: 'voice-123',
        // voice_name is hardcoded null in buildStoredVoiceResponse (not
        // surfaced from DB on the no-API-key fallback path).
        voice_name: null,
        language: 'pt',
      }),
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('PATCH refuses to claim a save when ElevenLabs is not configured', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'rest-1',
        restaurant_name: 'Seatable Bistro',
        elevenlabs_agent_id: 'agent-123',
      },
      error: null,
    });
    mockAwaitQueue.push({ data: null, error: null });

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      body: {
        voice_id: 'voice-456',
        voice_name: 'Noah',
        language: 'en',
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.75,
          style: 0.1,
          speed: 1.05,
        },
      },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('GET reads the agent language from the documented agent config', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'rest-1', restaurant_name: 'Bistro', elevenlabs_agent_id: 'agent-123', agent_language: 'pt' }, error: null });
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ conversation_config: { agent: { language: 'es' }, tts: { voice_id: 'voice-live' } } }) });

    const { req, res } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ language: 'es', voice_id: 'voice-live' }) }));
  });

  test('PATCH rejects provider failure without writing the local config', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'rest-1', restaurant_name: 'Bistro', elevenlabs_agent_id: 'agent-123', agent_language: 'pt' }, error: null });
    global.fetch.mockResolvedValueOnce(liveAgentResponse()).mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'upstream unavailable' });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'es' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('PATCH writes the documented language path and saves locally only after provider success', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'rest-1', restaurant_name: 'Bistro', elevenlabs_agent_id: 'agent-123', agent_language: 'pt' }, error: null });
    mockAwaitQueue.push({ data: null, error: null });
    global.fetch.mockResolvedValueOnce(liveAgentResponse()).mockResolvedValueOnce({ ok: true });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'es', voice_id: 'voice-456' } });
    await handler(req, res);
    const providerBody = JSON.parse(global.fetch.mock.calls.find(([, options]) => options.method === 'PATCH')[1].body);
    expect(providerBody.conversation_config.agent.language).toBe('es');
    expect(providerBody.conversation_config.language).toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ voice_id: 'voice-456', agent_language: 'es' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('PATCH preserves a custom opening greeting when the owner changes language', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({ data: {
      id: 'rest-1', restaurant_name: 'Bistro', elevenlabs_agent_id: 'agent-123',
      agent_language: 'pt', agent_greeting: 'Bem-vindo ao nosso bistrô!',
    }, error: null });
    mockAwaitQueue.push({ data: null, error: null });
    global.fetch.mockResolvedValueOnce(liveAgentResponse()).mockResolvedValueOnce({ ok: true });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'es' } });
    await handler(req, res);
    const providerBody = JSON.parse(global.fetch.mock.calls.find(([, options]) => options.method === 'PATCH')[1].body);
    expect(providerBody.conversation_config.agent.first_message).toBe('Bem-vindo ao nosso bistrô!');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('PATCH reports partial failure if provider saved but database failed', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'rest-1', restaurant_name: 'Bistro', elevenlabs_agent_id: 'agent-123', agent_language: 'pt' }, error: null });
    mockAwaitQueue.push({ data: null, error: { message: 'database unavailable' } });
    global.fetch.mockResolvedValueOnce(liveAgentResponse()).mockResolvedValueOnce({ ok: true });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'es' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, provider_updated: true }));
  });

  test('refresh prompt returns skipped when ElevenLabs is not configured', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      query: { action: 'refresh_prompt' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      skipped: true,
      reason: 'elevenlabs_not_configured',
    });
  });
});
