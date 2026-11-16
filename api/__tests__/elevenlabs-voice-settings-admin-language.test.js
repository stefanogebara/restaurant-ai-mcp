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
const agentBody = (language, model, summary, prompt = 'secret prompt') => ({
  conversation_config: { agent: { language, first_message: 'Thank you for calling.', prompt: { prompt } }, tts: { model_id: model } },
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
  agents.agent_casa_00002 = agentBody('es', 'eleven_flash_v2_5', 'es', 'PROMPT(es)');
  mockAuth.mockResolvedValue({ user: { email: 'stefanogebara@gmail.com', restaurant_id: 'other' } });
  mockSubscription.mockClear();
  global.fetch = jest.fn(async (url, init = {}) => {
    const id = url.split('/').pop();
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      const current = agents[id];
      agents[id] = agentBody(body.conversation_config.agent.language ?? current.conversation_config.agent.language,
        body.conversation_config.tts?.model_id ?? current.conversation_config.tts.model_id,
        body.platform_settings?.summary_language ?? current.platform_settings.summary_language,
        body.conversation_config.agent.prompt.prompt);
      return { ok: true, json: async () => ({}), text: async () => '' };
    }
    return { ok: true, json: async () => agents[id] };
  });
});
afterEach(() => { delete global.fetch; });

