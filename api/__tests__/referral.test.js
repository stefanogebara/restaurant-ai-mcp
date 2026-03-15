/**
 * Tests for api/referral.js
 *
 * Covers all key handler paths:
 *   GET  ?action=code  - existing code, generates new code, auth guard
 *   POST ?action=track - valid code, missing code, code not found
 *   POST ?action=attach - happy path, self-referral guard, duplicate guard
 *   Invalid method / action - 405 / 400
 */

// ── Supabase mock chain ────────────────────────────────────────────────────
// Terminal resolvers – configure per-test with mockResolvedValueOnce()
const mockSingle = jest.fn();
const mockLimit  = jest.fn(() => ({ single: mockSingle }));
// mockEq2 must include both limit (for .limit(1).single()) and single (for .single() direct)
const mockEq2    = jest.fn(() => ({ limit: mockLimit, single: mockSingle }));
// mockEq1 must include eq, limit, and single to cover all chained call patterns
const mockEq1    = jest.fn(() => ({ eq: mockEq2, limit: mockLimit, single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
const mockUpdate = jest.fn(() => ({ eq: mockEq1 }));
const mockInsert = jest.fn(() => ({ select: mockSelect }));
const mockFrom   = jest.fn(() => ({ select: mockSelect, update: mockUpdate, insert: mockInsert }));
const mockSchema = jest.fn(() => ({ from: mockFrom }));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: mockSchema, from: mockFrom },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  }),
}));

const { verifyAuth } = require('../_lib/auth');
const handler = require('../referral');

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {};
  res.setHeader = jest.fn();
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

function makeReq(overrides = {}) {
  return { method: 'GET', query: {}, body: {}, headers: {}, ...overrides };
}

// ── Reset mocks between tests ───────────────────────────────────────────────
beforeEach(() => jest.clearAllMocks());

// ============================================================
// GET ?action=code
// ============================================================
describe('GET ?action=code', () => {
  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValue({ error: 'Authentication required', status: 401 });
    const req = makeReq({ method: 'GET', query: { action: 'code' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns existing referral code from restaurant_config', async () => {
    verifyAuth.mockResolvedValue({ user: { restaurant_id: 'rest-1' } });
    // First single() call: config lookup with existing code
    mockSingle.mockResolvedValueOnce({
      data: { id: 'rest-1', referral_code: 'LUIGI-K4M2' },
      error: null,
    });
    const req = makeReq({ method: 'GET', query: { action: 'code' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.code).toBe('LUIGI-K4M2');
    expect(body.referral_url).toMatch(/LUIGI-K4M2/);
    expect(body.stats).toBeDefined();
  });

  test('generates and saves a new code when none exists', async () => {
    verifyAuth.mockResolvedValue({ user: { restaurant_id: 'rest-2' } });
    // Config lookup returns a row with no code
    mockSingle.mockResolvedValueOnce({
      data: { id: 'rest-2', referral_code: null },
      error: null,
    });
    // Update call: mockEq1 returns a non-Promise object so updateError = undefined (success)
    const req = makeReq({ method: 'GET', query: { action: 'code' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    // Code should be generated (non-null, matches pattern WORD-XXXX)
    expect(body.code).toMatch(/^[A-Z]+-[A-Z0-9]{4}$/);
    expect(mockUpdate).toHaveBeenCalled();
  });

  test('returns 404 when restaurant_config row is not found', async () => {
    verifyAuth.mockResolvedValue({ user: { restaurant_id: 'rest-missing' } });
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    const req = makeReq({ method: 'GET', query: { action: 'code' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 when user has no restaurant_id', async () => {
    verifyAuth.mockResolvedValue({ user: {} }); // no restaurant_id
    const req = makeReq({ method: 'GET', query: { action: 'code' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ============================================================
// POST ?action=track
// ============================================================
describe('POST ?action=track', () => {
  test('returns valid: true for a known, active referral code', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'rest-3' }, error: null });
    const req = makeReq({
      method: 'POST',
      query: { action: 'track' },
      body: { code: 'BELLA-XY7Z' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].valid).toBe(true);
  });

  test('returns valid: false for unknown code (PGRST116)', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    const req = makeReq({
      method: 'POST',
      query: { action: 'track' },
      body: { code: 'FAKE-CODE' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].valid).toBe(false);
  });

  test('returns 400 for missing code in body', async () => {
    const req = makeReq({
      method: 'POST',
      query: { action: 'track' },
      body: {},
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  test('returns 400 for code that exceeds max length', async () => {
    const req = makeReq({
      method: 'POST',
      query: { action: 'track' },
      body: { code: 'A'.repeat(21) },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ============================================================
// POST ?action=attach
// ============================================================
describe('POST ?action=attach', () => {
  test('returns 400 when missing referral_code', async () => {
    const req = makeReq({
      method: 'POST',
      query: { action: 'attach' },
      body: {},
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('happy path — links referee to referrer and inserts referral row', async () => {
    verifyAuth.mockResolvedValue({ user: { restaurant_id: 'referee-rest' } });
    // 1st single(): referrer lookup → finds restaurant with different id
    mockSingle.mockResolvedValueOnce({ data: { id: 'referrer-rest' }, error: null });
    // 2nd single(): existing referral check → no existing row
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    // insert returns no error (mockInsert → mockSelect → mockEq1 resolves as non-Promise)
    mockInsert.mockReturnValueOnce({ error: null });

    const req = makeReq({
      method: 'POST',
      query: { action: 'attach' },
      body: { referral_code: 'PRIMO-AB3C' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.attached).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
  });

  test('self-referral guard — attached: false when referrer_id === referee_id', async () => {
    verifyAuth.mockResolvedValue({ user: { restaurant_id: 'same-rest' } });
    // Referrer lookup returns same id as referee
    mockSingle.mockResolvedValueOnce({ data: { id: 'same-rest' }, error: null });

    const req = makeReq({
      method: 'POST',
      query: { action: 'attach' },
      body: { referral_code: 'GUSTO-ZZ99' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.attached).toBe(false);
    // Insert must NOT have been called
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('duplicate guard — no double-insert when referral already exists', async () => {
    verifyAuth.mockResolvedValue({ user: { restaurant_id: 'referee-rest-2' } });
    // Referrer lookup → different restaurant
    mockSingle.mockResolvedValueOnce({ data: { id: 'referrer-rest-2' }, error: null });
    // Existing check → already exists
    mockSingle.mockResolvedValueOnce({ data: { id: 'existing-referral-id' }, error: null });

    const req = makeReq({
      method: 'POST',
      query: { action: 'attach' },
      body: { referral_code: 'CIBO-QQ11' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.attached).toBe(true);
    expect(body.already_existed).toBe(true);
    // No insert should happen
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValue({ error: 'Authentication required', status: 401 });
    const req = makeReq({
      method: 'POST',
      query: { action: 'attach' },
      body: { referral_code: 'VINO-AA22' },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ============================================================
// OPTIONS (CORS preflight)
// ============================================================
describe('OPTIONS preflight', () => {
  test('returns 200 for CORS preflight', async () => {
    const req = makeReq({ method: 'OPTIONS', query: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });
});

// ============================================================
// Invalid action → 400
// ============================================================
describe('Invalid action', () => {
  test('returns 400 for unknown action', async () => {
    const req = makeReq({ method: 'POST', query: { action: 'nonexistent' }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });
});
