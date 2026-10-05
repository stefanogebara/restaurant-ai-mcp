const mockValidateRequest = jest.fn(() => true);
const mockRows = [];
let mockClaim = null;

jest.mock('twilio', () => ({ validateRequest: (...args) => mockValidateRequest(...args) }));
jest.mock('../_lib/cors', () => ({ setWebhookCors: jest.fn(), handlePreflight: jest.fn(() => false) }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ from: (table) => mockQuery(table) }),
    from: (table) => mockQuery(table)
  }
}));

function mockQuery(table) {
  const filters = {};
  const builder = {
    select: () => builder,
    eq: (key, value) => { filters[key] = value; return builder; },
    filter: (key, _operator, value) => { filters[key] = value; return builder; },
    limit: async (count) => {
      if (table !== 'restaurant_config') return { data: [], error: null };
      const matches = mockRows.filter(row => {
        if (filters.phone && row.phone !== filters.phone) return false;
        if (filters['ai_config->phone->>number']
          && row.ai_config?.phone?.number !== filters['ai_config->phone->>number']) return false;
        if (filters['ai_config->phone->>status']
          && row.ai_config?.phone?.status !== filters['ai_config->phone->>status']) return false;
        return true;
      });
      return { data: matches.slice(0, count), error: null };
    },
    maybeSingle: async () => ({
      data: table === 'platform_phone_claims' ? mockClaim
        : table === 'voice_ab_tests' ? null : null,
      error: null
    })
  };
  return builder;
}

process.env.TWILIO_AUTH_TOKEN = 'test-token';
process.env.TWILIO_PHONE_NUMBER = '+15550000001';
const handler = require('../twilio-voice-connect');

function response() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
}

function request() {
  return {
    headers: { host: 'example.test', 'x-twilio-signature': 'signed' },
    url: '/api/twilio-voice-connect',
    body: { To: '+15550000001', From: '+15550000002', CallSid: 'call-1' },
    query: {}
  };
}

function restaurant(id, phone, aiPhone) {
  return {
    id, restaurant_name: id, phone,
    ai_config: aiPhone ? { phone: { number: aiPhone, status: 'active' } } : {},
    voice_engine: 'openai_realtime', voice_engine_status: 'active',
    elevenlabs_agent_id: `agent-${id}`
  };
}

beforeEach(() => {
  mockRows.length = 0;
  mockClaim = null;
  mockValidateRequest.mockClear();
});

test('rejects two restaurants with the same direct number', async () => {
  mockRows.push(restaurant('a', '+15550000001'), restaurant('b', '+15550000001'));
  const res = response();
  await handler(request(), res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.send.mock.calls[0][0]).toContain('not currently configured');
  expect(res.send.mock.calls[0][0]).not.toContain('<Stream');
});

test('rejects a direct match that conflicts with another restaurant AI number', async () => {
  mockRows.push(restaurant('a', '+15550000001'), restaurant('b', '+15550000003', '+15550000001'));
  const res = response();
  await handler(request(), res);
  expect(res.send.mock.calls[0][0]).not.toContain('<Stream');
});

test('rejects the shared number without a matching claim', async () => {
  mockRows.push(restaurant('a', '+15550000003', '+15550000001'));
  mockClaim = { restaurant_id: 'b' };
  const res = response();
  await handler(request(), res);
  expect(res.send.mock.calls[0][0]).not.toContain('<Stream');
});

test('routes a unique number only when the claim names that restaurant', async () => {
  mockRows.push(restaurant('a', '+15550000003', '+15550000001'));
  mockClaim = { restaurant_id: 'a' };
  const res = response();
  await handler(request(), res);
  expect(res.send.mock.calls[0][0]).toContain('<Stream');
  expect(res.send.mock.calls[0][0]).toContain('value="a"');
});
