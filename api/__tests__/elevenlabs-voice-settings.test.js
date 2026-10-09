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

beforeEach(() => {
  jest.clearAllMocks();
  mockAwaitQueue = [];
  delete process.env.ELEVENLABS_API_KEY;
  global.fetch = jest.fn();
  verifyAuth.mockResolvedValue({
    user: { restaurant_id: 'rest-1', email: 'owner@test.com' },
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

  test('GET names the selected voice from its live ID, not the agent name', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'rest-1', restaurant_name: 'Seatable Bistro', elevenlabs_agent_id: 'agent-123', voice_id: 'old-voice' },
      error: null,
    });
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        name: 'Restaurant agent',
        conversation_config: { language: 'pt', tts: { voice_id: 'live-voice', speed: 1.05 } },
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Marina', description: 'Warm Brazilian Portuguese voice' }) });

    const { req, res } = createMockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(global.fetch.mock.calls[1][0]).toBe('https://api.elevenlabs.io/v1/voices/live-voice');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'agent_api', voice_id: 'live-voice', voice_name: 'Marina',
        voice_description: 'Warm Brazilian Portuguese voice', agent_name: 'Restaurant agent',
      }),
    }));
    expect(mockSelect).toHaveBeenCalledWith(expect.not.stringContaining('agent_voice_name'));
  });

  test('GET keeps live configuration usable when selected voice metadata fails', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'rest-1', restaurant_name: 'Seatable Bistro', elevenlabs_agent_id: 'agent-123', voice_id: 'voice-123' },
      error: null,
    });
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ conversation_config: { tts: { voice_id: 'voice-123' } } }) })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const { req, res } = createMockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'agent_api', voice_id: 'voice-123', voice_name: null, voice_description: null,
      }),
    }));
  });

  test('PATCH refuses a false local-only success when ElevenLabs is not configured', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'rest-1',
        restaurant_name: 'Seatable Bistro',
        elevenlabs_agent_id: 'agent-123',
      },
      error: null,
    });

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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('No settings were saved'),
    }));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('PATCH persists only after ElevenLabs accepts the update', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'rest-1', restaurant_name: 'Seatable Bistro', elevenlabs_agent_id: 'agent-123' },
      error: null,
    });
    global.fetch.mockResolvedValueOnce({ ok: true });
    mockAwaitQueue.push({ data: null, error: null });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { voice_id: 'voice-456', language: 'pt' } });
    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/convai/agents/agent-123',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).conversation_config.agent.first_message)
      .toBe('Olá! Bem-vindo ao Seatable Bistro. Como posso ajudá-lo hoje?');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ voice_id: 'voice-456', agent_language: 'pt' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('language change keeps a saved custom opening message', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'rest-1', restaurant_name: 'Seatable Bistro', elevenlabs_agent_id: 'agent-123',
        agent_language: 'en', agent_greeting: 'Welcome to our table!',
      },
      error: null,
    });
    global.fetch.mockResolvedValueOnce({ ok: true });
    mockAwaitQueue.push({ data: null, error: null });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { language: 'pt' } });
    await handler(req, res);

    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('agent_greeting'));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      conversation_config: {
        language: 'pt',
        agent: { first_message: 'Welcome to our table!' },
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('PATCH leaves local settings untouched if ElevenLabs rejects the update', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'rest-1', restaurant_name: 'Seatable Bistro', elevenlabs_agent_id: 'agent-123' },
      error: null,
    });
    global.fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'unsupported model' });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { tts_model_id: 'unsupported-model' } });
    await handler(req, res);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringContaining('No settings were saved') }));
  });

  test('PATCH reports partial sync when the agent updates but the database fails', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'rest-1', restaurant_name: 'Seatable Bistro', elevenlabs_agent_id: 'agent-123' },
      error: null,
    });
    global.fetch.mockResolvedValueOnce({ ok: true });
    mockAwaitQueue.push({ data: null, error: { message: 'database unavailable' } });

    const { req, res } = createMockReqRes({ method: 'PATCH', body: { voice_id: 'voice-456' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, partial: true }));
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
