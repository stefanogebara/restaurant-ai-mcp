'use strict';

// Leftover ElevenLabs webhook tools.
//
// Why: until PR #342 (2026-11-15) deleting an agent left its 7 tools behind
// (the tools were deleted before the agent, without force, answers unread).
// On 2026-11-15 the account held 758 tools; about 396 belonged to 63
// restaurants that no longer exist, and 181 carried no restaurant id.
//
// Two steps, both founder-only (api/elevenlabs-voice-settings.js):
// 1. classifyTools: read-only buckets from the full tool list.
// 2. cleanupTool: for ONE id, re-read the tool and re-check every rule on the
//    server, then force-delete. The client's list is never trusted.
//
// A tool is deleted only when every agent that depends on it (agents and
// branches) answers 404 on GET. "unknown" dependents are not trusted as
// deleted; any other answer keeps the tool. Force removes a tool from every
// agent that uses it, so this check is what makes force safe.

const BASE = 'https://api.elevenlabs.io/v1/convai';
const OUR_HOST = /^(seatable\.one|restaurant-ai-mcp\.vercel\.app|restaurant-ai-[a-z0-9]+-stefanogebaras-projects\.vercel\.app)$/;
// Safe in a URL path; real ids look like tool_5901m7gj12etfpj8gdd7bbnwg3ct.
const TOOL_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Host and restaurant id of a webhook tool. */
function toolOwner(tool) {
  const cfg = tool?.tool_config || {};
  if (cfg.type !== 'webhook') return { webhook: false, host: null, ours: false, restaurantId: null };
  let host = null;
  let restaurantId = null;
  try {
    const url = new URL(String(cfg.api_schema?.url || ''));
    host = url.hostname;
    restaurantId = url.searchParams.get('restaurant_id') || null;
  } catch { /* unreadable URL: not ours */ }
  return { webhook: true, host, ours: Boolean(host && OUR_HOST.test(host)), restaurantId };
}

/**
 * @param {object[]} tools from listAllTools
 * @param {Set<string>} existingIds every restaurant_config id
 */
function classifyTools(tools, existingIds) {
  const missing = [];
  const unscoped = [];
  const gone = new Set();
  const counts = { total: tools.length, existing_restaurant: 0, missing_restaurant: 0, missing_restaurants: 0, unscoped: 0, foreign_host: 0, not_webhook: 0 };
  for (const tool of tools) {
    const owner = toolOwner(tool);
    if (!owner.webhook) { counts.not_webhook += 1; continue; }
    if (!owner.ours) { counts.foreign_host += 1; continue; }
    if (!owner.restaurantId) { counts.unscoped += 1; unscoped.push(tool.id); continue; }
    if (existingIds.has(owner.restaurantId)) { counts.existing_restaurant += 1; continue; }
    counts.missing_restaurant += 1;
    missing.push(tool.id);
    gone.add(owner.restaurantId);
  }
  counts.missing_restaurants = gone.size;
  return { counts, missing_restaurant: missing, unscoped };
}

async function call(fetchImpl, key, path, method = 'GET') {
  return fetchImpl(`${BASE}${path}`, { method, headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15_000) });
}

/** Every tool in the account, oldest first (cursor pages of 100). */
async function listAllTools(key, fetchImpl = fetch) {
  const tools = [];
  let cursor = '';
  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({ page_size: '100', sort_by: 'created_at', sort_direction: 'asc' });
    if (cursor) params.set('cursor', cursor);
    const res = await call(fetchImpl, key, `/tools?${params}`);
    if (!res.ok) throw new Error(`list tools ${res.status}`);
    const body = await res.json();
    tools.push(...(body.tools || []));
    if (!body.has_more || !body.next_cursor) return tools;
    cursor = body.next_cursor;
  }
  throw new Error('list tools: too many pages');
}

