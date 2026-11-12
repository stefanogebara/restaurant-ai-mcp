'use strict';

// Founder-only maintenance on /api/elevenlabs-voice-settings (2026-11-12).
// The ElevenLabs key is sensitive on Vercel and cannot be pulled locally, so a
// database language change could never be replayed to a restaurant's own agent
// (Osteria del Sole: database 'pt', agent 'en'). These actions run that replay
// on the server, for the founder only, and never return prompts.

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const mockRows = [];
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => {
        const filters = [];
        const chain = {
          select: () => chain,
          not: (...a) => { filters.push(['not', ...a]); return chain; },
          eq: (c, v) => { filters.push(['eq', c, v]); return chain; },
          maybeSingle: async () => ({ data: mockRows.find(r => r.id === filters.find(f => f[0] === 'eq')?.[2]) || null, error: null }),
          then: (resolve) => Promise.resolve({ data: mockRows.filter(r => r.elevenlabs_agent_id), error: null }).then(resolve),
        };
        return chain;
      },
    }),
  },
}));
const mockAuth = jest.fn();
jest.mock('../_lib/auth', () => ({ verifyAuth: (...a) => mockAuth(...a) }));
const mockSubscription = jest.fn(async (_req, _res, next) => next());
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: (...a) => mockSubscription(...a),
  requireFeature: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn(() => false) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn(async () => false) }));
jest.mock('../_lib/persona-prompt-builder', () => ({ buildPersonaPrompt: c => `PROMPT(${c.agent_language})` }));

const handler = require('../elevenlabs-voice-settings');

const OSTERIA = '152dc287-46e6-4139-b8eb-12d1877b121f';
const CASA = '27b0272b-fd5f-41e2-81c0-e27faca99ac6';
const agents = {};
const agentBody = (language, model, summary) => ({
  conversation_config: { agent: { language, first_message: 'Thank you for calling.', prompt: { prompt: 'secret prompt' } }, tts: { model_id: model } },
  platform_settings: { summary_language: summary },
});
const call = async (method, query) => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; },
    setHeader() {}, end() { return this; } };
  await handler({ method, query, headers: {}, body: {} }, res);
  return res;
};

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'el-test-key';
  delete process.env.VOICE_ADMIN_EMAILS;
  mockRows.length = 0;
  mockRows.push(
    { id: OSTERIA, restaurant_name: 'Osteria del Sole', country: 'Brazil', agent_language: 'pt', agent_greeting: null, elevenlabs_agent_id: 'agent_osteria_0001', ai_config: {} },
    { id: CASA, restaurant_name: 'Casa del Sol', country: 'Spain', agent_language: 'es', agent_greeting: null, elevenlabs_agent_id: 'agent_casa_00002', ai_config: {} },
  );
  agents.agent_osteria_0001 = agentBody('en', 'eleven_flash_v2', 'en');
  agents.agent_casa_00002 = agentBody('es', 'eleven_flash_v2_5', 'es');
  mockAuth.mockResolvedValue({ user: { email: 'stefanogebara@gmail.com', restaurant_id: 'other' } });
  mockSubscription.mockClear();
  global.fetch = jest.fn(async (url, init = {}) => {
    const id = url.split('/').pop();
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      agents[id] = agentBody(body.conversation_config.agent.language, body.conversation_config.tts.model_id, body.platform_settings.summary_language);
      return { ok: true, json: async () => ({}), text: async () => '' };
    }
    return { ok: true, json: async () => agents[id] };
  });
});
afterEach(() => { delete global.fetch; });

test('someone other than the founder is refused before any provider call', async () => {
  mockAuth.mockResolvedValue({ user: { email: 'owner@example.test', restaurant_id: OSTERIA } });
  for (const [method, action] of [['GET', 'admin_language_report'], ['POST', 'admin_language_sync']]) {
    const res = await call(method, { action, restaurant_id: OSTERIA });
    expect(res.statusCode).toBe(403);
  }
  expect(global.fetch).not.toHaveBeenCalled();
});

test('the report reads every own agent, writes nothing and returns no prompt', async () => {
  const res = await call('GET', { action: 'admin_language_report' });
  expect(res.statusCode).toBe(200);
  expect(res.body.rows).toEqual([
    expect.objectContaining({ restaurant_name: 'Osteria del Sole', agent_language: 'pt', status: 'mismatch', agent: { language: 'en', model: 'eleven_flash_v2', summary: 'en' } }),
    expect.objectContaining({ restaurant_name: 'Casa del Sol', agent_language: 'es', status: 'ok' }),
  ]);
  expect(JSON.stringify(res.body)).not.toMatch(/secret prompt|PROMPT\(/);
  expect(global.fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  expect(mockSubscription).not.toHaveBeenCalled();
});

test('sync changes only the named agent and confirms it reads back in sync', async () => {
  const res = await call('POST', { action: 'admin_language_sync', restaurant_id: OSTERIA });
  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({ success: true, changed: true,
    after: { status: 'ok', agent: { language: 'pt', model: 'eleven_flash_v2_5', summary: 'pt-br' } } });
  const patches = global.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
  expect(patches).toHaveLength(1);
  expect(patches[0][0]).toMatch(/agent_osteria_0001$/);
  expect(patches[0][1].headers['xi-api-key']).toBe('el-test-key');
});

test('an agent already in sync is not patched', async () => {
  const res = await call('POST', { action: 'admin_language_sync', restaurant_id: CASA });
  expect(res.body).toMatchObject({ success: true, changed: false });
  expect(global.fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
});

test('wrong method, bad id, unknown restaurant and missing key are refused', async () => {
  expect((await call('POST', { action: 'admin_language_report' })).statusCode).toBe(405);
  expect((await call('GET', { action: 'admin_language_sync', restaurant_id: OSTERIA })).statusCode).toBe(405);
  expect((await call('POST', { action: 'admin_language_sync', restaurant_id: 'x' })).statusCode).toBe(400);
  expect((await call('POST', { action: 'admin_language_sync', restaurant_id: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
  delete process.env.ELEVENLABS_API_KEY;
  expect((await call('GET', { action: 'admin_language_report' })).statusCode).toBe(503);
});
