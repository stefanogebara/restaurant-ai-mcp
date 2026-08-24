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

  test('valid auth and valid token returns 200', async () => {
    verifyAuth.mockResolvedValue({ user: { id: 'user-1', restaurant_id: 'real-rest-1' } });

    const demoConfig = {
      id: 'demo-rest-1',
      restaurant_name: 'Bella Cucina',
      restaurant_type: 'Italian',
      city: 'Amsterdam',
      country: 'NL',
      business_hours: {},
      max_party_size: 8,
      advance_booking_days: 30,
      cancellation_policy: '',
    };
    const realConfig = { id: 'real-rest-1', restaurant_name: 'My Real Restaurant' };

    // Sequence of supabase calls:
    // 1. Find demo by token => demoConfig
    // 2. Get real restaurant config => realConfig
    // 3. Update real config => ok
    // 4. Update reservations restaurant_id => ok
    // 5. Mark demo as converted => ok

    mockSingle
      .mockResolvedValueOnce({ data: demoConfig, error: null })  // find demo
      .mockResolvedValueOnce({ data: realConfig, error: null }); // get real config

    mockEq1.mockReturnValue({ eq: mockEq2, single: mockSingle });
    mockEq2.mockReturnValue({ eq: mockEq3, single: mockSingle });
    mockEq3.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq1, single: mockSingle });

    // update calls return eq chains that resolve ok
    const mockEqUpdate = jest.fn().mockResolvedValue({ error: null });
    const mockUpdateChain = { eq: mockEqUpdate };
    mockUpdate.mockReturnValue(mockUpdateChain);

    const req = {
      method: 'POST',
      query: { action: 'convert' },
      body: { token: 'valid-demo-token' },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
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
});
