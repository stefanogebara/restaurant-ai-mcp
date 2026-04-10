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
        agent_voice_id: 'voice-123',
        agent_voice_name: 'Mila',
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
        voice_name: 'Mila',
        language: 'pt',
      }),
    }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('PATCH saves locally and returns sync warning when ElevenLabs is not configured', async () => {
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

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      agent_voice_id: 'voice-456',
      agent_voice_name: 'Noah',
      agent_language: 'en',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Voice settings saved locally. Live agent sync will apply on next refresh.',
      sync_warning: expect.stringContaining('API key not configured'),
    }));
    expect(global.fetch).not.toHaveBeenCalled();
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
