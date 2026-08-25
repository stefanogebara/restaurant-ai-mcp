/**
 * Demo API Tests
 *
 * Tests for create, session, and convert actions.
 */

// ---------------------------------------------------------------------------
// Fake environment
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.CLIENT_URL = 'https://restaurant-ai-mcp.vercel.app';

// ---------------------------------------------------------------------------
// Supabase mock chain
// ---------------------------------------------------------------------------
const mockSingle = jest.fn();
const mockLimit = jest.fn(() => ({ single: mockSingle }));
const mockGt = jest.fn(() => ({ single: mockSingle, limit: mockLimit }));
const mockEq3 = jest.fn(() => ({ single: mockSingle, limit: mockLimit, gt: mockGt }));
const mockEq2 = jest.fn(() => ({ eq: mockEq3, single: mockSingle, limit: mockLimit, gt: mockGt }));
const mockEq1 = jest.fn(() => ({ eq: mockEq2, single: mockSingle, limit: mockLimit, gt: mockGt }));
const mockSelect = jest.fn(() => ({ eq: mockEq1, single: mockSingle }));
const mockUpdate = jest.fn(() => ({ eq: mockEq1 }));
const mockInsert = jest.fn(() => ({ select: mockSelect, error: null }));
const mockFrom = jest.fn(() => ({
  select: mockSelect,
  update: mockUpdate,
  insert: mockInsert,
}));
const mockSchema = jest.fn(() => ({ from: mockFrom }));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: mockSchema, from: mockFrom },
  getAllTables: jest.fn(),
  getUpcomingReservations: jest.fn(),
}));

jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/validation', () => ({
  validateEmail: jest.fn().mockReturnValue({ valid: true }),
}));

jest.mock('resend', () => ({
  Resend: jest.fn(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-123' }) },
  })),
}));

const { verifyAuth } = require('../_lib/auth');
const { getAllTables, getUpcomingReservations } = require('../_lib/supabase');
const handler = require('../demo');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res = {};
  res.setHeader = jest.fn();
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

const VALID_CREATE_BODY = {
  restaurant_name: 'Bella Cucina',
  cuisine_type: 'Italian',
  city: 'Amsterdam',
  contact_email: 'owner@bellacucina.nl',
  contact_name: 'Marco Rossi',
};

