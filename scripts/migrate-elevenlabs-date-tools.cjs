#!/usr/bin/env node
/**
 * One-off repair for existing Seatable ElevenLabs date tools.
 *
 * Inventory: node scripts/migrate-elevenlabs-date-tools.cjs --project-ref ckforlwdhewexyqljsaf
 * Apply:     node scripts/migrate-elevenlabs-date-tools.cjs --project-ref ckforlwdhewexyqljsaf --apply --manifest /secure/path/date-tool-rollback.jsonl
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ELEVENLABS_API_KEY in
 * the process environment. The expected ElevenLabs workspace ID below was
 * confirmed in the Seatable agent workspace, separate from Inner.
 *
 * The apply journal contains IDs and state only. Keep it until every agent is
 * verified; to roll back, replace new_tool_id with old_tool_id in the agent's
 * prompt.tool_ids after checking its current tool list. Old tools are retained.
 */
'use strict';

const fs = require('node:fs');

const PROJECT_REF = 'ckforlwdhewexyqljsaf';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const WORKSPACE_ID = '638a74e2dad648c4a0745edc358d7eae';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/convai';
// Two existing Seatable agents were created while VERCEL_URL pointed at an
// ephemeral deployment. The old hosts are no longer found by Vercel. Pin each
// observed host to its exact agent; no other deployment URL is accepted.
const LEGACY_DATE_HOST_BY_AGENT = new Map([
  ['agent_7101m0xms2rae7g8pa4t61rtxjvn', 'restaurant-ai-mf480l5ub-stefanogebaras-projects.vercel.app'],
  ['agent_5401ktygj2xsf639dxd9ehccw3hq', 'restaurant-ai-lyo3jhqqd-stefanogebaras-projects.vercel.app'],
]);

function assertProject(projectRef, supabaseUrl) {
  if (projectRef !== PROJECT_REF || supabaseUrl !== SUPABASE_URL) {
    throw new Error('Project identity mismatch: refusing Seatable migration');
  }
}

function assertWorkspace(expectedId, actualId) {
  if (!expectedId || !actualId || expectedId !== actualId) {
    throw new Error('ElevenLabs workspace identity mismatch: refusing Seatable migration');
  }
}

function parseArgs(argv) {
  const options = { apply: false, projectRef: null, manifest: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--project-ref' && argv[i + 1]) options.projectRef = argv[++i];
    else if (arg === '--manifest' && argv[i + 1]) options.manifest = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (options.apply && !options.manifest) throw new Error('--apply requires --manifest');
  if (!options.apply && options.manifest) throw new Error('--manifest requires --apply');
  return options;
}

function toolIds(agent) {
  const ids = agent?.conversation_config?.agent?.prompt?.tool_ids;
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('Agent has missing, malformed, or duplicate prompt.tool_ids');
  }
  return ids;
}

function webhookUrl(config, agentId) {
  try {
    const url = new URL(config?.api_schema?.url);
    const legacyHost = LEGACY_DATE_HOST_BY_AGENT.get(agentId);
    if ((url.origin !== 'https://seatable.one' && (!legacyHost || url.origin !== `https://${legacyHost}`))
        || url.pathname !== '/api/elevenlabs-webhook') return null;
    return url;
  } catch { return null; }
}

function inspectAgent(row, agent, tools) {
  const ids = toolIds(agent);
  if (tools.length !== ids.length || tools.some((tool, i) => tool?.id !== ids[i] || !tool.tool_config)) {
    return { status: 'skip', reason: 'incomplete_tool_inventory' };
  }
  if (tools.some(tool => {
    const url = webhookUrl(tool.tool_config, row.elevenlabs_agent_id);
    const id = url?.searchParams.get('restaurant_id');
    return id && id !== row.id;
  })) return { status: 'skip', reason: 'foreign_restaurant_tool' };

  const dates = tools.filter(tool => tool.tool_config.name === 'get_current_datetime');
  if (dates.length !== 1) return { status: 'skip', reason: 'date_tool_count' };
  const old = dates[0];
  // A duplicate that omits simulation mocks would silently change how this
  // agent is tested. Leave such tools for an explicit, reviewed migration.
  if (old.response_mocks?.length) return { status: 'skip', reason: 'date_tool_has_mocks' };
  const config = old.tool_config;
  const url = webhookUrl(config, row.elevenlabs_agent_id);
  if (!url || config.type !== 'webhook' || config.api_schema.method !== 'GET' ||
      url.searchParams.getAll('action').length !== 1 ||
      url.searchParams.get('action') !== 'get_current_datetime' ||
      url.searchParams.getAll('restaurant_id').length > 1) {
    return { status: 'skip', reason: 'unexpected_date_tool' };
  }
  const auth = config.api_schema.request_headers?.Authorization;
  if (auth !== `Bearer ${row.elevenlabs_webhook_secret}`) {
    return { status: 'skip', reason: 'credential_mismatch' };
  }
  if (url.searchParams.get('restaurant_id') === row.id) return { status: 'skip', reason: 'already_fixed' };
  if (url.searchParams.has('restaurant_id')) return { status: 'skip', reason: 'foreign_restaurant_tool' };
  if ([...url.searchParams.keys()].some(key => key !== 'action')) return { status: 'skip', reason: 'unexpected_date_tool' };
  if (!row.elevenlabs_webhook_secret || !row.id) return { status: 'skip', reason: 'missing_identity_or_secret' };
  return { status: 'ready', oldId: old.id, oldIds: ids, config };
}

