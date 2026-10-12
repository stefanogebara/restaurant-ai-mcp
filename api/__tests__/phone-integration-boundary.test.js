const mockVerifyAuth = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();
const mockQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  maybeSingle: (...args) => mockMaybeSingle(...args),
  single: (...args) => mockSingle(...args),
};

jest.mock('../_lib/auth', () => ({ verifyAuth: (...args) => mockVerifyAuth(...args) }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: jest.fn(() => ({ from: jest.fn(() => mockQuery) })) },
}));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn(() => false) }));

const handler = require('../phone-integration-simple');

function response() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyAuth.mockResolvedValue({ user: { sub: 'owner-a', restaurant_id: 'restaurant-b' } });
  mockMaybeSingle.mockResolvedValue({ data: { id: 'restaurant-a' }, error: null });
  mockSingle.mockResolvedValue({ data: {
    id: 'restaurant-a', restaurant_name: 'Cantina A', elevenlabs_agent_id: 'agent-a',
    ai_config: { phone: { status: 'active', number: '+551150289356', number_id: 'shared-number' } },
  }, error: null });
});

test('rejects a restaurant ID supplied by another owner before any mutation', async () => {
  const req = { headers: {}, method: 'POST', query: { action: 'unregister' }, body: { restaurant_id: 'restaurant-b' } };
  const res = response();
  await handler(req, res);
  expect(res.code).toBe(403);
  expect(mockSingle).not.toHaveBeenCalled();
});

test('does not reassign the shared phone number through self-service register', async () => {
  const req = { headers: {}, method: 'POST', query: { action: 'register' }, body: {} };
  const res = response();
  await handler(req, res);
  expect(res.code).toBe(409);
  expect(mockSingle).not.toHaveBeenCalled();
});

test('does not report a local-only disconnect as a real phone deactivation', async () => {
  const req = { headers: {}, method: 'POST', query: { action: 'unregister' }, body: {} };
  const res = response();
  await handler(req, res);
  expect(res.code).toBe(409);
  expect(mockSingle).not.toHaveBeenCalled();
});

test('downgrades stale local active state and never exposes the shared number as owned', async () => {
  const req = { headers: {}, method: 'GET', query: { action: 'status' }, body: {} };
  const res = response();
  await handler(req, res);
  expect(res.code).toBe(200);
  expect(res.body.restaurant.status).toBe('needs_review');
  expect(res.body.restaurant.phone_number).toBeNull();
  expect(res.body.platform.routing_verified).toBe(false);
});

test('does not expose platform inventory or pretend a test call was placed', async () => {
  for (const action of ['list-phones', 'test-call']) {
    const res = response();
    await handler({ headers: {}, method: 'GET', query: { action }, body: {} }, res);
    expect([403, 409]).toContain(res.code);
  }
});
