/**
 * Onboarding Complete Tests
 *
 * Tests Brazil free plan logic vs non-Brazil Growth trial.
 * Focuses on the subscription creation path in Step 5.
 */

// ---------------------------------------------------------------------------
// Fake environment variables
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.CLIENT_URL = 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Chainable Supabase mock
// ---------------------------------------------------------------------------
function createChainableMock(resolvedValue = { data: null, error: null }) {
  const calls = [];
  const handler = {
    get(target, prop) {
      if (prop === 'then') return (resolve) => resolve(resolvedValue);
      if (prop === '__calls') return calls;
      return (...args) => {
        calls.push({ method: prop, args });
        if ((prop === 'insert' || prop === 'update') && args[0] && typeof args[0] === 'object') {
          if ('restaurant_type' in args[0]) capturedConfigWrite = args[0];
        }
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

// Track subscription inserts
let capturedSubscriptionInsert = null;
// Track the restaurant_config write (insert/update) so tests can assert what
// actually lands in the DB — e.g. the restaurant_type vocabulary mapping.
let capturedConfigWrite = null;

const mockSupabaseAdmin = {
  from: jest.fn((table) => {
    if (table === 'subscriptions') {
      return {
        insert: jest.fn((data) => {
          capturedSubscriptionInsert = data;
          return {
            select: jest.fn(() => ({
              single: jest.fn(() =>
                Promise.resolve({ data: { ...data, id: 'sub-uuid' }, error: null })
              ),
            })),
          };
        }),
      };
    }
    if (table === 'tables') {
      return {
        delete: jest.fn(() => createChainableMock({ data: null, error: null })),
        insert: jest.fn(() => createChainableMock({ data: [], error: null })),
        update: jest.fn(() => createChainableMock({ data: null, error: null })),
      };
    }
    return createChainableMock({ data: null, error: null });
  }),
  schema: jest.fn(() => ({
    from: jest.fn(() =>
      createChainableMock({ data: { id: 'config-uuid', slug: 'test-restaurant' }, error: null })
    ),
  })),
  auth: {
    admin: {
      listUsers: jest.fn(() =>
        Promise.resolve({ data: { users: [] }, error: null })
      ),
      createUser: jest.fn(() =>
        Promise.resolve({
          data: { user: { id: 'user-uuid' } },
          error: null,
        })
      ),
    },
  },
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(() =>
    Promise.resolve({ user: { id: 'user-1', restaurant_id: 'rest-1' } })
  ),
}));

jest.mock('../_lib/timezone', () => ({
  suggestTimezone: jest.fn(() => 'America/Sao_Paulo'),
}));

// Rede fora do alcance do teste. Não é usado na criação de agente, mas outros
// imports podem disparar fetch — o global cobre todos eles.
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: false,
    status: 500,
    text: () => Promise.resolve('mock error'),
  })
);

