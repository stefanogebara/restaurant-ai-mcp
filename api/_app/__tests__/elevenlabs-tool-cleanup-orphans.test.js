'use strict';

// Leftover ElevenLabs tools (15/11/2026). Until PR #342, deleting an agent
// left its 7 webhook tools behind; the account held 758 tools, ~396 of them
// for 63 restaurants that no longer exist. This module lists them and deletes
// them one by one, re-checking every rule on the server for every id.
//
// Rules (each has a test below):
// - only webhook tools, only on our own hosts (never roca-black.vercel.app);
// - bucket "missing_restaurant": restaurant_id in the URL matches no
//   restaurant_config row; bucket "unscoped": no restaurant_id at all;
//   tools of existing restaurants are never candidates;
// - a tool is deleted only if EVERY dependent agent (agents and branches)
//   answers 404 on GET — anything else keeps it;
// - deletion uses force=true and its answer is checked.

const {
  toolOwner, classifyTools, listAllTools, cleanupTool,
} = require('../_lib/elevenlabs-tool-cleanup');

const EXISTING = 'aaaaaaaa-1111-4111-8111-111111111111';
const GONE = 'bbbbbbbb-2222-4222-8222-222222222222';
const webhook = (id, url, name = 'check_availability') => ({ id, tool_config: { type: 'webhook', name, api_schema: { url } } });
const at = (host, rid) => `https://${host}/api/elevenlabs-webhook?action=x${rid ? `&restaurant_id=${rid}` : ''}`;

describe('toolOwner and classifyTools', () => {
  test('reads host and restaurant id from the webhook URL', () => {
    expect(toolOwner(webhook('t', at('seatable.one', GONE)))).toEqual({ webhook: true, host: 'seatable.one', ours: true, restaurantId: GONE });
    expect(toolOwner(webhook('t', at('restaurant-ai-lyo3jhqqd-stefanogebaras-projects.vercel.app', null)))).toMatchObject({ ours: true, restaurantId: null });
    expect(toolOwner(webhook('t', at('roca-black.vercel.app', GONE)))).toMatchObject({ ours: false });
    expect(toolOwner({ id: 't', tool_config: { type: 'client', name: 'x' } })).toMatchObject({ webhook: false });
  });

  test('sorts tools into buckets; existing restaurants and foreign hosts are never candidates', () => {
    const tools = [
      webhook('live', at('seatable.one', EXISTING)),
      webhook('gone1', at('seatable.one', GONE)),
      webhook('gone2', at('restaurant-ai-mf480l5ub-stefanogebaras-projects.vercel.app', GONE)),
      webhook('nobody', at('restaurant-ai-mcp.vercel.app', null)),
      webhook('foreign', at('roca-black.vercel.app', GONE)),
      { id: 'client', tool_config: { type: 'client', name: 'x' } },
    ];
    const c = classifyTools(tools, new Set([EXISTING]));
    expect(c.missing_restaurant).toEqual(['gone1', 'gone2']);
    expect(c.unscoped).toEqual(['nobody']);
    expect(c.counts).toEqual({ total: 6, existing_restaurant: 1, missing_restaurant: 2, missing_restaurants: 1, unscoped: 1, foreign_host: 1, not_webhook: 1 });
  });
});

test('listAllTools follows the cursor, 100 per page, oldest first', async () => {
  const pages = { '': { tools: [webhook('a', at('seatable.one', GONE))], has_more: true, next_cursor: 'c2' },
    c2: { tools: [webhook('b', at('seatable.one', GONE))], has_more: false } };
  const fetchImpl = jest.fn(async (url) => {
    const u = new URL(url);
    expect(u.searchParams.get('page_size')).toBe('100');
    expect(u.searchParams.get('sort_by')).toBe('created_at');
    return { ok: true, status: 200, json: async () => pages[u.searchParams.get('cursor') || ''] };
  });
  expect((await listAllTools('k', fetchImpl)).map(t => t.id)).toEqual(['a', 'b']);
});

