/**
 * Tests for api/elevenlabs-signed-url.js — the cross-tenant ownership
 * guard added during the voice/WhatsApp audit pass.
 *
 * Previously the endpoint took `?agent_id=...` from the browser verbatim,
 * which would let any authenticated user open a conversation against any
 * other restaurant's voice agent by guessing the ID. The hardened version
 * resolves the caller's OWN agent from `restaurant_config.elevenlabs_agent_id`
 * and only honors the query-param form when it matches that owned ID (or
 * the public demo fallback).
 */

const handler = require('../elevenlabs-signed-url');

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

const mockVerifyJWT = jest.fn();
jest.mock('../_lib/auth', () => ({
  verifyJWT: (...args) => mockVerifyJWT(...args),
}));

const mockSingle = jest.fn();
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => mockSingle(),
          }),
        }),
      }),
    }),
  },
}));

function createReq(method, query = {}, headers = {}) {
  return {
    method,
    query,
    headers: { authorization: 'Bearer fake-jwt', ...headers },
  };
}

function createRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    setHeader(k, v) { res.headers[k] = v; },
    end() { return res; },
  };
  return res;
}

describe('GET /api/elevenlabs-signed-url — ownership guard', () => {
  const originalEnv = process.env.ELEVENLABS_API_KEY;
  const originalDemo = process.env.ELEVENLABS_AGENT_ID;

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    delete process.env.ELEVENLABS_AGENT_ID;
    delete process.env.VITE_ELEVENLABS_AGENT_ID;
    mockVerifyJWT.mockReset();
    mockSingle.mockReset();
    // Default: don't actually hit ElevenLabs — we just want to confirm
    // the request was authorised or rejected before fetch fires.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ signed_url: 'wss://api.elevenlabs.io/...?token=abc' }),
    });
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalEnv;
    if (originalDemo === undefined) delete process.env.ELEVENLABS_AGENT_ID;
    else process.env.ELEVENLABS_AGENT_ID = originalDemo;
  });

  test('401 without a valid JWT', async () => {
    mockVerifyJWT.mockResolvedValueOnce(null);
    const res = createRes();
    await handler(createReq('GET', { agent_id: 'agent_X' }), res);
    expect(res.statusCode).toBe(401);
  });

  test('403 when authenticated user asks for an agent_id that does NOT match their owned agent', async () => {
    mockVerifyJWT.mockResolvedValueOnce({ restaurant_id: 'rest-A' });
    // rest-A owns agent_A — but caller asked for agent_B.
    mockSingle.mockResolvedValueOnce({ data: { elevenlabs_agent_id: 'agent_A' }, error: null });
    const res = createRes();
    await handler(createReq('GET', { agent_id: 'agent_B_belongs_to_someone_else' }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/do not own/i);
  });

  test('returns signed_url when the requested agent_id matches the owned one', async () => {
    mockVerifyJWT.mockResolvedValueOnce({ restaurant_id: 'rest-A' });
    mockSingle.mockResolvedValueOnce({ data: { elevenlabs_agent_id: 'agent_A' }, error: null });
    const res = createRes();
    await handler(createReq('GET', { agent_id: 'agent_A' }), res);
    // Happy path uses res.json() directly (Vercel default 200) — statusCode
    // stays null. Assert the absence of error + the presence of body.
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(401);
    expect(res.body).toEqual(expect.objectContaining({ signed_url: expect.any(String) }));
  });

  test('returns signed_url when no agent_id is provided — auto-resolves from owned agent', async () => {
    mockVerifyJWT.mockResolvedValueOnce({ restaurant_id: 'rest-A' });
    mockSingle.mockResolvedValueOnce({ data: { elevenlabs_agent_id: 'agent_A' }, error: null });
    const res = createRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).not.toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ signed_url: expect.any(String) }));
  });

  test('user with NO owned agent CAN request the public demo agent if env-configured', async () => {
    process.env.ELEVENLABS_AGENT_ID = 'agent_demo_public';
    mockVerifyJWT.mockResolvedValueOnce({ restaurant_id: 'rest-A' });
    // rest-A has no agent yet (mid-onboarding scenario).
    mockSingle.mockResolvedValueOnce({ data: { elevenlabs_agent_id: null }, error: null });
    const res = createRes();
    await handler(createReq('GET', { agent_id: 'agent_demo_public' }), res);
    expect(res.statusCode).not.toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ signed_url: expect.any(String) }));
  });

  test('user with NO owned agent canNOT request an arbitrary agent_id', async () => {
    process.env.ELEVENLABS_AGENT_ID = 'agent_demo_public';
    mockVerifyJWT.mockResolvedValueOnce({ restaurant_id: 'rest-A' });
    mockSingle.mockResolvedValueOnce({ data: { elevenlabs_agent_id: null }, error: null });
    const res = createRes();
    await handler(createReq('GET', { agent_id: 'agent_some_stranger' }), res);
    expect(res.statusCode).toBe(403);
  });

  test('user with no restaurant_id and no demo env returns 400 (nothing resolves)', async () => {
    mockVerifyJWT.mockResolvedValueOnce({ restaurant_id: null });
    const res = createRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).toBe(400);
  });
});
