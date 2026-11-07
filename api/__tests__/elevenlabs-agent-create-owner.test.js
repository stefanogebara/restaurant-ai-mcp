'use strict';

const mockVerifyAuth = jest.fn();
const mockCreateAgent = jest.fn();
const mockGetOrCreateWebhookSecret = jest.fn();
const mockRead = jest.fn();
const mockWrite = jest.fn();
const mockCheckSubscription = jest.fn();
const mockRequireFeature = jest.fn();
const mockReadFilters = [];
const mockWriteFilters = [];

jest.mock('../_lib/auth', () => ({ verifyAuth: (...args) => mockVerifyAuth(...args) }));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: (...args) => mockCheckSubscription(...args),
  requireFeature: (...args) => mockRequireFeature(...args),
}));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_services/elevenlabsAgentService', () => ({
  createAgent: (...args) => mockCreateAgent(...args),
  getOrCreateWebhookSecret: (...args) => mockGetOrCreateWebhookSecret(...args),
}));
jest.mock('../_services/voiceAgentService', () => ({ refreshVoiceAgentPrompt: jest.fn() }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: jest.fn(() => ({
      from: jest.fn(() => ({
        select: jest.fn(() => {
          const query = {
            eq: (field, value) => { mockReadFilters.push([field, value]); return query; },
            maybeSingle: () => mockRead(),
          };
          return query;
        }),
        update: jest.fn(() => {
          const query = {
            eq: (field, value) => { mockWriteFilters.push([field, value]); return query; },
            is: (field, value) => { mockWriteFilters.push([field, value]); return query; },
            select: () => query,
            maybeSingle: () => mockWrite(),
          };
          return query;
        }),
      })),
    })),
  },
}));

const handler = require('../elevenlabs-agent-create');
const ownedConfig = {
  id: 'restaurant-A', restaurant_name: 'Casa A', voice_id: '21m00Tcm4TlvDq8ikWAM',
  agent_language: 'pt', phone: '+5511999999999', city: 'São Paulo', country: 'BR',
  business_hours: {}, agent_greeting: 'Olá', elevenlabs_agent_id: null,
};

async function request(body) {
  const req = { method: 'POST', headers: {}, body };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await handler(req, res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadFilters.length = 0;
  mockWriteFilters.length = 0;
  mockVerifyAuth.mockResolvedValue({ user: { sub: 'owner-A', restaurant_id: 'restaurant-A' } });
  mockRead.mockResolvedValue({ data: { ...ownedConfig }, error: null });
  mockWrite.mockResolvedValue({ data: { id: 'restaurant-A' }, error: null });
  mockCreateAgent.mockResolvedValue({ success: true, agent_id: 'agent-A', tools_created: 2 });
  mockGetOrCreateWebhookSecret.mockResolvedValue('tenant-secret');
  mockCheckSubscription.mockImplementation(async (req, _res, next) => {
    req.subscription = { plan_name: 'growth' };
    next();
  });
  mockRequireFeature.mockImplementation(() => (_req, _res, next) => next());
});

test('empty-body retry creates and saves an agent from the owner config', async () => {
  const res = await request(undefined);
  expect(res.statusCode).toBe(200);
  expect(res.payload).toMatchObject({ success: true, agent_id: 'agent-A' });
  expect(mockReadFilters).toEqual(expect.arrayContaining([
    ['user_id', 'owner-A'], ['is_active', true], ['is_demo', false],
  ]));
  expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({
    restaurantId: 'restaurant-A', restaurant_name: 'Casa A',
    voice_id: ownedConfig.voice_id, language: 'pt',
  }));
  expect(mockGetOrCreateWebhookSecret).toHaveBeenCalledWith('restaurant-A');
  expect(mockWriteFilters).toEqual(expect.arrayContaining([
    ['id', 'restaurant-A'], ['user_id', 'owner-A'], ['elevenlabs_agent_id', null],
  ]));
});

test('body cannot override server-owned voice or restaurant fields', async () => {
  const res = await request({
    restaurant_id: 'restaurant-A', restaurant_name: 'Spoofed', voice_id: 'Spoofed',
    language: 'en', phone: 'spoofed', custom_greeting: 'Spoofed',
  });
  expect(res.statusCode).toBe(200);
  expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({
    restaurant_name: 'Casa A', voice_id: ownedConfig.voice_id,
    language: 'pt', phone: ownedConfig.phone, custom_greeting: 'Olá',
  }));
});

test('another restaurant ID is rejected without provider calls', async () => {
  const res = await request({ restaurant_id: 'restaurant-B' });
  expect(res.statusCode).toBe(403);
  expect(mockCreateAgent).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
});

test('multi-tenant mode is blocked without provider calls', async () => {
  const res = await request({ multi_tenant_mode: true });
  expect(res.statusCode).toBe(403);
  expect(mockCreateAgent).not.toHaveBeenCalled();
});

test('a team member without an owner row cannot create an agent', async () => {
  mockRead.mockResolvedValue({ data: null, error: null });
  const res = await request(undefined);
  expect(res.statusCode).toBe(403);
  expect(mockCreateAgent).not.toHaveBeenCalled();
});

test('authentication failure blocks creation', async () => {
  mockVerifyAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
  const res = await request(undefined);
  expect(res.statusCode).toBe(401);
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockCreateAgent).not.toHaveBeenCalled();
});

test('subscription and voice feature denials block creation', async () => {
  mockCheckSubscription.mockImplementationOnce(async (_req, res) => {
    res.status(403).json({ error: 'No active subscription' });
  });
  expect((await request(undefined)).statusCode).toBe(403);
  expect(mockRead).not.toHaveBeenCalled();

  mockRequireFeature.mockImplementationOnce(() => (_req, res) => {
    res.status(403).json({ error: 'Feature not available' });
  });
  expect((await request(undefined)).statusCode).toBe(403);
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockCreateAgent).not.toHaveBeenCalled();
});

test('existing agent blocks duplicate creation', async () => {
  mockRead.mockResolvedValue({ data: { ...ownedConfig, elevenlabs_agent_id: 'existing' }, error: null });
  const res = await request(undefined);
  expect(res.statusCode).toBe(409);
  expect(mockCreateAgent).not.toHaveBeenCalled();
});

test('provider failure does not claim success or persist an ID', async () => {
  mockCreateAgent.mockResolvedValue({ success: false, error: 'Provider failed' });
  const res = await request(undefined);
  expect(res.statusCode).toBe(502);
  expect(res.payload.success).toBe(false);
  expect(mockWrite).not.toHaveBeenCalled();
});

test('missing tenant webhook secret blocks provider creation', async () => {
  mockGetOrCreateWebhookSecret.mockResolvedValue(null);
  const res = await request(undefined);
  expect(res.statusCode).toBe(500);
  expect(mockCreateAgent).not.toHaveBeenCalled();
});

test('failed or conflicting persistence does not claim success', async () => {
  mockWrite.mockResolvedValue({ data: null, error: null });
  const res = await request(undefined);
  expect(res.statusCode).toBe(409);
  expect(res.payload.success).toBe(false);
});

test('database write failure does not claim success', async () => {
  mockWrite.mockResolvedValue({ data: null, error: { message: 'DB unavailable' } });
  const res = await request(undefined);
  expect(res.statusCode).toBe(500);
  expect(res.payload.success).toBe(false);
});