describe('cleanupTool re-checks everything before a force delete', () => {
  // A fake ElevenLabs: tools, their dependents, and which agents still exist.
  function fakeApi({ tool, dependents = { agents: [], branches: [] }, agents = {}, deleteStatus = 200 }) {
    const calls = [];
    const fetchImpl = jest.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      calls.push(`${method} ${url.replace('https://api.elevenlabs.io/v1/convai', '')}`);
      if (/\/tools\/[^/?]+\/dependent-agents/.test(url)) return { ok: true, status: 200, json: async () => ({ ...dependents, has_more: false }) };
      if (/\/tools\/[^/?]+/.test(url) && method === 'GET') return tool ? { ok: true, status: 200, json: async () => tool } : { ok: false, status: 404, json: async () => ({}) };
      if (/\/tools\/[^/?]+/.test(url) && method === 'DELETE') return { ok: deleteStatus < 300, status: deleteStatus, text: async () => 'x' };
      const agentId = url.split('/agents/')[1];
      const status = agents[agentId] ?? 404;
      return { ok: status < 300, status, json: async () => ({}) };
    });
    return { fetchImpl, calls };
  }
  const ctx = (api, bucket = 'missing_restaurant') => ({ key: 'k', bucket, existingIds: new Set([EXISTING]), fetchImpl: api.fetchImpl, agentCache: new Map() });

  test('a tool whose only dependent agent is gone (404) is force-deleted', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', GONE)), dependents: { agents: [{ type: 'unknown', id: 'agent_gone' }], branches: [] } });
    expect(await cleanupTool('t1', ctx(api))).toMatchObject({ id: 't1', outcome: 'deleted' });
    expect(api.calls).toContain('DELETE /tools/t1?force=true');
  });

  test('a dependent agent that still answers 200 keeps the tool', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', GONE)), dependents: { agents: [{ type: 'unknown', id: 'agent_alive' }] }, agents: { agent_alive: 200 } });
    expect(await cleanupTool('t1', ctx(api))).toMatchObject({ outcome: 'kept_in_use' });
    expect(api.calls.some(c => c.startsWith('DELETE'))).toBe(false);
  });

  test('an "available" dependent keeps the tool without asking further', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', GONE)), dependents: { agents: [{ type: 'available', id: 'agent_x', name: 'X' }] } });
    expect(await cleanupTool('t1', ctx(api))).toMatchObject({ outcome: 'kept_in_use' });
  });

  test('a branch of a live agent keeps the tool', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', GONE)),
      dependents: { agents: [], branches: [{ agent_id: 'agent_ab', branch_id: 'b1' }] }, agents: { agent_ab: 200 } });
    expect(await cleanupTool('t1', ctx(api))).toMatchObject({ outcome: 'kept_in_use' });
  });

  test('any status other than 404 for a dependent (e.g. 500) keeps the tool', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', GONE)), dependents: { agents: [{ type: 'unknown', id: 'agent_flaky' }] }, agents: { agent_flaky: 500 } });
    expect(await cleanupTool('t1', ctx(api))).toMatchObject({ outcome: 'kept_in_use' });
  });

  test('a tool of an existing restaurant is refused even if the client sent its id', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', EXISTING)) });
    expect(await cleanupTool('t1', ctx(api))).toMatchObject({ outcome: 'refused' });
    expect(api.calls.some(c => c.startsWith('DELETE'))).toBe(false);
  });

  test('a foreign host or a non-webhook tool is refused', async () => {
    const foreign = fakeApi({ tool: webhook('t1', at('roca-black.vercel.app', GONE)) });
    expect(await cleanupTool('t1', ctx(foreign))).toMatchObject({ outcome: 'refused' });
    const client = fakeApi({ tool: { id: 't2', tool_config: { type: 'client', name: 'x' } } });
    expect(await cleanupTool('t2', ctx(client))).toMatchObject({ outcome: 'refused' });
  });

  test('a tool from the other bucket is refused (no-restaurant tools need their own run)', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', null)) });
    expect(await cleanupTool('t1', ctx(api, 'missing_restaurant'))).toMatchObject({ outcome: 'refused' });
    const api2 = fakeApi({ tool: webhook('t1', at('seatable.one', null)) });
    expect(await cleanupTool('t1', ctx(api2, 'unscoped'))).toMatchObject({ outcome: 'deleted' });
  });

  test('a failed force delete is reported, a missing tool counts as gone', async () => {
    const failing = fakeApi({ tool: webhook('t1', at('seatable.one', GONE)), deleteStatus: 500 });
    expect(await cleanupTool('t1', ctx(failing))).toMatchObject({ outcome: 'failed', status: 500 });
    const missing = fakeApi({ tool: null });
    expect(await cleanupTool('t9', ctx(missing))).toMatchObject({ outcome: 'already_gone' });
  });

  test('dependent agent lookups are cached across tools', async () => {
    const api = fakeApi({ tool: webhook('t1', at('seatable.one', GONE)), dependents: { agents: [{ type: 'unknown', id: 'agent_gone' }] } });
    const shared = ctx(api);
    await cleanupTool('t1', shared);
    await cleanupTool('t1', shared);
    expect(api.calls.filter(c => c === 'GET /agents/agent_gone')).toHaveLength(1);
  });
});