/** Agent ids that depend on a tool (agents and branches), and whether any is visibly alive. */
async function dependentsOf(toolId, key, fetchImpl) {
  const ids = new Set();
  let available = false;
  let cursor = '';
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) params.set('cursor', cursor);
    const res = await call(fetchImpl, key, `/tools/${encodeURIComponent(toolId)}/dependent-agents?${params}`);
    if (!res.ok) throw new Error(`dependents ${res.status}`);
    const body = await res.json();
    for (const agent of body.agents || []) {
      if (agent?.type === 'available') available = true;
      if (agent?.id) ids.add(agent.id);
    }
    for (const branch of body.branches || []) if (branch?.agent_id) ids.add(branch.agent_id);
    if (!body.has_more || !body.next_cursor) return { ids: [...ids], available };
    cursor = body.next_cursor;
  }
  throw new Error('dependents: too many pages');
}

/** Status of GET agent, cached per id. Only 404 means gone. */
async function agentStatus(agentId, ctx) {
  if (ctx.agentCache.has(agentId)) return ctx.agentCache.get(agentId);
  const res = await call(ctx.fetchImpl, ctx.key, `/agents/${encodeURIComponent(agentId)}`);
  ctx.agentCache.set(agentId, res.status);
  return res.status;
}

/** DELETE ?force=true; 404 counts as gone. Shared with deleteAgent. */
async function forceDeleteTool(toolId, key, fetchImpl = fetch) {
  const res = await call(fetchImpl, key, `/tools/${encodeURIComponent(toolId)}?force=true`, 'DELETE');
  return { ok: res.ok || res.status === 404, status: res.status };
}

/**
 * Re-check one tool on the server and delete it if every rule holds.
 * @param {string} toolId
 * @param {{ key, bucket: 'missing_restaurant'|'unscoped', existingIds: Set<string>, fetchImpl, agentCache: Map }} ctx
 * @returns {Promise<{ id, outcome: 'deleted'|'already_gone'|'kept_in_use'|'refused'|'failed', reason?, status?, agentStatuses? }>}
 */
async function cleanupTool(toolId, ctx) {
  if (!TOOL_ID.test(String(toolId || ''))) return { id: toolId, outcome: 'refused', reason: 'invalid id' };
  try {
    const res = await call(ctx.fetchImpl, ctx.key, `/tools/${encodeURIComponent(toolId)}`);
    if (res.status === 404) return { id: toolId, outcome: 'already_gone' };
    if (!res.ok) return { id: toolId, outcome: 'failed', reason: 'read', status: res.status };
    const owner = toolOwner(await res.json());
    if (!owner.webhook) return { id: toolId, outcome: 'refused', reason: 'not a webhook tool' };
    if (!owner.ours) return { id: toolId, outcome: 'refused', reason: 'not our host' };
    const bucket = owner.restaurantId ? (ctx.existingIds.has(owner.restaurantId) ? 'existing_restaurant' : 'missing_restaurant') : 'unscoped';
    if (bucket !== ctx.bucket) return { id: toolId, outcome: 'refused', reason: `bucket ${bucket}` };

    const dependents = await dependentsOf(toolId, ctx.key, ctx.fetchImpl);
    if (dependents.available) return { id: toolId, outcome: 'kept_in_use', reason: 'available dependent' };
    const agentStatuses = {};
    for (const agentId of dependents.ids) {
      const status = await agentStatus(agentId, ctx);
      agentStatuses[status] = (agentStatuses[status] || 0) + 1;
      if (status !== 404) return { id: toolId, outcome: 'kept_in_use', reason: `dependent agent answered ${status}`, agentStatuses };
    }

    const deleted = await forceDeleteTool(toolId, ctx.key, ctx.fetchImpl);
    if (!deleted.ok) return { id: toolId, outcome: 'failed', reason: 'delete', status: deleted.status, agentStatuses };
    return { id: toolId, outcome: 'deleted', agentStatuses };
  } catch (error) {
    return { id: toolId, outcome: 'failed', reason: error.message };
  }
}

module.exports = { toolOwner, classifyTools, listAllTools, cleanupTool, forceDeleteTool, OUR_HOST };
