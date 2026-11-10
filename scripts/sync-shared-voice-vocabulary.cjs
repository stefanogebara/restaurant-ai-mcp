#!/usr/bin/env node
'use strict';
const { TARGET, buildVocabulary, mergeKeywords, fingerprint, digest } = require('./_lib/shared-voice-vocabulary.cjs');
const { assertProject, assertWorkspace, createJournal } = require('./migrate-elevenlabs-date-tools.cjs');
const SUPABASE_URL = `https://${TARGET.projectRef}.supabase.co`;
const BASE = 'https://api.elevenlabs.io/v1';
function parseArgs(argv) {
  const options = { apply: false };
  const flags = { '--project-ref': 'projectRef', '--workspace-id': 'workspaceId', '--branch-id': 'branchId', '--expected-version': 'expectedVersion', '--manifest': 'manifest' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--apply') options.apply = true;
    else if (flags[flag] && argv[i + 1] && !argv[i + 1].startsWith('--') && !options[flags[flag]]) options[flags[flag]] = argv[++i];
    else throw new Error(`Unknown, duplicate or incomplete argument: ${flag}`);
  }
  if (options.projectRef !== TARGET.projectRef || options.workspaceId !== TARGET.workspaceId) throw new Error('Project/workspace identity mismatch');
  if (!options.branchId) throw new Error('--branch-id is required');
  if (options.apply && !options.expectedVersion) throw new Error('--apply requires --expected-version');
  if (options.apply && !options.manifest) throw new Error('--apply requires --manifest');
  if (!options.apply && options.manifest) throw new Error('--manifest requires --apply');
  return options;
}
async function request(fetcher, url, init) {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`Read/write refused: HTTP ${response.status}`);
  return response;
}
function createApi(apiKey, fetcher = fetch) {
  const headers = { 'xi-api-key': apiKey, 'Content-Type': 'application/json' };
  const call = async (path, method = 'GET', body) => (await request(fetcher, `${BASE}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
  const agentPath = `/convai/agents/${TARGET.agentId}`;
  return {
    getWorkspaceId: async () => (await call('/user')).workspace_id,
    getAgent: branch => call(`${agentPath}?branch_id=${encodeURIComponent(branch)}&include_procedure_generated_workflow_elements=false`),
    getBranch: branch => call(`${agentPath}/branches/${encodeURIComponent(branch)}`),
    getPhones: () => call('/convai/phone-numbers'),
    patchKeywords: (branch, keywords) => call(`${agentPath}?branch_id=${encodeURIComponent(branch)}&include_procedure_generated_workflow_elements=false`, 'PATCH', { conversation_config: { asr: { keywords } } }),
  };
}
function createDb(serviceKey, fetcher = fetch) {
  return { async listRows() {
    const params = new URLSearchParams({ select: 'id,restaurant_name,is_active,onboarding_completed,is_demo,shared_routing_enabled:ai_config->phone->shared_routing_enabled',
      is_active: 'eq.true', onboarding_completed: 'eq.true', is_demo: 'eq.false', order: 'id.asc', limit: '1000' });
    const response = await request(fetcher, `${SUPABASE_URL}/rest/v1/restaurant_config?${params}`, { headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Accept-Profile': 'restaurant', Prefer: 'count=exact', Range: '0-999',
    } });
    const rows = await response.json(); const range = response.headers.get('content-range');
    const match = /^(?:0-\d+|\*)\/(\d+)$/.exec(range || '');
    if (!Array.isArray(rows) || !match || Number(match[1]) !== rows.length || rows.length >= 1000 || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Directory incomplete; refusing partial vocabulary');
    return rows;
  } };
}
async function inspect({ api, db, options }) {
  assertWorkspace(TARGET.workspaceId, await api.getWorkspaceId());
  const agent = await api.getAgent(options.branchId);
  const branch = await api.getBranch(options.branchId);
  const phones = await api.getPhones();
  if (agent.agent_id !== TARGET.agentId || agent.name !== TARGET.agentName) throw new Error('Shared agent identity mismatch');
  if (agent.main_branch_id !== options.branchId || agent.branch_id !== options.branchId || branch.id !== options.branchId ||
      branch.agent_id !== TARGET.agentId || branch.name?.toLowerCase() !== 'main' || branch.is_archived !== false || branch.current_live_percentage !== 100) throw new Error('Target must be the live main branch');
  if (!agent.version_id || (options.expectedVersion && agent.version_id !== options.expectedVersion)) throw new Error('Agent version mismatch');
  const matches = Array.isArray(phones) ? phones.filter(p => p.phone_number === TARGET.phone) : [];
  if (matches.length !== 1 || !matches[0].phone_number_id || matches[0].assigned_agent?.agent_id !== TARGET.agentId ||
      (matches[0].assigned_agent.branch_id != null && matches[0].assigned_agent.branch_id !== options.branchId)) throw new Error('Owned phone assignment mismatch');
  if (agent.conversation_config?.asr?.provider !== 'scribe_realtime') throw new Error('Unsupported ASR provider; expected scribe_realtime');
  const before = agent.conversation_config.asr.keywords;
  const canonical = buildVocabulary(await db.listRows());
  const after = mergeKeywords(before, canonical);
  return { agent, branch, phones: matches, before, after, canonical, protectedHash: fingerprint(agent, matches) };
}
async function sync({ api, db, options, openJournal = createJournal }) {
  if (options.apply && !options.expectedVersion) throw new Error('--apply requires --expected-version');
  const state = await inspect({ api, db, options });
  const report = { agentId: TARGET.agentId, branchId: options.branchId, version: state.agent.version_id,
    before: state.before, after: state.after, protectedHash: state.protectedHash };
  if (digest(state.before) === digest(state.after)) return { ...report, status: 'no-op' };
  if (!options.apply) return { ...report, status: 'dry-run' };
  if (!options.manifest) throw new Error('--apply requires --manifest');
  // The API has no conditional PATCH. Repeat all guards immediately before write;
  // readback detects concurrent changes. Run without other agent editors.
  const fresh = await inspect({ api, db, options });
  if (digest({ ...report, branch: state.branch }) !== digest({ ...report, version: fresh.agent.version_id, before: fresh.before, after: fresh.after, protectedHash: fresh.protectedHash, branch: fresh.branch })) throw new Error('Configuration/directory changed before apply');
  const journal = openJournal(options.manifest);
  try {
    journal.append({ event: 'before', workspaceId: TARGET.workspaceId, projectRef: TARGET.projectRef, ...report, at: new Date().toISOString() });
    await api.patchKeywords(options.branchId, state.after);
    const agent = await api.getAgent(options.branchId); const branch = await api.getBranch(options.branchId); const phones = await api.getPhones();
    const owned = phones.filter(p => p.phone_number === TARGET.phone);
    if (agent.agent_id !== TARGET.agentId || agent.branch_id !== options.branchId || agent.main_branch_id !== options.branchId || !agent.version_id ||
        digest(agent.conversation_config?.asr?.keywords) !== digest(state.after) || fingerprint(agent, owned) !== state.protectedHash ||
        digest({ ...branch, last_committed_at: null, most_recent_versions: null }) !== digest({ ...state.branch, last_committed_at: null, most_recent_versions: null })) throw new Error('Readback failed: keywords or protected settings changed');
    journal.append({ event: 'verified', version: agent.version_id, protectedHash: state.protectedHash, at: new Date().toISOString() });
    return { ...report, version: agent.version_id, status: 'verified' };
  } catch (error) {
    journal.append({ event: 'failed', at: new Date().toISOString(), note: 'Inspect current version and rollback record before retry; no automatic rollback.' });
    throw error;
  } finally { journal.close(); }
}
async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv); assertProject(options.projectRef, env.SUPABASE_URL);
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.ELEVENLABS_API_KEY) throw new Error('Required process environment keys missing');
  const result = await sync({ options, api: createApi(env.ELEVENLABS_API_KEY), db: createDb(env.SUPABASE_SERVICE_ROLE_KEY) });
  console.log(JSON.stringify(result, null, 2)); return result;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs, createApi, createDb, inspect, sync, main };