// Mock elevenlabsAgentService to prevent actual ElevenLabs API calls
jest.mock('../_services/elevenlabsAgentService', () => ({
  createAgent: jest.fn(() =>
    Promise.resolve({ success: false, error: 'mock: no API key' })
  ),
  syncKnowledgeBase: jest.fn(() =>
    Promise.resolve({ success: false, error: 'mock: no agent' })
  ),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function mockReqRes(body = {}) {
  const req = {
    method: 'POST',
    body,
    headers: { authorization: 'Bearer test-token' },
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return { req, res };
}

const BASE_BODY = {
  customer_email: 'test@example.com',
  restaurant_name: 'Test Restaurant',
  phone_number: '+5511999999999',
  email: 'test@example.com',
  city: 'São Paulo',
  country: 'Brazil',
  business_hours: [
    { day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' },
  ],
  areas: [
    {
      name: 'Main',
      tables: [{ capacity: 4, count: 3, shape: 'square', is_joinable: true }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Require the handler
// ---------------------------------------------------------------------------
const handler = require('../onboarding/complete');

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  capturedConfigWrite = null;
  jest.clearAllMocks();
  capturedSubscriptionInsert = null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Brazil country detection → free plan', () => {
  test('country "Brazil" creates free plan subscription', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Brazil',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Free');
    expect(capturedSubscriptionInsert.status).toBe('active');
    expect(capturedSubscriptionInsert.price_id).toBe('free');
  });

  test('country "brasil" (Portuguese spelling) creates free plan', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'brasil',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Free');
    expect(capturedSubscriptionInsert.status).toBe('active');
  });

  test('country "BRAZIL" (uppercase) creates free plan', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'BRAZIL',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Free');
  });

  test('free plan has far-future expiry (2099)', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Brazil',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert.current_period_end).toContain('2099');
  });
});

describe('Non-Brazil country → Growth trial', () => {
  test('country "Spain" creates 14-day Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Spain',
      city: 'Madrid',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedSubscriptionInsert).toBeDefined();
    expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
    expect(capturedSubscriptionInsert.status).toBe('trialing');
    expect(capturedSubscriptionInsert.price_id).toBe('trial');
  });

  test('country "Germany" creates Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Germany',
      city: 'Berlin',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
    expect(capturedSubscriptionInsert.status).toBe('trialing');
  });

  test('Growth trial has trial_end set', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: 'Spain',
      city: 'Madrid',
    });

    await handler(req, res);

    expect(capturedSubscriptionInsert.trial_end).toBeDefined();
    // Trial should be roughly 14 days from now
    const trialEnd = new Date(capturedSubscriptionInsert.trial_end);
    const now = new Date();
    const diffDays = (trialEnd - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(13);
    expect(diffDays).toBeLessThan(15);
  });
});

describe('Missing country → Growth trial', () => {
  test('undefined country creates Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: undefined,
      city: undefined,
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // country undefined → isBrazil is false → Growth trial
    if (capturedSubscriptionInsert) {
      expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
      expect(capturedSubscriptionInsert.status).toBe('trialing');
    }
  });

  test('empty string country creates Growth trial', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      country: '',
      city: '',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    if (capturedSubscriptionInsert) {
      expect(capturedSubscriptionInsert.plan_name).toBe('Growth');
    }
  });
});

describe('Validation', () => {
  test('rejects POST with missing required fields', async () => {
    const { req, res } = mockReqRes({
      customer_email: 'test@example.com',
      // Missing restaurant_name, phone_number, email
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    // Hardened validation now names the FIRST offending field in the error
    // message (rather than a generic "Missing required fields") so the UI
    // can surface a targeted message. Structured `details[]` enumerates
    // every missing field so the form can highlight all of them at once.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        field: expect.any(String),
        reason: expect.any(String),
        details: expect.any(Array),
      })
    );
  });

  test('rejects non-POST methods', async () => {
    const req = {
      method: 'GET',
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('handles OPTIONS preflight', async () => {
    const req = {
      method: 'OPTIONS',
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns auth error when verifyAuth fails (line 99)', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ error: 'Authentication required', status: 401 });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Authentication required' }));
  });
});