// ---------------------------------------------------------------------------
// POST ?action=create
// ---------------------------------------------------------------------------
describe('POST ?action=create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default happy-path supabase stubs
    mockSchema.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate, insert: mockInsert });
    mockInsert.mockReturnValue({
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({
          data: { id: 'demo-rest-1', restaurant_name: 'Bella Cucina' },
          error: null,
        }),
      })),
    });
  });

  test('missing restaurant_name returns 400', async () => {
    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: { ...VALID_CREATE_BODY, restaurant_name: undefined },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/restaurant_name/i);
  });

  test('no contact_email still creates — entry is gate-free (Demo em Conversa F1)', async () => {
    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: { ...VALID_CREATE_BODY, contact_email: undefined, contact_name: undefined },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);

    // The config insert must satisfy restaurant_config's NOT NULL + regex
    // CHECK on email with a placeholder, while demo_contact_email stays null
    // so welcome/nurture emails know there is nobody to write to yet.
    const insertPayload = mockInsert.mock.calls[0][0];
    expect(insertPayload.demo_contact_email).toBeNull();
    expect(insertPayload.demo_contact_name).toBeNull();
    expect(insertPayload.email).toMatch(/^demo-[0-9a-f-]+@demo\.seatable\.one$/);
  });

  test('scrape path requires only restaurant_name + city', async () => {
    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: {
        restaurant_name: 'Empório Quintal da Vovó',
        city: 'Presidente Prudente',
        scraped_data: { cuisine_type: 'Brazilian', phone: '+55 18 99744-0280' },
      },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.demo_token).toBeDefined();
  });

  test('manual path (restaurante novo, F4) stores owner-configured data + derives persona', async () => {
    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: {
        restaurant_name: 'Cantinho da Vó Zilda',
        city: 'Presidente Prudente',
        cuisine_type: 'Brazilian',
        open_time: '18:00',
        close_time: '23:00',
        vibe_tags: ['romantic', 'upscale', 'INVÁLIDA!!', 42],
      },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);

    const insertPayload = mockInsert.mock.calls[0][0];
    // scraped_data vira o "dado real" da recepcionista: manual:true + o que
    // o dono configurou; tags fora da forma (maiúsculas/símbolos/números)
    // caem fora no saneamento.
    expect(insertPayload.scraped_data.manual).toBe(true);
    expect(insertPayload.scraped_data.vibe_tags).toEqual(['romantic', 'upscale']);
    expect(insertPayload.scraped_data.business_hours.monday).toEqual(
      expect.objectContaining({ open_time: '18:00', close_time: '23:00' }),
    );
    // romantic+upscale pontuam fine_dining no vibe-to-persona-preset
    expect(insertPayload.ai_personality).toEqual(
      expect.objectContaining({ _derived_from_preset: 'fine_dining' }),
    );
  });

  test('provided contact_email is still validated and stored', async () => {
    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: { ...VALID_CREATE_BODY },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const insertPayload = mockInsert.mock.calls[0][0];
    expect(insertPayload.demo_contact_email).toBe('owner@bellacucina.nl');
    expect(insertPayload.email).toBe('owner@bellacucina.nl');
  });

  // Regressão 25/ago: a coluna `timezone` tem default 'UTC' e o insert nunca
  // a preenchia. Os 21 demos vivos em produção estavam TODOS em UTC —
  // inclusive Mocotó e Bráz Pizzaria, que são São Paulo. O fuso já era
  // calculado no handler, mas só alimentava os seeds (G0.12b); o registro
  // seguia mentindo, e quem lê a coluna (reservation-validator, manager-agent)
  // opera 3h adiantado num demo brasileiro.
  test('o fuso resolvido é PERSISTIDO no registro, não só usado nos seeds', async () => {
    mockFrom.mockImplementation(() => ({ select: mockSelect, update: mockUpdate, insert: mockInsert }));

    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: { ...VALID_CREATE_BODY, city: 'São Paulo', country: 'BR' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const insertPayload = mockInsert.mock.calls[0][0];
    expect(insertPayload.timezone).toBe('America/Sao_Paulo');
    expect(insertPayload.timezone).not.toBe('UTC');
  });

  test('demo europeu grava o fuso do país, não o do servidor', async () => {
    mockFrom.mockImplementation(() => ({ select: mockSelect, update: mockUpdate, insert: mockInsert }));

    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: { ...VALID_CREATE_BODY, city: 'Roma', country: 'IT' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockInsert.mock.calls[0][0].timezone).toBe('Europe/Rome');
  });

  // O caminho "restaurante novo" (F4) chega SEM país — não tem ficha no
  // Google. suggestTimezone devolve 'UTC' nesse caso, que é truthy, então o
  // guarda `|| 'America/Sao_Paulo'` nunca disparava. Em produção (25/ago,
  // 20:01 SP) esse demo mandou as 3 reservas de hoje para amanhã 19:30/20:00/
  // 20:30 — os fallbackTimes — enquanto dois demos com país resolvido,
  // criados no mesmo minuto, acertaram. Painel vazio no horário nobre, para
  // exatamente a persona que o F4 existe para atender.
  test('demo sem país NÃO cai em UTC — nenhum restaurante opera em UTC', async () => {
    mockFrom.mockImplementation(() => ({ select: mockSelect, update: mockUpdate, insert: mockInsert }));

    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: { ...VALID_CREATE_BODY, restaurant_name: 'Zebrallina Kftz', city: 'Cidade Inventada' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockInsert.mock.calls[0][0].timezone).not.toBe('UTC');
  });

  test('valid body returns 201 with demo_token and demo_url', async () => {
    // Mock public.reservations insert (seeding fake reservations)
    mockFrom.mockImplementation((table) => {
      return { select: mockSelect, update: mockUpdate, insert: mockInsert };
    });

    const req = {
      method: 'POST',
      query: { action: 'create' },
      body: { ...VALID_CREATE_BODY },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.demo_token).toBeDefined();
    expect(body.demo_url).toMatch(/\/demo\//);
  });
});