function replacementConfig(item) {
  const config = structuredClone(item.config);
  const url = new URL(config.api_schema.url);
  url.host = 'seatable.one';
  url.searchParams.set('restaurant_id', item.row.id);
  config.api_schema.url = url.toString();
  config.api_schema.request_headers = {
    ...config.api_schema.request_headers,
    Authorization: `Bearer ${item.row.elevenlabs_webhook_secret}`,
  };
  return config;
}

async function inventory({ db, api }) {
  const rows = await db.listRows();
  if (!Array.isArray(rows)) throw new Error('Restaurant inventory unavailable');
  const agentCounts = new Map();
  for (const row of rows) agentCounts.set(row.elevenlabs_agent_id, (agentCounts.get(row.elevenlabs_agent_id) || 0) + 1);
  const result = [];
  const referencedToolCounts = new Map();
  for (const row of rows) {
    const base = { rowId: row.id, agentId: row.elevenlabs_agent_id };
    if (row.is_active !== true || row.is_demo !== false || !row.elevenlabs_agent_id ||
        !/^el_whsec_[a-f0-9]{64}$/.test(row.elevenlabs_webhook_secret || '')) {
      result.push({ ...base, status: 'skip', reason: 'ineligible_row' });
      continue;
    }
    if (agentCounts.get(row.elevenlabs_agent_id) !== 1) {
      result.push({ ...base, status: 'skip', reason: 'shared_agent' });
      continue;
    }
    const agent = await api.getAgent(row.elevenlabs_agent_id);
    const ids = toolIds(agent);
    for (const id of ids) referencedToolCounts.set(id, (referencedToolCounts.get(id) || 0) + 1);
    const tools = [];
    for (const id of ids) tools.push(await api.getTool(id));
    result.push({ ...base, row, ...inspectAgent(row, agent, tools) });
  }
  for (const item of result) if (item.status === 'ready' && referencedToolCounts.get(item.oldId) !== 1) {
    item.status = 'skip'; item.reason = 'shared_date_tool';
  }
  for (const item of result.filter(entry => entry.status === 'ready')) {
    let cursor;
    let foundCurrent = false;
    const seenCursors = new Set();
    do {
      const dependencies = await api.getDependentAgents(item.oldId, cursor);
      if (!Array.isArray(dependencies?.agents) || !Array.isArray(dependencies?.branches || [])) {
        throw new Error('Tool dependency inventory unavailable');
      }
      if (dependencies.agents.some(agent => agent.id !== item.agentId) ||
          (dependencies.branches || []).some(branch => branch.agent_id !== item.agentId)) {
        item.status = 'skip'; item.reason = 'shared_date_tool';
      }
      if (dependencies.agents.some(agent => agent.id === item.agentId)) foundCurrent = true;
      if (!dependencies.has_more) break;
      cursor = dependencies.next_cursor;
      if (!cursor || seenCursors.has(cursor)) throw new Error('Tool dependency pagination incomplete');
      seenCursors.add(cursor);
    } while (true);
    if (item.status === 'ready' && !foundCurrent) {
      item.status = 'skip'; item.reason = 'dependency_not_confirmed';
    }
  }
  return result;
}