// ============================================================
// Invalid restaurant_type (line 150)
// ============================================================
describe('restaurant_type validation', () => {
  test('logs warning for invalid restaurant_type (line 150)', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      restaurant_type: 'invalid-cuisine-type',
    });
    await handler(req, res);
    // Still succeeds (type set to null, not a fatal error)
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// No tables (line 272)
// ============================================================
describe('Empty areas / no tables', () => {
  test('succeeds when areas is empty (line 272)', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      areas: [],
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('succeeds when areas has tables with count 0', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      areas: [{ name: 'Main', tables: [{ capacity: 4, count: 0 }] }],
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// User management edge cases (lines 285, 291-292, 305, 313)
// ============================================================
describe('User management edge cases', () => {
  test('logs warning when listUsers fails (line 285)', async () => {
    mockSupabaseAdmin.auth.admin.listUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: { message: 'Auth service unavailable' },
    });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('uses existing user when found by email (lines 291-292)', async () => {
    mockSupabaseAdmin.auth.admin.listUsers.mockResolvedValueOnce({
      data: { users: [{ email: 'test@example.com', id: 'existing-user-uuid' }] },
      error: null,
    });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('logs warning when createUser fails (line 305)', async () => {
    // listUsers returns empty → tries createUser → createUser fails
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Email already registered' },
    });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('handles auth block throwing (line 313)', async () => {
    // listUsers throws to trigger the catch block
    mockSupabaseAdmin.auth.admin.listUsers.mockRejectedValueOnce(
      new Error('Auth service crashed')
    );

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// ElevenLabs agent creation paths (via elevenlabsAgentService)
// ============================================================
describe('ElevenLabs agent creation', () => {
  test('handles agent creation success via service', async () => {
    const { createAgent } = require('../_services/elevenlabsAgentService');
    createAgent.mockResolvedValueOnce({
      success: true,
      agent_id: 'agent-elevenlabs-123',
      tools_created: 7,
    });

    const { req, res } = mockReqRes({
      ...BASE_BODY,
      selected_voice_id: 'voice-abc',
      selected_voice_language: 'en',
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurant_name: 'Test Restaurant',
        voice_id: 'voice-abc',
        language: 'en',
      })
    );
  });

  test('handles agent creation failure gracefully', async () => {
    const { createAgent } = require('../_services/elevenlabsAgentService');
    createAgent.mockResolvedValueOnce({
      success: false,
      error: 'ElevenLabs API key not configured',
    });

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    // Should not fail the whole onboarding
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('handles agent creation exception gracefully', async () => {
    const { createAgent } = require('../_services/elevenlabsAgentService');
    createAgent.mockRejectedValueOnce(new Error('Network error'));

    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    // Should not fail the whole onboarding
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('uses configResult.id as restaurantId (not REST-xxx string)', async () => {
    const { createAgent } = require('../_services/elevenlabsAgentService');
    const { verifyAuth } = require('../_lib/auth');

    // Provide sub (JWT subject) so userId is set and restaurant_config is created
    verifyAuth.mockResolvedValueOnce({
      user: { id: 'user-1', sub: 'user-uuid-1', restaurant_id: 'rest-1' },
    });

    createAgent.mockResolvedValueOnce({
      success: true,
      agent_id: 'agent-check-id',
      tools_created: 7,
    });

    const { req, res } = mockReqRes({
      ...BASE_BODY,
      selected_voice_id: 'voice-abc',
    });
    await handler(req, res);

    // createAgent should have been called with the UUID from configResult, not REST-xxx
    const callArgs = createAgent.mock.calls[0][0];
    // configResult.id from mock is 'config-uuid'
    expect(callArgs.restaurantId).toBe('config-uuid');
  });
});

// ---------------------------------------------------------------------------
// Input validation — locks the hardened contract that rejects empty strings,
// malformed emails, and unreasonable phone numbers BEFORE any DB write.
// The previous version just checked truthiness, so `"   "` and arbitrary
// strings would pass and land in the DB / WhatsApp router.
// ---------------------------------------------------------------------------
describe('Input validation — required field hardening', () => {
  test('rejects whitespace-only customer_email', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, customer_email: '   ' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.field).toBe('customer_email');
    expect(body.reason).toBe('required');
  });

  test('rejects malformed customer_email', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, customer_email: 'not-an-email' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].field).toBe('customer_email');
    expect(res.json.mock.calls[0][0].reason).toMatch(/invalid email format/i);
  });

  test('rejects whitespace-only restaurant_name', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, restaurant_name: '   ' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].field).toBe('restaurant_name');
  });

  test('rejects restaurant_name longer than 255 characters', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, restaurant_name: 'x'.repeat(256) });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toMatch(/255/);
  });

  test('rejects phone with non-numeric content', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, phone_number: 'call-me-maybe' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].field).toBe('phone_number');
  });

  test('rejects phone shorter than 7 chars (avoid junk like "123")', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, phone_number: '+123' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].field).toBe('phone_number');
  });

  test('rejects malformed contact email', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, email: '@missing-local' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].field).toBe('email');
  });

  test('accepts the canonical BASE_BODY without complaint', async () => {
    const { req, res } = mockReqRes(BASE_BODY);
    await handler(req, res);
    // We don't care here whether the full flow succeeds (DB mocks may not
    // reach 200); we ONLY care that validation didn't 400 the request.
    const firstCall = res.status.mock.calls[0]?.[0];
    expect(firstCall).not.toBe(400);
  });

  test('trims whitespace around valid values (does not 400 on padded input)', async () => {
    const { req, res } = mockReqRes({
      ...BASE_BODY,
      customer_email: '  test@example.com  ',
      restaurant_name: '  Test Restaurant  ',
      phone_number: '  +5511999999999  ',
      email: '  test@example.com  ',
    });
    await handler(req, res);
    const firstCall = res.status.mock.calls[0]?.[0];
    expect(firstCall).not.toBe(400);
  });

  test('returns structured details listing all field errors', async () => {
    const { req, res } = mockReqRes({
      customer_email: 'bad',
      restaurant_name: '',
      phone_number: '',
      email: 'also-bad',
      // ...minimal payload, hours/areas not required by validation
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body.details)).toBe(true);
    // Should report ALL field problems, not just the first one. This
    // lets the client show one inline message per field instead of
    // forcing the user to fix-and-retry one field at a time.
    expect(body.details.length).toBeGreaterThanOrEqual(4);
    const fields = body.details.map(d => d.field);
    expect(fields).toEqual(expect.arrayContaining(['customer_email', 'restaurant_name', 'phone_number', 'email']));
  });
});