// ---------------------------------------------------------------------------
// GET ?action=session
// ---------------------------------------------------------------------------
describe('GET ?action=session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSchema.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate, insert: mockInsert });
  });

  test('missing token returns 400', async () => {
    const req = {
      method: 'GET',
      query: { action: 'session' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/token/i);
  });

  test('unknown token returns 404', async () => {
    const gtSingle = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const eqGt = jest.fn().mockReturnValue({ single: gtSingle });
    const selectEq = jest.fn().mockReturnValue({ gt: eqGt });
    const fromSelect = jest.fn().mockReturnValue({ eq: selectEq });
    mockFrom.mockReturnValue({ select: fromSelect });
    mockSchema.mockReturnValue({ from: mockFrom });

    const req = {
      method: 'GET',
      query: { action: 'session', token: 'nonexistent-token' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toMatch(/not found|expired/i);
  });

  test('valid token returns 200 with restaurant, tables, reservations, daysLeft', async () => {
    const futureDate = new Date(Date.now() + 5 * 86400000).toISOString();
    const mockConfig = {
      id: 'demo-rest-1',
      restaurant_name: 'Bella Cucina',
      demo_token: 'valid-token-abc',
      demo_expires_at: futureDate,
    };

    const gtSingle = jest.fn().mockResolvedValue({ data: mockConfig, error: null });
    const eqGt = jest.fn().mockReturnValue({ single: gtSingle });
    const selectEq = jest.fn().mockReturnValue({ gt: eqGt });
    const fromSelect = jest.fn().mockReturnValue({ eq: selectEq });
    mockFrom.mockReturnValue({ select: fromSelect });
    mockSchema.mockReturnValue({ from: mockFrom });

    getAllTables.mockResolvedValue({ success: true, tables: [{ id: 't1', capacity: 4 }] });
    getUpcomingReservations.mockResolvedValue({
      success: true,
      reservations: [{ id: 'r1', customer_name: 'Alice' }],
    });

    const req = {
      method: 'GET',
      query: { action: 'session', token: 'valid-token-abc' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.restaurant).toEqual(mockConfig);
    expect(body.tables).toBeDefined();
    expect(body.reservations).toBeDefined();
    expect(body.daysLeft).toBeGreaterThan(0);
  });

  // Regressão 25/ago (#79): a sessão chamava getUpcomingReservations SEM o
  // fuso. O fallback da função compara os horários — que estão na parede do
  // restaurante — contra o relógio do SERVIDOR, e a lambda roda em UTC. Às
  // 20:27 em São Paulo o filtro virava `time >= 23:27` e descartava as quatro
  // reservas da noite. Os seeds nasciam certos no banco (isso o #76 já tinha
  // consertado) e o painel abria vazio mesmo assim.
  test('a sessão passa o fuso do restaurante ao buscar as próximas reservas', async () => {
    const futureDate = new Date(Date.now() + 5 * 86400000).toISOString();
    const mockConfig = {
      id: 'demo-rest-1',
      restaurant_name: 'Mocotó',
      timezone: 'America/Sao_Paulo',
      demo_token: 'valid-token-abc',
      demo_expires_at: futureDate,
    };

    const gtSingle = jest.fn().mockResolvedValue({ data: mockConfig, error: null });
    mockFrom.mockReturnValue({ select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({ gt: jest.fn().mockReturnValue({ single: gtSingle }) }) }) });
    mockSchema.mockReturnValue({ from: mockFrom });

    getAllTables.mockResolvedValue({ success: true, tables: [] });
    getUpcomingReservations.mockResolvedValue({ success: true, reservations: [] });

    const res = makeRes();
    await handler({ method: 'GET', query: { action: 'session', token: 'valid-token-abc' }, headers: {} }, res);

    expect(getUpcomingReservations).toHaveBeenCalledWith('demo-rest-1', 'America/Sao_Paulo');
  });
});

