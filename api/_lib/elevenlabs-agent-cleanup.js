'use strict';

// Old ElevenLabs agents of restaurants that no longer exist (2026-11-16).
//
// Why: until PR #342 an agent could outlive its restaurant. On 2026-11-15
// the account held dozens of test agents from the May audits, and their 336
// tools could not be cleaned (api/_lib/elevenlabs-tool-cleanup.js keeps any
// tool that a live agent uses).
//
// Proof rule: an agent is an orphan only if it has webhook tools on our hosts
// with a restaurant_id, and every one of those restaurants is missing from
// restaurant_config. It is kept, whatever its tools say, if:
// - its name is one of KEEP_NAMES (chosen by Stefano, exact, case-insensitive);
// - its id is in the app settings (ELEVENLABS_*AGENT_ID);
// - a restaurant_config row links it;
// - a phone number is assigned to it;
// - it had a call in the last 30 days.
// Anything without proof is "unproven" and kept. Deletion never uses force,
// so ElevenLabs itself refuses an agent that another agent uses as a subagent.

const { toolOwner } = require('./elevenlabs-tool-cleanup');

const BASE = 'https://api.elevenlabs.io/v1/convai';
const AGENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const RECENT_DAYS = 30;
const KEEP_NAMES = ['seatable orchestrator v2', 'presence companion (twinme)', 'vitoria voz (stevi)', 'seatable multi-restaurant ai'];

const norm = value => String(value || '').trim().toLowerCase();

function appSettingAgentIds() {
  return new Set(['ELEVENLABS_AGENT_ID', 'ELEVENLABS_SHARED_AGENT_ID', 'VITE_ELEVENLABS_AGENT_ID']
    .map(name => String(process.env[name] || '').trim()).filter(Boolean));
}

/**
 * @param {{ agent_id, name, last_call_time_unix_secs? }} agent
 * @param {object[]} tools tools used by the agent
 * @param {{ linkedIds, phoneIds, envIds, existingIds: Set<string>, now: number }} ctx
 */
function classifyAgent(agent, tools, ctx) {
  const id = agent.agent_id;
  if (KEEP_NAMES.includes(norm(agent.name))) return { bucket: 'kept_named' };
  if (ctx.envIds.has(id)) return { bucket: 'kept_app_setting' };
  if (ctx.linkedIds.has(id)) return { bucket: 'kept_linked' };
  if (ctx.phoneIds.has(id)) return { bucket: 'kept_phone' };
  const lastCall = Number(agent.last_call_time_unix_secs || 0) * 1000;
  if (lastCall && ctx.now - lastCall < RECENT_DAYS * 86400 * 1000) return { bucket: 'kept_recent_call' };

  const restaurantIds = new Set();
  for (const t of tools) {
    const owner = toolOwner(t);
    if (owner.webhook && owner.ours && owner.restaurantId) restaurantIds.add(owner.restaurantId);
  }
  if (!restaurantIds.size) return { bucket: 'unproven', reason: 'no restaurant-scoped tool on our hosts' };
  if ([...restaurantIds].some(rid => ctx.existingIds.has(rid))) return { bucket: 'unproven', reason: 'a tool points at a live restaurant' };
  return { bucket: 'orphan', restaurantIds: [...restaurantIds] };
}

async function call(fetchImpl, key, path, method = 'GET') {
  return fetchImpl(`${BASE}${path}`, { method, headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15_000) });
}

async function json(res, what) {
  if (!res.ok) throw Object.assign(new Error(`${what} ${res.status}`), { status: res.status });
  return res.json();
}

/** One page of agents (read-only classification pages through these). */
async function listAgentsPage(key, cursor, fetchImpl = fetch, pageSize = 20) {
  const params = new URLSearchParams({ page_size: String(pageSize), sort_by: 'created_at', sort_direction: 'asc' });
  if (cursor) params.set('cursor', cursor);
  const body = await json(await call(fetchImpl, key, `/agents?${params}`), 'list agents');
  return { agents: body.agents || [], next_cursor: body.has_more ? body.next_cursor || null : null };
}

async function phoneAgentIds(key, fetchImpl = fetch) {
  const body = await json(await call(fetchImpl, key, '/phone-numbers'), 'phone numbers');
  return new Set((Array.isArray(body) ? body : []).map(p => p?.assigned_agent?.agent_id).filter(Boolean));
}

async function toolsUsedBy(agentId, key, fetchImpl = fetch) {
  const tools = [];
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ used_by_agent_id: agentId, page_size: '100' });
    if (cursor) params.set('cursor', cursor);
    const body = await json(await call(fetchImpl, key, `/tools?${params}`), 'agent tools');
    tools.push(...(body.tools || []));
    if (!body.has_more || !body.next_cursor) return tools;
    cursor = body.next_cursor;
  }
  throw new Error('agent tools: too many pages');
}

async function hadRecentCall(agentId, key, now, fetchImpl = fetch) {
  const after = Math.floor(now / 1000) - RECENT_DAYS * 86400;
  const params = new URLSearchParams({ agent_id: agentId, page_size: '1', call_start_after_unix: String(after) });
  const body = await json(await call(fetchImpl, key, `/conversations?${params}`), 'conversations');
  return (body.conversations || []).length > 0;
}

/**
 * Re-check one agent on the server and delete it (no force) if it is an orphan.
 * @returns {Promise<{ id, outcome: 'deleted'|'already_gone'|'kept'|'refused_by_elevenlabs'|'failed', bucket?, status?, reason? }>}
 */
async function cleanupAgent(agentId, ctx) {
  if (!AGENT_ID.test(String(agentId || ''))) return { id: agentId, outcome: 'kept', bucket: 'invalid id' };
  try {
    const res = await call(ctx.fetchImpl, ctx.key, `/agents/${encodeURIComponent(agentId)}`);
    if (res.status === 404) return { id: agentId, outcome: 'already_gone' };
    if (!res.ok) return { id: agentId, outcome: 'failed', status: res.status, reason: 'read agent' };
    const agent = await res.json();
    const recent = await hadRecentCall(agentId, ctx.key, ctx.now, ctx.fetchImpl);
    const phoneIds = ctx.phoneIds || await phoneAgentIds(ctx.key, ctx.fetchImpl);
    const tools = await toolsUsedBy(agentId, ctx.key, ctx.fetchImpl);
    const verdict = recent
      ? { bucket: 'kept_recent_call' }
      : classifyAgent({ agent_id: agentId, name: agent.name }, tools, { ...ctx, phoneIds });
    if (verdict.bucket !== 'orphan') return { id: agentId, name: agent.name, outcome: 'kept', bucket: verdict.bucket, reason: verdict.reason };

    const del = await call(ctx.fetchImpl, ctx.key, `/agents/${encodeURIComponent(agentId)}`, 'DELETE');
    if (del.ok || del.status === 404) return { id: agentId, name: agent.name, outcome: 'deleted' };
    return { id: agentId, name: agent.name, outcome: 'refused_by_elevenlabs', status: del.status };
  } catch (error) {
    return { id: agentId, outcome: 'failed', status: error.status, reason: error.message };
  }
}

module.exports = { KEEP_NAMES, appSettingAgentIds, classifyAgent, listAgentsPage, phoneAgentIds, toolsUsedBy, cleanupAgent };
