const mockVerifyAuth = jest.fn();
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockFetch = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyAuth: (...args) => mockVerifyAuth(...args) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn(() => false) }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    rpc: (...args) => mockRpc(...args),
    schema: () => ({
      from: (table) => {
        const filters = {};
        const query = {
          select: (...args) => { mockSelect(table, args); return query; },
          update: (...args) => { mockUpdate(table, args); return query; },
          eq: (key, value) => { filters[key] = value; return query; },
          limit: () => query,
          maybeSingle: async () => {
            if (table === 'restaurant_config' && filters.user_id === 'user-a' && filters.id === 'restaurant-a') {
              return { data: { id: 'restaurant-a' }, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => ({
            data: { id: 'restaurant-a', restaurant_name: 'A', elevenlabs_agent_id: 'agent-a', ai_config: {} },
            error: null
          })
        };
        return query;
      }
    })
  }
}));

process.env.TWILIO_ACCOUNT_SID = 'test-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-token';
process.env.TWILIO_PHONE_NUMBER = '+15550000001';
process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';

const handler = require('../phone-integration-simple');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockVerifyAuth.mockResolvedValue({ user: { sub: 'user-a', restaurant_id: 'restaurant-a' } });
});

test.each([
  ['register', 'POST'],
  ['unregister', 'POST'],
  ['status', 'GET'],
  ['test-call', 'POST'],
  ['fix-tools', 'POST'],
  ['diagnose', 'GET']
])('%s rejects another restaurant before provider or database mutation', async (action, method) => {
  const req = {
    method,
    headers: {},
    query: { action, restaurant_id: 'restaurant-b' },
    body: { restaurant_id: 'restaurant-b', to_number: '+15550000002' }
  };
  const res = response();

  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('list-phones cannot expose platform provider inventory', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { action: 'list-phones' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(mockSelect).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('list-phones rejects an unauthenticated caller', async () => {
  mockVerifyAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { action: 'list-phones' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockFetch).not.toHaveBeenCalled();
});

test('register stops on a shared number claim conflict before any provider call or local write', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001' } });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);

  expect(mockRpc).toHaveBeenCalledWith('claim_platform_phone', {
    p_restaurant_id: 'restaurant-a', p_phone_number: '+15550000001'
  });
  expect(res.status).toHaveBeenCalledWith(409);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('register fails closed if the claim migration is missing', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '42883' } });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});