async function migrate({ db, api, items, apply = false, journal = () => {} }) {
  items ||= await inventory({ db, api });
  const report = items.map(({ rowId, agentId, status, reason, oldId }) => ({ rowId, agentId, status, reason, oldId }));
  if (!apply) return report;
  for (const item of items.filter(item => item.status === 'ready')) {
    const base = { row_id: item.rowId, agent_id: item.agentId, old_tool_id: item.oldId };
    journal({ ...base, state: 'create_intent' });
    let newId;
    let stage = 'create';
    try {
      const expectedConfig = replacementConfig(item);
      const created = await api.createTool({ tool_config: expectedConfig });
      newId = created?.id;
      if (!newId || newId === item.oldId) throw new Error('Create returned an invalid tool ID');
      journal({ ...base, new_tool_id: newId, state: 'created' });
      stage = 'tool_readback';
      const savedTool = await api.getTool(newId);
      if (savedTool?.id !== newId ||
          savedTool.tool_config?.api_schema?.url !== expectedConfig.api_schema.url ||
          savedTool.tool_config?.api_schema?.method !== 'GET' ||
          savedTool.tool_config?.name !== 'get_current_datetime' ||
          savedTool.tool_config?.api_schema?.request_headers?.Authorization !== expectedConfig.api_schema.request_headers.Authorization) {
        throw new Error('Created tool readback mismatch');
      }
      stage = 'agent_precheck';
      const freshIds = toolIds(await api.getAgent(item.agentId));
      if (JSON.stringify(freshIds) !== JSON.stringify(item.oldIds)) throw new Error('Agent tools changed after inventory');
      const nextIds = freshIds.map(id => id === item.oldId ? newId : id);
      journal({ ...base, new_tool_id: newId, state: 'patch_intent' });
      stage = 'patch';
      await api.patchAgent(item.agentId, nextIds);
      journal({ ...base, new_tool_id: newId, state: 'patch_returned' });
      stage = 'agent_readback';
      const actualIds = toolIds(await api.getAgent(item.agentId));
      if (JSON.stringify(actualIds) !== JSON.stringify(nextIds)) throw new Error('Agent readback mismatch');
      journal({ ...base, new_tool_id: newId, state: 'verified' });
      report.find(entry => entry.rowId === item.rowId).status = 'verified';
    } catch (error) {
      try { journal({ ...base, ...(newId ? { new_tool_id: newId } : {}), state: 'failed', stage }); }
      catch { /* The ID pair is also in the error below if the journal fails. */ }
      throw new Error(`Migration stopped at ${stage}: agent ${item.agentId}, old tool ${item.oldId}, new tool ${newId || 'unknown'}. Inspect rollback journal and agent state.`);
    }
  }
  return report;
}

function createJournal(file) {
  const fd = fs.openSync(file, 'wx', 0o600);
  return {
    append(entry) {
      fs.writeSync(fd, `${JSON.stringify(entry)}\n`);
      fs.fsyncSync(fd);
    },
    close() { fs.closeSync(fd); },
  };
}

function createApi(apiKey, fetcher = fetch) {
  const headers = { 'xi-api-key': apiKey, 'Content-Type': 'application/json' };
  async function request(path, method = 'GET', body) {
    const res = await fetcher(`${ELEVENLABS_BASE}${path}`, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${method} ${path.split('/')[1]}: HTTP ${res.status}`);
    return res.json();
  }
  return {
    async getWorkspaceId() {
      const res = await fetcher('https://api.elevenlabs.io/v1/user', { method: 'GET', headers });
      if (!res.ok) throw new Error(`ElevenLabs workspace identity check: HTTP ${res.status}`);
      return (await res.json()).workspace_id;
    },
    getAgent: id => request(`/agents/${encodeURIComponent(id)}`),
    getTool: id => request(`/tools/${encodeURIComponent(id)}`),
    getDependentAgents: (id, cursor) => request(`/tools/${encodeURIComponent(id)}/dependent-agents?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
    createTool: body => request('/tools', 'POST', body),
    patchAgent: (id, ids) => request(`/agents/${encodeURIComponent(id)}`, 'PATCH', {
      conversation_config: { agent: { prompt: { tool_ids: ids } } },
    }),
  };
}

function createDb(client) {
  return { async listRows() {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.schema('restaurant').from('restaurant_config')
        .select('id,is_active,is_demo,elevenlabs_agent_id,elevenlabs_webhook_secret')
        .eq('is_active', true).eq('is_demo', false)
        .not('elevenlabs_agent_id', 'is', null)
        .not('elevenlabs_webhook_secret', 'is', null)
        .order('id').range(start, start + 499);
      if (error) throw new Error(`Restaurant inventory failed: ${error.message}`);
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  } };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  assertProject(options.projectRef, env.SUPABASE_URL);
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.ELEVENLABS_API_KEY) throw new Error('Required credentials are missing');
  const { createClient } = require('@supabase/supabase-js');
  const db = createDb(createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));
  const api = createApi(env.ELEVENLABS_API_KEY);
  // A key for the unrelated Inner workspace must never reach tool inventory,
  // even in dry-run mode. The expected ID is provisioned outside this script.
  assertWorkspace(WORKSPACE_ID, await api.getWorkspaceId());
  // Complete all remote reads before opening a recovery journal or making a write.
  const items = await inventory({ db, api });
  for (const item of items) console.log(JSON.stringify({ row_id: item.rowId, agent_id: item.agentId, status: item.status, reason: item.reason, old_tool_id: item.oldId }));
  if (!options.apply) return;
  const journal = createJournal(options.manifest);
  try {
    await migrate({ items, api, apply: true, journal: entry => journal.append(entry) });
  } finally { journal.close(); }
}

if (require.main === module) {
  require('dotenv').config();
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { PROJECT_REF, SUPABASE_URL, WORKSPACE_ID, assertProject, assertWorkspace, parseArgs, inspectAgent, replacementConfig, inventory, migrate, createApi, createDb, createJournal, main };
