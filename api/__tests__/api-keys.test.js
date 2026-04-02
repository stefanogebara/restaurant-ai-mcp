/**
 * Tests for api/api-keys.js
 * Covers list, create, revoke actions and auth guards.
 */

// ---------------------------------------------------------------------------
// Mock setup — must be before require()
// ---------------------------------------------------------------------------

const mockVerifyAuth = jest.fn();
const mockHashApiKey = jest.fn((k) => `hash_${k}`);
const mockSupabaseAdmin = {
  schema: jest.fn(),
  from: jest.fn(),
};

jest.mock('../_lib/auth', () => ({
  verifyAuth: (...a) => mockVerifyAuth(...a),
}));

jest.mock('../_lib/api-key-auth', () => ({
  hashApiKey: (...a) => mockHashApiKey(...a),
}));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
  rejectOversizedBody: jest.fn().mockReturnValue(false),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn().mockReturnValue(false),
}));

jest.mock('../_lib/validation', () => ({
  sanitizeStringXSS: jest.fn((s) => s),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Build a chainable Supabase query mock that resolves with { data, error }.
 */
function makeChain({ data = null, error = null, count = null } = {}) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    order: jest.fn(),
    single: jest.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data, error });
  // Make the chain itself thenable so .order() without .single() also resolves
  chain.then = (resolve) => resolve({ data, error, count });
  return chain;
}

const handler = require('../api-keys');

// ---------------------------------------------------------------------------
// Setup defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  mockVerifyAuth.mockResolvedValue({
    user: { restaurant_id: 'rest-uuid-1' },
  });

  // Default: .schema('restaurant') returns the admin mock itself
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe('auth guards', () => {
  it('returns 401 when verifyAuth fails', async () => {
    mockVerifyAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'list' }, headers: {}, body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when user has no restaurant_id', async () => {
    mockVerifyAuth.mockResolvedValue({ user: { restaurant_id: null } });
    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'list' }, headers: {}, body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 for unknown action', async () => {
    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'nope' }, headers: {}, body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// action=list
// ---------------------------------------------------------------------------

describe('action=list', () => {
  it('returns api_keys array on success', async () => {
    const keys = [
      { id: 'k1', key_prefix: 'abcd1234', name: 'POS Key', permissions: ['*'],
        is_active: true, last_used_at: null, created_at: '2026-01-01T00:00:00Z', expires_at: null },
    ];
    const chain = makeChain({ data: keys });
    mockSupabaseAdmin.from = jest.fn().mockReturnValue(chain);

    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'list' }, headers: {}, body: {} },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, api_keys: keys });
    expect(mockSupabaseAdmin.schema).toHaveBeenCalledWith('restaurant');
    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('api_keys');
  });

  it('returns empty array when no keys exist', async () => {
    const chain = makeChain({ data: [] });
    mockSupabaseAdmin.from = jest.fn().mockReturnValue(chain);

    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'list' }, headers: {}, body: {} },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, api_keys: [] });
  });

  it('returns 500 when DB query fails', async () => {
    const chain = makeChain({ data: null, error: { message: 'DB error' } });
    mockSupabaseAdmin.from = jest.fn().mockReturnValue(chain);

    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'list' }, headers: {}, body: {} },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 405 for non-GET method', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'list' }, headers: {}, body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ---------------------------------------------------------------------------
// action=create
// ---------------------------------------------------------------------------

describe('action=create', () => {
  function setupCreateChain(existingCount = 0, insertedData = null) {
    // First call: count check; second call: insert
    let callIndex = 0;
    mockSupabaseAdmin.from = jest.fn().mockImplementation(() => {
      callIndex += 1;
      if (callIndex === 1) {
        // Count check chain
        const chain = makeChain({ data: null, error: null, count: existingCount });
        chain.select = jest.fn().mockReturnValue(chain);
        chain.eq = jest.fn().mockReturnValue(chain);
        return chain;
      }
      // Insert chain
      return makeChain({ data: insertedData, error: null });
    });
  }

  it('creates a new API key and returns plaintext key once', async () => {
    const inserted = {
      id: 'new-key-id', key_prefix: 'abc12345', name: 'My POS',
      permissions: ['*'], created_at: '2026-04-01T00:00:00Z', expires_at: null,
    };
    setupCreateChain(0, inserted);

    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'create' }, headers: {},
        body: { name: 'My POS', permissions: ['*'] } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(typeof call.api_key).toBe('string');
    expect(call.api_key).toHaveLength(64); // 32 random bytes as hex
    expect(call.key_info.name).toBe('My POS');
  });

  it('returns 400 when name is missing', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'create' }, headers: {},
        body: { permissions: ['*'] } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid permissions', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'create' }, headers: {},
        body: { name: 'Test', permissions: ['bad:perm'] } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Invalid permissions/);
  });

  it('returns 400 when 10 active keys already exist', async () => {
    const chain = makeChain({ count: 10 });
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    mockSupabaseAdmin.from = jest.fn().mockReturnValue(chain);

    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'create' }, headers: {},
        body: { name: 'One More Key' } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Maximum/);
  });

  it('returns 405 for non-POST method', async () => {
    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'create' }, headers: {},
        body: { name: 'x' } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ---------------------------------------------------------------------------
// action=revoke
// ---------------------------------------------------------------------------

describe('action=revoke', () => {
  it('revokes an existing key', async () => {
    const chain = makeChain({ data: { id: 'k1', name: 'POS Key' }, error: null });
    mockSupabaseAdmin.from = jest.fn().mockReturnValue(chain);

    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'revoke' }, headers: {},
        body: { key_id: 'k1' } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('returns 400 when key_id is missing', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'revoke' }, headers: {}, body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when key not found', async () => {
    const chain = makeChain({ data: null, error: { message: 'not found' } });
    mockSupabaseAdmin.from = jest.fn().mockReturnValue(chain);

    const res = mockRes();
    await handler(
      { method: 'POST', query: { action: 'revoke' }, headers: {},
        body: { key_id: 'missing-id' } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 405 for non-POST method', async () => {
    const res = mockRes();
    await handler(
      { method: 'GET', query: { action: 'revoke' }, headers: {},
        body: { key_id: 'k1' } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
