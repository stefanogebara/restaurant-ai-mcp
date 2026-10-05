const mockVerifyAuth = jest.fn();
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockFetch = jest.fn();
let mockAvailability;
let mockRestaurantConfig;

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
            if (table === 'restaurant_members' && filters.user_id === 'user-host' && filters.restaurant_id === 'restaurant-a') {
              return { data: { restaurant_id: 'restaurant-a', role: 'host' }, error: null };
            }
            if (table === 'restaurant_members' && filters.user_id === 'user-manager' && filters.restaurant_id === 'restaurant-a') {
              return { data: { restaurant_id: 'restaurant-a', role: 'manager' }, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => ({
            data: mockRestaurantConfig,
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
  mockAvailability = 'owned_by_this_restaurant';
  mockRestaurantConfig = {
    id: 'restaurant-a', restaurant_name: 'A', elevenlabs_agent_id: 'agent-a', ai_config: {}
  };
  mockRpc.mockImplementation(async (name) => name === 'platform_phone_availability'
    ? { data: mockAvailability, error: null } : { data: null, error: null });
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [{
      phone_number: '+15550000001', phone_number_id: 'phone-a',
      assigned_agent: { agent_id: 'agent-a' }
    }]
  });
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

test('register stops on a shared number claim conflict before any provider mutation', async () => {
  mockRpc.mockImplementation(async (name) => name === 'platform_phone_availability'
    ? { data: mockAvailability, error: null } : { data: null, error: { code: 'P0001' } });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);

  expect(mockRpc).toHaveBeenCalledWith('claim_platform_phone', {
    p_restaurant_id: 'restaurant-a', p_phone_number: '+15550000001'
  });
  expect(res.status).toHaveBeenCalledWith(409);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][1].method).toBe('GET');
});

test('register fails closed if the claim migration is missing', async () => {
  mockRpc.mockImplementation(async (name) => name === 'platform_phone_availability'
    ? { data: null, error: { code: '42883' } } : { data: null, error: null });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('register cannot take an unclaimed shared number', async () => {
  mockAvailability = 'available';
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalledWith('claim_platform_phone', expect.anything());
});

test('register cannot reassign a provider number bound to another agent', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [{
      phone_number: '+15550000001', phone_number_id: 'phone-a',
      assigned_agent: { agent_id: 'agent-b' }
    }]
  });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(mockRpc).not.toHaveBeenCalledWith('claim_platform_phone', expect.anything());
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('unregister does not release a shared number to another tenant', async () => {
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'unregister' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('host members cannot change phone integration', async () => {
  mockVerifyAuth.mockResolvedValue({ user: { sub: 'user-host', restaurant_id: 'restaurant-a' } });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('manager members can reach the support-only disconnect response', async () => {
  mockVerifyAuth.mockResolvedValue({ user: { sub: 'user-manager', restaurant_id: 'restaurant-a' } });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'unregister' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    error: 'This shared phone requires support-assisted disconnection.'
  }));
});

test('existing owner can refresh the same provider assignment without a phone PATCH', async () => {
  mockRpc.mockImplementation(async (name) => {
    if (name === 'platform_phone_availability') return { data: 'owned_by_this_restaurant', error: null };
    if (name === 'claim_platform_phone') return { data: 'claim-token', error: null };
    if (name === 'activate_platform_phone') return { data: true, error: null };
    return { data: null, error: null };
  });
  mockFetch.mockImplementation(async (url) => ({
    ok: true,
    json: async () => url.endsWith('/phone-numbers')
      ? [{ phone_number: '+15550000001', phone_number_id: 'phone-a', assigned_agent: { agent_id: 'agent-a' } }]
      : { conversation_config: { agent: { prompt: { tool_ids: ['tool-a'] } } } }
  }));
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'register' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockRpc).toHaveBeenCalledWith('activate_platform_phone', expect.objectContaining({
    p_restaurant_id: 'restaurant-a', p_number_id: 'phone-a'
  }));
  expect(mockFetch.mock.calls.every(([url, options]) =>
    !url.includes('/phone-numbers') || options?.method === 'GET')).toBe(true);
});

test('status hides the shared number when another restaurant owns it', async () => {
  mockAvailability = 'unavailable';
  mockRestaurantConfig.ai_config.phone = { status: 'active', number: '+15550000001', number_id: 'phone-a' };
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { action: 'status' }, body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    restaurant: expect.objectContaining({ status: 'unavailable', phone_number: null, phone_number_id: null }),
    platform: { line_availability: 'unavailable', twilio_phone: null }
  }));
});
