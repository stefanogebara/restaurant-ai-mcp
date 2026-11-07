'use strict';

process.env.ELEVENLABS_API_KEY = 'test-only-key';
process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID = '009feaa21d50415bbd87da12d0379704';

const mockMaybeSingle = jest.fn();
const mockIs = jest.fn();
const mockQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  maybeSingle: (...args) => mockMaybeSingle(...args),
  is: (...args) => mockIs(...args),
};
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: jest.fn(() => ({ from: jest.fn(() => mockQuery) })) },
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { createAgent, getOrCreateWebhookSecret } = require('../_services/elevenlabsAgentService');
const secret = `el_whsec_${'a'.repeat(64)}`;
const args = { restaurantId: 'restaurant-1', restaurant_name: 'Cantina', voice_id: '21m00Tcm4TlvDq8ikWAM' };

beforeEach(() => {
  jest.clearAllMocks();
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockIs.mockResolvedValue({ error: null });
  global.fetch = jest.fn();
});

test('never returns a newly generated secret that was not confirmed in the database', async () => {
  expect(await getOrCreateWebhookSecret('restaurant-1')).toBeNull();
});

test('returns null when the conditional write matched no row and the reread has no secret', async () => {
  mockMaybeSingle
    .mockResolvedValueOnce({ data: { elevenlabs_webhook_secret: null }, error: null })
    .mockResolvedValueOnce({ data: { elevenlabs_webhook_secret: null }, error: null });
  expect(await getOrCreateWebhookSecret('restaurant-1')).toBeNull();
  expect(mockIs).toHaveBeenCalledWith('elevenlabs_webhook_secret', null);
});

test('uses only the secret confirmed by the database after a conditional write', async () => {
  mockMaybeSingle
    .mockResolvedValueOnce({ data: { elevenlabs_webhook_secret: null }, error: null })
    .mockResolvedValueOnce({ data: { elevenlabs_webhook_secret: secret }, error: null });
  expect(await getOrCreateWebhookSecret('restaurant-1')).toBe(secret);
});

test('does not create external tools or an agent when the restaurant secret is unavailable', async () => {
  const result = await createAgent(args);
  expect(result.success).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('does not create an agent without a restaurant identity', async () => {
  const result = await createAgent({ ...args, restaurantId: null });
  expect(result.success).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('does not create a partially functional agent when only some tools were created', async () => {
  mockMaybeSingle.mockResolvedValue({ data: { elevenlabs_webhook_secret: secret }, error: null });
  let toolCalls = 0;
  global.fetch.mockImplementation(async url => {
    if (String(url).endsWith('/tools')) {
      toolCalls++;
      return toolCalls === 1
        ? { ok: true, json: async () => ({ id: 'tool-1' }) }
        : { ok: false, text: async () => 'provider error' };
    }
    return { ok: true, json: async () => ({ agent_id: 'agent-1' }) };
  });
  const result = await createAgent(args);
  expect(result.success).toBe(false);
  expect(toolCalls).toBeGreaterThan(1);
  expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/agents/create'))).toBe(false);
});

test('production tools call the stable Seatable domain, not a deployment-specific URL', async () => {
  mockMaybeSingle.mockResolvedValue({ data: { elevenlabs_webhook_secret: secret }, error: null });
  const oldUrl = process.env.VERCEL_URL;
  const oldEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_URL = 'old-deployment.vercel.app';
  process.env.VERCEL_ENV = 'production';
  let toolCalls = 0;
  global.fetch.mockImplementation(async url => String(url).endsWith('/tools')
    ? { ok: true, json: async () => ({ id: `tool-${++toolCalls}` }) }
    : { ok: true, json: async () => ({ agent_id: 'agent-1' }) });
  try {
    expect((await createAgent(args)).success).toBe(true);
    const toolRequest = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/tools'));
    const toolUrl = JSON.parse(toolRequest[1].body).tool_config.api_schema.url;
    expect(new URL(toolUrl).origin).toBe('https://seatable.one');
  } finally {
    if (oldUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = oldUrl;
    if (oldEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv;
  }
});