// ---------------------------------------------------------------------------
// POST ?action=convert
// ---------------------------------------------------------------------------
describe('POST ?action=convert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSchema.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate, insert: mockInsert });
  });

  test('no auth returns 401', async () => {
    verifyAuth.mockResolvedValue({ error: 'Authentication required', status: 401 });
    const req = {
      method: 'POST',
      query: { action: 'convert' },
      body: { token: 'some-token' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('missing token returns 400', async () => {
    verifyAuth.mockResolvedValue({ user: { id: 'user-1', restaurant_id: 'real-rest-1' } });
    const req = {
      method: 'POST',
      query: { action: 'convert' },
      body: {},
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/token/i);
  });

  test('token válido carimba demo_converted_at e devolve 200 — sem migrar seeds nem clobberar config', async () => {
    verifyAuth.mockResolvedValue({ user: { id: 'user-1', restaurant_id: 'real-rest-1' } });

    // Fluxo novo (F6): 1 select (demo por token, is_demo) + 1 update
    // (demo_converted_at). NADA de copiar config para o restaurante real nem
    // mover reservas/mesas seed — clientes fictícios não entram em painel real.
    const single = jest.fn().mockResolvedValue({
      data: { id: 'demo-rest-1', demo_converted_at: null },
      error: null,
    });
    const eq2 = jest.fn().mockReturnValue({ single });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const select = jest.fn().mockReturnValue({ eq: eq1 });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    mockFrom.mockReturnValue({ select, update });
    mockSchema.mockReturnValue({ from: mockFrom });

    const req = {
      method: 'POST',
      query: { action: 'convert' },
      body: { token: 'valid-demo-token' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({ demo_converted_at: expect.any(String) });
  });

  test('já convertido é idempotente — não reescreve o carimbo', async () => {
    verifyAuth.mockResolvedValue({ user: { id: 'user-1', restaurant_id: 'real-rest-1' } });

    const single = jest.fn().mockResolvedValue({
      data: { id: 'demo-rest-1', demo_converted_at: '2026-08-24T20:00:00Z' },
      error: null,
    });
    const eq2 = jest.fn().mockReturnValue({ single });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const select = jest.fn().mockReturnValue({ eq: eq1 });
    const update = jest.fn();
    mockFrom.mockReturnValue({ select, update });
    mockSchema.mockReturnValue({ from: mockFrom });

    const res = makeRes();
    await handler({ method: 'POST', query: { action: 'convert' }, body: { token: 'tok' }, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST ?action=attach-contact (Demo em Conversa F1 — captura tardia)
// ---------------------------------------------------------------------------
describe('POST ?action=attach-contact', () => {
  function mockDemoLookup(result) {
    const single = jest.fn().mockResolvedValue(result);
    const gt = jest.fn().mockReturnValue({ single });
    const eq2 = jest.fn().mockReturnValue({ gt });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const select = jest.fn().mockReturnValue({ eq: eq1 });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    mockFrom.mockReturnValue({ select, update });
    mockSchema.mockReturnValue({ from: mockFrom });
    return { update, updateEq };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('missing demo_token returns 400', async () => {
    const req = {
      method: 'POST',
      query: { action: 'attach-contact' },
      body: { contact_email: 'owner@place.br' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/demo_token/i);
  });

  test('missing contact_email returns 400', async () => {
    const req = {
      method: 'POST',
      query: { action: 'attach-contact' },
      body: { demo_token: 'tok-1' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/contact_email/i);
  });

  test('unknown or expired token returns 404', async () => {
    mockDemoLookup({ data: null, error: { code: 'PGRST116' } });
    const req = {
      method: 'POST',
      query: { action: 'attach-contact' },
      body: { demo_token: 'expired-tok', contact_email: 'owner@place.br' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('happy path stores contact and returns 200', async () => {
    const { update } = mockDemoLookup({
      data: {
        id: 'demo-rest-1',
        restaurant_name: 'Cantina da Praça',
        demo_token: 'tok-1',
        demo_contact_email: null,
      },
      error: null,
    });
    const req = {
      method: 'POST',
      query: { action: 'attach-contact' },
      body: { demo_token: 'tok-1', contact_email: 'dona@cantina.br', contact_name: 'Dona Zilda' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(update).toHaveBeenCalledWith({
      demo_contact_email: 'dona@cantina.br',
      demo_contact_name: 'Dona Zilda',
      email: 'dona@cantina.br',
    });
  });

  test('sem contact_name o nome fica NULL — nunca o local-part do e-mail', async () => {
    // A captura pós-aha manda só o endereço; derivar o nome dele gerava
    // "stefanogebara+demotest, seu painel está no ar" no welcome e vazava
    // para o prefill do onboarding.
    const { update } = mockDemoLookup({
      data: { id: 'demo-rest-1', restaurant_name: 'Cantina da Praça', demo_token: 'tok-1', demo_contact_email: null },
      error: null,
    });
    const req = {
      method: 'POST',
      query: { action: 'attach-contact' },
      body: { demo_token: 'tok-1', contact_email: 'dona@cantina.br' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(update).toHaveBeenCalledWith({
      demo_contact_email: 'dona@cantina.br',
      demo_contact_name: null,
      email: 'dona@cantina.br',
    });
  });
});