// ============================================================
// G0 (auditoria 24/ago): vocabulário de tipo + e-mail placeholder do demo
// ============================================================
describe('restaurant_type — vocabulário unificado (G0.4)', () => {
  // complete.js lê auth.user?.sub — o mock global só tem `id`, então TODOS os
  // testes anteriores rodavam com userId null e a escrita do config era
  // PULADA em silêncio (o endpoint ainda devolve 200 — achado #13 da
  // auditoria). Estes testes autenticam com `sub` para exercitar a escrita.
  const authComSub = () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ user: { sub: 'user-1', id: 'user-1' } });
  };

  test("enum do demo com underscore não vira 'other'", async () => {
    authComSub();
    const { req, res } = mockReqRes({ ...BASE_BODY, restaurant_type: 'casual_dining' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedConfigWrite).toBeDefined();
    expect(capturedConfigWrite.restaurant_type).toBe('casual_dining');
  });

  test("cozinha do enum do banco ('italian') é preservada", async () => {
    authComSub();
    const { req, res } = mockReqRes({ ...BASE_BODY, restaurant_type: 'italian' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedConfigWrite.restaurant_type).toBe('italian');
  });

  test("tile com hífen segue mapeando ('fine-dining' → fine_dining)", async () => {
    authComSub();
    const { req, res } = mockReqRes({ ...BASE_BODY, restaurant_type: 'fine-dining' });
    await handler(req, res);
    expect(capturedConfigWrite.restaurant_type).toBe('fine_dining');
  });
});