test('someone other than the founder is refused before any provider call', async () => {
  mockAuth.mockResolvedValue({ user: { email: 'owner@example.test', restaurant_id: OSTERIA } });
  for (const [method, action] of [['GET', 'admin_language_report'], ['POST', 'admin_language_sync'], ['GET', 'admin_tools_report'], ['POST', 'admin_tools_sync'],
    ['GET', 'admin_tools_orphans'], ['POST', 'admin_tools_orphans_delete'],
    ['GET', 'admin_agents_orphans'], ['POST', 'admin_agents_orphans_delete']]) {
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

test('an agent with old instructions is reported as outdated and gets only the new prompt', async () => {
  agents.agent_casa_00002 = agentBody('es', 'eleven_flash_v2_5', 'es', 'old instructions');
  const report = await call('GET', { action: 'admin_language_report' });
  expect(report.body.rows[1]).toMatchObject({ restaurant_name: 'Casa del Sol', status: 'outdated', reasons: ['prompt outdated'] });
  expect(JSON.stringify(report.body)).not.toMatch(/old instructions/);
  const res = await call('POST', { action: 'admin_language_sync', restaurant_id: CASA });
  expect(res.body).toMatchObject({ success: true, changed: true, after: { status: 'ok', agent: { language: 'es' } } });
  const patch = JSON.parse(global.fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')[1].body);
  expect(patch).toEqual({ conversation_config: { agent: { prompt: { prompt: 'PROMPT(es)' } } } });
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

describe('tools actions', () => {
  const { buildToolDefinitions } = jest.requireActual('../_services/elevenlabsAgentService');
  const toolStore = new Map();
  beforeEach(() => {
    process.env.VERCEL_ENV = 'production';
    mockRows[0].elevenlabs_webhook_secret = 'el_whsec_osteria';
    mockRows[1].elevenlabs_webhook_secret = 'el_whsec_casa';
    toolStore.clear();
    for (const row of mockRows) {
      const defs = buildToolDefinitions('https://seatable.one', row.id, row.elevenlabs_webhook_secret);
      const ids = defs.map((def, i) => {
        const id = `${row.elevenlabs_agent_id}_t${i}`;
        // Osteria still has the pre-F4 lookup description.
        const cfg = row.id === OSTERIA && def.name === 'lookup_reservation'
          ? { ...def, description: 'Find an existing reservation by customer phone number or name.' } : def;
        toolStore.set(id, { id, tool_config: cfg });
        return id;
      });
      agents[row.elevenlabs_agent_id].conversation_config.agent.prompt = { tool_ids: ids };
    }
    global.fetch = jest.fn(async (url, init = {}) => {
      const id = url.split('/').pop();
      if (url.includes('/convai/tools/')) {
        if (init.method === 'PATCH') toolStore.set(id, { id, tool_config: JSON.parse(init.body).tool_config });
        return { ok: true, json: async () => toolStore.get(id), text: async () => '' };
      }
      return { ok: true, json: async () => agents[id] };
    });
  });

  test('the report reads the tools of every agent, writes nothing and returns no secret', async () => {
    const res = await call('GET', { action: 'admin_tools_report' });
    expect(res.statusCode).toBe(200);
    expect(res.body.rows).toEqual([
      expect.objectContaining({ restaurant_name: 'Osteria del Sole', status: 'outdated', reasons: ['lookup_reservation outdated'] }),
      expect.objectContaining({ restaurant_name: 'Casa del Sol', status: 'ok' }),
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/el_whsec|seatable\.one\/api/);
    expect(global.fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  test('sync updates only the outdated tool of the named restaurant and confirms it', async () => {
    const res = await call('POST', { action: 'admin_tools_sync', restaurant_id: OSTERIA });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, changed: true, after: { status: 'ok' } });
    const patches = global.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0][0]).toMatch(/agent_osteria_0001_t\d$/);
  });
});


describe('leftover tools actions', () => {
  const GONE = 'bbbbbbbb-2222-4222-8222-222222222222';
  const tool = (id, rid, host = 'seatable.one') => ({ id, tool_config: { type: 'webhook', name: 'check_availability',
    api_schema: { url: `https://${host}/api/elevenlabs-webhook?action=x${rid ? `&restaurant_id=${rid}` : ''}`,
      request_headers: { Authorization: 'Bearer el_whsec_secret' } } } });
  const callBody = async (method, query, body) => {
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
    await handler({ method, query, headers: {}, body }, res);
    return res;
  };
  let store;
  beforeEach(() => {
    store = new Map([
      ['tool_live', tool('tool_live', OSTERIA)],
      ['tool_gone', tool('tool_gone', GONE)],
      ['tool_nobody', tool('tool_nobody', null)],
      ['tool_foreign', tool('tool_foreign', GONE, 'roca-black.vercel.app')],
    ]);
    global.fetch = jest.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      if (url.includes('/convai/tools?')) return { ok: true, status: 200, json: async () => ({ tools: [...store.values()], has_more: false }) };
      if (url.includes('/dependent-agents')) return { ok: true, status: 200, json: async () => ({ agents: [{ type: 'unknown', id: 'agent_gone' }], branches: [], has_more: false }) };
      const toolId = (url.split('/convai/tools/')[1] || '').split('?')[0];
      if (toolId && method === 'GET') return store.has(toolId) ? { ok: true, status: 200, json: async () => store.get(toolId) } : { ok: false, status: 404, json: async () => ({}) };
      if (toolId && method === 'DELETE') { store.delete(toolId); return { ok: true, status: 200, text: async () => '' }; }
      return { ok: false, status: 404, json: async () => ({}) }; // agents: all gone
    });
  });

  test('the list returns ids and counts only, never URLs or secrets', async () => {
    const res = await callBody('GET', { action: 'admin_tools_orphans' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, missing_restaurant: ['tool_gone'], unscoped: ['tool_nobody'],
      counts: { total: 4, existing_restaurant: 1, missing_restaurant: 1, unscoped: 1, foreign_host: 1 } });
    expect(JSON.stringify(res.body)).not.toMatch(/el_whsec|https:\/\//);
    expect(global.fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  test('delete re-checks each id: only the leftover of a missing restaurant goes', async () => {
    const res = await callBody('POST', { action: 'admin_tools_orphans_delete' },
      { bucket: 'missing_restaurant', tool_ids: ['tool_gone', 'tool_live', 'tool_nobody', 'tool_foreign'] });
    expect(res.statusCode).toBe(200);
    expect(res.body.summary).toMatchObject({ deleted: 1, refused: 3, dependent_agent_statuses: { 404: 1 } });
    expect([...store.keys()].sort()).toEqual(['tool_foreign', 'tool_live', 'tool_nobody']);
  });

  test('bad bucket, empty or oversized batches and wrong methods are refused', async () => {
    expect((await callBody('POST', { action: 'admin_tools_orphans_delete' }, { bucket: 'everything', tool_ids: ['tool_gone'] })).statusCode).toBe(400);
    expect((await callBody('POST', { action: 'admin_tools_orphans_delete' }, { bucket: 'unscoped', tool_ids: [] })).statusCode).toBe(400);
    const many = Array.from({ length: 26 }, (_, i) => `tool_${i}`);
    expect((await callBody('POST', { action: 'admin_tools_orphans_delete' }, { bucket: 'unscoped', tool_ids: many })).statusCode).toBe(400);
    expect((await callBody('POST', { action: 'admin_tools_orphans' })).statusCode).toBe(405);
    expect((await callBody('GET', { action: 'admin_tools_orphans_delete' })).statusCode).toBe(405);
    expect(store.size).toBe(4);
  });
});


describe('old agents actions', () => {
  const GONE = 'bbbbbbbb-2222-4222-8222-222222222222';
  const tool = rid => ({ id: `t_${rid}`, tool_config: { type: 'webhook', name: 'x', api_schema: { url: `https://seatable.one/api/elevenlabs-webhook?action=x&restaurant_id=${rid}` } } });
  const callBody = async (method, query, body) => {
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
    await handler({ method, query, headers: {}, body }, res);
    return res;
  };
  let agentsStore;
  beforeEach(() => {
    agentsStore = new Map([
      ['agent_orphan1', { agent_id: 'agent_orphan1', name: 'Link Test AI Host', tools: [tool(GONE)] }],
      ['agent_osteria_0001', { agent_id: 'agent_osteria_0001', name: 'Osteria del Sole AI Host', tools: [tool(OSTERIA)] }],
      ['agent_orch', { agent_id: 'agent_orch', name: 'Seatable Orchestrator v2', tools: [tool(GONE)] }],
    ]);
    global.fetch = jest.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      const path = url.replace('https://api.elevenlabs.io/v1/convai', '');
      if (path.startsWith('/phone-numbers')) return { ok: true, status: 200, json: async () => [] };
      if (path.startsWith('/agents?')) return { ok: true, status: 200, json: async () => ({ agents: [...agentsStore.values()].map(({ tools, ...a }) => a), has_more: false }) };
      if (path.startsWith('/tools?')) { const id = new URL(url).searchParams.get('used_by_agent_id'); return { ok: true, status: 200, json: async () => ({ tools: agentsStore.get(id)?.tools || [], has_more: false }) }; }
      if (path.startsWith('/conversations?')) return { ok: true, status: 200, json: async () => ({ conversations: [], has_more: false }) };
      const id = path.split('/agents/')[1];
      if (id && method === 'GET') return agentsStore.has(id) ? { ok: true, status: 200, json: async () => agentsStore.get(id) } : { ok: false, status: 404, json: async () => ({}) };
      if (id && method === 'DELETE') { agentsStore.delete(id); return { ok: true, status: 200, text: async () => '' }; }
      return { ok: false, status: 500, json: async () => ({}) };
    });
  });

  test('classification is read-only and keeps the linked and the named agents', async () => {
    const res = await callBody('GET', { action: 'admin_agents_orphans' });
    expect(res.statusCode).toBe(200);
    expect(Object.fromEntries(res.body.rows.map(r => [r.name, r.bucket]))).toEqual({
      'Link Test AI Host': 'orphan', 'Osteria del Sole AI Host': 'kept_linked', 'Seatable Orchestrator v2': 'kept_named' });
    expect(global.fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  test('delete re-checks: only the orphan goes, the others are kept', async () => {
    const res = await callBody('POST', { action: 'admin_agents_orphans_delete' }, { agent_ids: ['agent_orphan1', 'agent_osteria_0001', 'agent_orch'] });
    expect(res.body.summary).toEqual({ deleted: 1, kept: 2 });
    expect([...agentsStore.keys()].sort()).toEqual(['agent_orch', 'agent_osteria_0001']);
    expect(global.fetch.mock.calls.some(([url]) => url.includes('force'))).toBe(false);
  });

  test('batches above 5 and wrong methods are refused', async () => {
    const many = Array.from({ length: 6 }, (_, i) => `agent_${i}`);
    expect((await callBody('POST', { action: 'admin_agents_orphans_delete' }, { agent_ids: many })).statusCode).toBe(400);
    expect((await callBody('POST', { action: 'admin_agents_orphans' })).statusCode).toBe(405);
    expect(agentsStore.size).toBe(3);
  });
});
