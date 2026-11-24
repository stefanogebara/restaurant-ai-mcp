'use strict';

// Old voice agents of deleted restaurants (2026-11-16). Until PR #342, an
// agent could outlive its restaurant; on 2026-11-15 the account held dozens
// of test agents from the May audits ("Link Test", "Bisect Test", "Probe"...),
// and their 336 tools could not be cleaned while they existed.
//
// An agent is deleted only with proof that it belonged to restaurants that no
// longer exist: it has webhook tools on our hosts with a restaurant_id, and
// every one of those restaurants is missing from the database. Each keep rule
// below has its own test.

const { classifyAgent, cleanupAgent, KEEP_NAMES } = require('../_lib/elevenlabs-agent-cleanup');

const LIVE = 'aaaaaaaa-1111-4111-8111-111111111111';
const GONE = 'bbbbbbbb-2222-4222-8222-222222222222';
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const tool = (rid, host = 'seatable.one') => ({ id: `t_${rid || 'x'}`, tool_config: { type: 'webhook', name: 'check_availability',
  api_schema: { url: `https://${host}/api/elevenlabs-webhook?action=x${rid ? `&restaurant_id=${rid}` : ''}` } } });
const base = { linkedIds: new Set(), phoneIds: new Set(), envIds: new Set(), existingIds: new Set([LIVE]), now: NOW };
const agent = (over = {}) => ({ agent_id: 'agent_test01', name: 'Link Test AI Host', last_call_time_unix_secs: null, ...over });

describe('classifyAgent', () => {
  test('an agent whose tools all point at deleted restaurants is an orphan', () => {
    expect(classifyAgent(agent(), [tool(GONE), tool(GONE)], base)).toMatchObject({ bucket: 'orphan', restaurantIds: [GONE] });
  });

  test('the four names you listed are kept, exactly and case-insensitively', () => {
    expect(KEEP_NAMES).toEqual(['seatable orchestrator v2', 'presence companion (twinme)', 'vitoria voz (stevi)', 'seatable multi-restaurant ai']);
    expect(classifyAgent(agent({ name: '  Seatable Orchestrator V2 ' }), [tool(GONE)], base).bucket).toBe('kept_named');
    expect(classifyAgent(agent({ name: 'Seatable Orchestrator v2 copy' }), [tool(GONE)], base).bucket).toBe('orphan');
  });

  test('an agent named in the app settings is kept', () => {
    expect(classifyAgent(agent(), [tool(GONE)], { ...base, envIds: new Set(['agent_test01']) }).bucket).toBe('kept_app_setting');
  });

  test('an agent linked to a restaurant in the database is kept', () => {
    expect(classifyAgent(agent(), [tool(GONE)], { ...base, linkedIds: new Set(['agent_test01']) }).bucket).toBe('kept_linked');
  });

  test('an agent with a phone number is kept', () => {
    expect(classifyAgent(agent(), [tool(GONE)], { ...base, phoneIds: new Set(['agent_test01']) }).bucket).toBe('kept_phone');
  });

  test('an agent with a call in the last 30 days is kept', () => {
    const recent = Math.floor(NOW / 1000) - 5 * 86400;
    const old = Math.floor(NOW / 1000) - 60 * 86400;
    expect(classifyAgent(agent({ last_call_time_unix_secs: recent }), [tool(GONE)], base).bucket).toBe('kept_recent_call');
    expect(classifyAgent(agent({ last_call_time_unix_secs: old }), [tool(GONE)], base).bucket).toBe('orphan');
  });

  test('no restaurant-scoped tool, a live restaurant, or a foreign host is unproven', () => {
    expect(classifyAgent(agent(), [tool(null)], base).bucket).toBe('unproven');
    expect(classifyAgent(agent(), [], base).bucket).toBe('unproven');
    expect(classifyAgent(agent(), [tool(GONE), tool(LIVE)], base).bucket).toBe('unproven');
    expect(classifyAgent(agent(), [tool(GONE, 'roca-black.vercel.app')], base).bucket).toBe('unproven');
  });
});

describe('cleanupAgent re-checks on the server, then deletes without force', () => {
  function fakeApi({ agentStatus = 200, name = 'Link Test AI Host', tools = [tool(GONE)], recent = false, phone = null, deleteStatus = 200 } = {}) {
    const calls = [];
    const fetchImpl = jest.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      const path = url.replace('https://api.elevenlabs.io/v1/convai', '');
      calls.push(`${method} ${path}`);
      if (path.startsWith('/agents/') && method === 'GET') return { ok: agentStatus === 200, status: agentStatus, json: async () => ({ agent_id: 'agent_test01', name }) };
      if (path.startsWith('/agents/') && method === 'DELETE') return { ok: deleteStatus < 300, status: deleteStatus, text: async () => 'x' };
      if (path.startsWith('/tools?')) return { ok: true, status: 200, json: async () => ({ tools, has_more: false }) };
      if (path.startsWith('/conversations?')) return { ok: true, status: 200, json: async () => ({ conversations: recent ? [{ conversation_id: 'c1' }] : [], has_more: false }) };
      if (path.startsWith('/phone-numbers')) return { ok: true, status: 200, json: async () => (phone ? [{ phone_number_id: 'p1', assigned_agent: { agent_id: phone, agent_name: 'x' } }] : []) };
      return { ok: false, status: 500, json: async () => ({}) };
    });
    return { fetchImpl, calls };
  }
  const ctx = (api, over = {}) => ({ key: 'k', fetchImpl: api.fetchImpl, linkedIds: new Set(), envIds: new Set(), existingIds: new Set([LIVE]), now: NOW, ...over });

  test('an orphan is deleted with a plain DELETE (no force)', async () => {
    const api = fakeApi();
    expect(await cleanupAgent('agent_test01', ctx(api))).toMatchObject({ outcome: 'deleted' });
    expect(api.calls).toContain('DELETE /agents/agent_test01');
    expect(api.calls.some(c => c.includes('force'))).toBe(false);
  });

  test('a recent call found at delete time keeps the agent', async () => {
    const api = fakeApi({ recent: true });
    expect(await cleanupAgent('agent_test01', ctx(api))).toMatchObject({ outcome: 'kept', bucket: 'kept_recent_call' });
    expect(api.calls.some(c => c.startsWith('DELETE'))).toBe(false);
  });

  test('a phone number found at delete time keeps the agent', async () => {
    const api = fakeApi({ phone: 'agent_test01' });
    expect(await cleanupAgent('agent_test01', ctx(api))).toMatchObject({ outcome: 'kept', bucket: 'kept_phone' });
  });

  test('ElevenLabs refusing the delete (e.g. used as a subagent) is kept and reported', async () => {
    const api = fakeApi({ deleteStatus: 409 });
    expect(await cleanupAgent('agent_test01', ctx(api))).toMatchObject({ outcome: 'refused_by_elevenlabs', status: 409 });
  });

  test('an agent that is already gone is reported, any other read failure keeps it', async () => {
    expect(await cleanupAgent('agent_test01', ctx(fakeApi({ agentStatus: 404 })))).toMatchObject({ outcome: 'already_gone' });
    expect(await cleanupAgent('agent_test01', ctx(fakeApi({ agentStatus: 429 })))).toMatchObject({ outcome: 'failed', status: 429 });
  });

  test('an unproven agent is never deleted, even if the client sent its id', async () => {
    const api = fakeApi({ tools: [tool(null)] });
    expect(await cleanupAgent('agent_test01', ctx(api))).toMatchObject({ outcome: 'kept', bucket: 'unproven' });
    expect(api.calls.some(c => c.startsWith('DELETE'))).toBe(false);
  });
});