describe('e-mail placeholder do demo é rejeitado (G0.3)', () => {
  test('<slug>@demo.seatable.one → 400 no campo email', async () => {
    const { req, res } = mockReqRes({ ...BASE_BODY, email: 'demo-a1b2c3d4@demo.seatable.one' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.field).toBe('email');
    expect(body.error).toMatch(/placeholder/i);
  });
});

// ============================================================
// G2: conhecimento do demo atravessa a ponte (servidor→servidor)
// ============================================================
describe('demo_token carrega o conhecimento do demo (G2.1)', () => {
  const authComSub = () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ user: { sub: 'user-1', id: 'user-1' } });
  };

  /** Cadeia que serve a busca do demo (maybeSingle) e a escrita do config. */
  function comDemo(demoRow) {
    const { supabaseAdmin } = require('../_lib/supabase');
    supabaseAdmin.schema.mockImplementation(() => ({
      from: () => {
        const chain = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.limit = () => Promise.resolve({ data: [], error: null });
        chain.maybeSingle = () => Promise.resolve({ data: demoRow, error: null });
        chain.single = () => Promise.resolve({ data: { id: 'config-uuid', slug: 'test' }, error: null });
        chain.insert = (payload) => { capturedConfigWrite = payload; return chain; };
        chain.update = (payload) => { capturedConfigWrite = payload; return chain; };
        return chain;
      },
    }));
  }

  const DEMO = {
    id: 'demo-1',
    ai_personality: { humor_type: 'warm', _derived_from_preset: 'neighborhood' },
    scraped_data: {
      menu: { popular_dishes: ['baião de dois'] },
      insights: { vibe_tags: ['casual'] },
      top_reviews: [{ text: 'ótimo', rating: 5 }],
    },
    agent_language: 'pt',
    reservation_settings: { max_party_size: 8, min_party_size: 1, allow_waitlist: true, advance_booking_days: 30 },
    menu_url: 'https://exemplo.com/cardapio.pdf',
  };

  // ── A folha de confirmação ───────────────────────────────────────────────
  //
  // O perfil da IA passa a nascer da PESQUISA em vez das doze perguntas
  // dissertativas. Ele alimenta o system prompt do Manager AI, a persona do
  // agente de voz e a semente da memória — por isso a entrevista não podia
  // simplesmente sair do caminho sem esta fonte no lugar.

  const DEMO_RICO = {
    ...{
      id: 'demo-1',
      agent_language: 'pt',
      scraped_data: {
        cuisine_type: 'Brazilian',
        price_level: 2,
        editorial_summary: 'Restaurante nordestino contemporâneo.',
        insights: {
          vibe_tags: ['casual', 'lively'],
          praise_themes: ['comida autêntica'],
          complaint_themes: ['espera longa'],
          popular_dishes: ['Dadinho de tapioca'],
        },
      },
    },
  };

  test('sem entrevista, o perfil da IA é montado da pesquisa', async () => {
    authComSub();
    comDemo(DEMO_RICO);
    const { req, res } = mockReqRes({ ...BASE_BODY, demo_token: 'tok-1', voz_preset: 'neighborhood' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const p = capturedConfigWrite.restaurant_profile;
    expect(p).toBeDefined();
    expect(p._fonte).toBe('pesquisa');
    expect(p.persona_summary).toBe('Restaurante nordestino contemporâneo.');
    // Os diferenciais são o que os CLIENTES elogiam, não o que o dono diz.
    expect(p.unique_differentiators).toEqual(['comida autêntica']);
    // As queixas viram o que a recepcionista precisa saber para não repetir.
    expect(p.things_to_know).toEqual(['espera longa']);
    expect(p.signature_dishes[0].name).toBe('Dadinho de tapioca');
  });

  test('a voz escolhida na folha vira ai_personality e VENCE a derivada do demo', async () => {
    authComSub();
    comDemo({ ...DEMO_RICO, ai_personality: { humor_type: 'warm', _derived_from_preset: 'neighborhood' } });
    const { req, res } = mockReqRes({ ...BASE_BODY, demo_token: 'tok-1', voz_preset: 'fine_dining' });
    await handler(req, res);

    expect(capturedConfigWrite.ai_personality._derived_from_preset).toBe('fine_dining');
    expect(capturedConfigWrite.ai_personality.communication_style).toBe('formal');
  });

  // Quem respondeu as doze perguntas não pode ter o trabalho descartado.
  test('entrevista feita CONTINUA vencendo o perfil da pesquisa', async () => {
    authComSub();
    comDemo(DEMO_RICO);
    const daEntrevista = { version: 9, persona_summary: 'escrito pelo dono' };
    const { req, res } = mockReqRes({
      ...BASE_BODY, demo_token: 'tok-1',
      restaurant_learning: { restaurant_profile: daEntrevista },
    });
    await handler(req, res);

    expect(capturedConfigWrite.restaurant_profile).toEqual(daEntrevista);
  });

  // Perfil é enriquecimento, não requisito: sem pesquisa o restaurante nasce
  // igual e o painel funciona.
  test('sem scraped_data, não inventa perfil — e o cadastro segue', async () => {
    authComSub();
    comDemo({ id: 'demo-1', agent_language: 'pt' });
    const { req, res } = mockReqRes({ ...BASE_BODY, demo_token: 'tok-1', voz_preset: 'neighborhood' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedConfigWrite.restaurant_profile).toBeUndefined();
  });

  test('persona, scraped_data e menu_url do demo entram no config novo', async () => {
    authComSub();
    comDemo(DEMO);
    const { req, res } = mockReqRes({ ...BASE_BODY, demo_token: 'tok-1' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedConfigWrite.ai_personality).toEqual(DEMO.ai_personality);
    // É isto que o syncKnowledgeBase lia vazio até agora.
    expect(capturedConfigWrite.scraped_data.menu.popular_dishes).toEqual(['baião de dois']);
    expect(capturedConfigWrite.scraped_data.top_reviews).toHaveLength(1);
    expect(capturedConfigWrite.menu_url).toBe('https://exemplo.com/cardapio.pdf');
  });

  test('max/min party do demo vencem os hardcoded; escolha do Passo 3 continua vencendo', async () => {
    authComSub();
    comDemo(DEMO);
    const { req, res } = mockReqRes({ ...BASE_BODY, demo_token: 'tok-1', advance_booking_days: 60 });
    await handler(req, res);

    // 12 era hardcoded no payload e discordava do 8 que a recepcionista do
    // demo usou a conversa inteira.
    expect(capturedConfigWrite.reservation_settings.max_party_size).toBe(8);
    // advance_booking_days É escolha do dono no Passo 3 — o demo não sobrepõe.
    expect(capturedConfigWrite.reservation_settings.advance_booking_days).toBe(60);
  });

  test('sem demo_token nada é carregado', async () => {
    authComSub();
    comDemo(null);
    const { req, res } = mockReqRes({ ...BASE_BODY });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedConfigWrite.ai_personality).toBeUndefined();
    expect(capturedConfigWrite.scraped_data).toBeUndefined();
  });

  test('idioma do demo só entra quando a resolução pelo país caiu em en', async () => {
    // País desconhecido → resolvedLanguage 'en'; o demo infere 'pt' pelo
    // prefixo do telefone (foi o que consertou o demo de Madri em inglês).
    authComSub();
    comDemo(DEMO);
    const { req, res } = mockReqRes({ ...BASE_BODY, country: '', phone_number: '+55 11 98765-4321', demo_token: 'tok-1' });
    await handler(req, res);
    expect(capturedConfigWrite.agent_language).toBe('pt');

    // Já quando o país resolve sozinho, quem manda é o país.
    authComSub();
    comDemo({ ...DEMO, agent_language: 'pt' });
    const r2 = mockReqRes({ ...BASE_BODY, country: 'Spain', demo_token: 'tok-1' });
    await handler(r2.req, r2.res);
    expect(capturedConfigWrite.agent_language).toBe('es');
  });

  test('falha ao ler o demo não derruba o cadastro', async () => {
    authComSub();
    const { supabaseAdmin } = require('../_lib/supabase');
    supabaseAdmin.schema.mockImplementation(() => ({
      from: () => {
        const chain = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.limit = () => Promise.resolve({ data: [], error: null });
        chain.maybeSingle = () => Promise.reject(new Error('boom'));
        chain.single = () => Promise.resolve({ data: { id: 'config-uuid', slug: 'test' }, error: null });
        chain.insert = (payload) => { capturedConfigWrite = payload; return chain; };
        chain.update = (payload) => { capturedConfigWrite = payload; return chain; };
        return chain;
      },
    }));
    const { req, res } = mockReqRes({ ...BASE_BODY, demo_token: 'tok-1' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// G3: conclusão honesta — placar, tetos de tempo e guarda de duplicata
// ============================================================
describe('placar da instalação (G3.2)', () => {
  const authComSub = () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ user: { sub: 'user-1', id: 'user-1' } });
  };

  test('resposta traz o estado real de cada peça, não só success:true', async () => {
    authComSub();
    const { req, res } = mockReqRes({ ...BASE_BODY });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.setup).toBeDefined();
    expect(Object.keys(body.setup).sort()).toEqual(
      ['knowledge_base', 'restaurant', 'subscription', 'voice_agent', 'whatsapp_registry'],
    );
    // Os mocks do agente falham de propósito — antes disso virava 200 mudo e
    // o dono só descobria quando o telefone tocava sem resposta.
    expect(body.setup.voice_agent).toBe('failed');
    expect(body.setup.restaurant).toBe('ok');
  });

  test('agente que estoura o teto é reportado como timeout, não como sucesso', async () => {
    jest.useFakeTimers();
    const { createAgent } = require('../_services/elevenlabsAgentService');
    createAgent.mockImplementationOnce(() => new Promise(() => {})); // nunca resolve
    authComSub();
    const { req, res } = mockReqRes({ ...BASE_BODY });
    const p = handler(req, res);
    await jest.advanceTimersByTimeAsync(16000);
    await p;
    jest.useRealTimers();

    const body = res.json.mock.calls[0][0];
    expect(body.setup.voice_agent).toBe('timeout');
    // Mesmo assim o restaurante existe: nunca vira erro fatal.
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('guarda de restaurante duplicado (G3.3)', () => {
  const authComSub = () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ user: { sub: 'user-1', id: 'user-1' } });
  };

  function comConfigExistente(existente) {
    const { supabaseAdmin } = require('../_lib/supabase');
    supabaseAdmin.schema.mockImplementation(() => ({
      from: () => {
        const chain = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.limit = () => Promise.resolve({ data: [], error: null });
        chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
        chain.single = () => Promise.resolve({ data: existente, error: null });
        chain.insert = (payload) => { capturedConfigWrite = payload; return chain; };
        chain.update = (payload) => { capturedConfigWrite = payload; return chain; };
        return chain;
      },
    }));
  }

  test('restaurante JÁ concluído não é sobrescrito em silêncio — 409', async () => {
    authComSub();
    comConfigExistente({ id: 'rest-vivo', slug: 'mocoto', onboarding_completed: true });
    const { req, res } = mockReqRes({ ...BASE_BODY });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('restaurant_already_exists');
    // O cliente recebe para onde mandar o dono.
    expect(body.restaurant.slug).toBe('mocoto');
  });

  test('confirm_overwrite explícito destrava (escape hatch de suporte)', async () => {
    authComSub();
    comConfigExistente({ id: 'rest-vivo', slug: 'mocoto', onboarding_completed: true });
    const { req, res } = mockReqRes({ ...BASE_BODY, confirm_overwrite: true });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('config existente mas onboarding NÃO concluído segue atualizando', async () => {
    authComSub();
    comConfigExistente({ id: 'rest-parcial', slug: 'x', onboarding_completed: false });
    const { req, res } = mockReqRes({ ...BASE_BODY });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
