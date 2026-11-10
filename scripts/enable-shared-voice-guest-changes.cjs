#!/usr/bin/env node
'use strict';
const { TARGET, digest, fingerprint } = require('./_lib/shared-voice-vocabulary.cjs');
const { createApi, createDb, inspect, parseArgs } = require('./sync-shared-voice-vocabulary.cjs');
const { assertProject, createJournal } = require('./migrate-elevenlabs-date-tools.cjs');

const BEFORE = 'Your scope is identifying a restaurant, checking availability, and creating a new reservation. Never call customer-profile, reservation-lookup, modification, or cancellation tools. Caller ID and a spoken name do not verify ownership. If asked to access or change an existing reservation, explain that the restaurant team must help.';
const AFTER = 'Your scope includes new reservations and verified changes to an existing reservation. Caller ID and a spoken name alone do NOT verify guest ownership. Never call customer-profile tools. For an existing reservation, identify and bind the restaurant first, then ask for the COMPLETE confirmation code from the guest receipt. Preserve every character, case, underscore and hyphen exactly; never guess, shorten, uppercase, or reconstruct a code. Never look up a code by phone or name. If the guest does not have the full code or cannot communicate it reliably, explain that the restaurant team must help; do not claim a change was made. Call lookup_reservation with the full code. Only a successful verified lookup permits discussing the returned reservation details. A verification error must disclose no booking facts. For a modification, obtain the restaurant-local clock before resolving relative dates, collect the requested changes, then read back the complete latest name, restaurant, date, time and party size and ask whether to apply the change. For cancellation, read back that same full reservation and explicitly ask whether to cancel it. STOP and wait for a subsequent user turn with an explicit yes before either mutation tool. A lookup confirmation, restaurant confirmation, yes combined with a correction, unclear answer, or no is not mutation consent. Corrections require a fresh full readback and another subsequent yes. Use modify_reservation or cancel_reservation with the SAME complete verified receipt code. Never create a replacement booking to reschedule. Report success ONLY after the mutation tool returns success=true. For a deterministic validation or availability rejection, explain the returned error and ask for corrected details. A timeout, mutation_unavailable, connection failure or missing result can occur after a change committed: do not claim unchanged state and do not blindly retry. Use a fresh verified lookup to establish the current reservation before reporting its state or requesting another change. If verification also fails, explain that the result is uncertain and ask the restaurant team to check. A repeated success with changed=false is an existing result, not another mutation. Do not claim an email or WhatsApp was sent or delivered unless a tool explicitly proves that outcome.';
const NAMES = ['lookup_reservation', 'modify_reservation', 'cancel_reservation'];

function buildPrompt(prompt) {
  if (typeof prompt !== 'string') throw Error('Missing prompt preimage');
  if (prompt.split(BEFORE).length !== 2 || prompt.includes(AFTER)) throw Error('Unknown guest policy preimage');
  return prompt.replace(BEFORE, AFTER);
}
function protectedHash(agent, phones) {
  const copy = structuredClone(agent);
  copy.conversation_config.agent.prompt.prompt = '__GUEST_POLICY__';
  copy.conversation_config.agent.prompt.tool_ids = [];
  // The API expands tool_ids into this deprecated response mirror. Protect
  // system tools here; assertToolMirror checks every referenced custom tool.
  if (Array.isArray(copy.conversation_config.agent.prompt.tools)) {
    copy.conversation_config.agent.prompt.tools = copy.conversation_config.agent.prompt.tools.filter(t => t.type === 'system');
  }
  return digest({ rest: fingerprint(copy, phones), keywords: agent.conversation_config.asr.keywords });
}
function assertToolMirror(agent, records) {
  const mirror = agent.conversation_config.agent.prompt.tools;
  if (!Array.isArray(mirror)) throw Error('Missing provider tool mirror');
  const custom = mirror.filter(t => t.type !== 'system');
  if (records.some(r => !r.id || !r.tool_config?.name) ||
      new Set(records.map(r => r.id)).size !== records.length ||
      new Set(records.map(r => r.tool_config.name)).size !== records.length) throw Error('Duplicate or missing referenced tool identity');
  if (custom.length !== records.length || new Set(custom.map(t => t.name)).size !== custom.length ||
      records.some(r => !custom.some(t => digest(t) === digest(r.tool_config)))) throw Error('Provider tool mirror differs from referenced records');
}
function normalizeCreatedTool(config) {
  const copy = structuredClone(config);
  const schema = copy?.api_schema?.request_body_schema;
  if (!schema) return copy;
  // Only these observed provider-added empty defaults are equivalent to omission.
  // Keep every other key, including assignments and query schemas, in the digest.
  const defaults = { dynamic_variable: '', is_omitted: false };
  const propertyDefaults = { ...defaults, enum: null, is_system_provided: false,
    allowed_values: null, allowed_values_dynamic_variable: '', constant_value: '' };
  for (const [key, value] of Object.entries(defaults)) if (schema[key] === value) delete schema[key];
  for (const property of Object.values(schema.properties || {})) {
    for (const [key, value] of Object.entries(propertyDefaults)) if (property[key] === value) delete property[key];
  }
  return copy;
}
function assertCreatedTool(expected, actual) {
  const wanted = expected.api_schema.request_body_schema;
  const got = actual?.api_schema?.request_body_schema;
  if (actual?.name !== expected.name || actual.type !== 'webhook' || actual.follow_redirects !== false ||
      actual.api_schema.url !== expected.api_schema.url || actual.api_schema.method !== 'POST' ||
      digest(actual.api_schema.request_headers) !== digest(expected.api_schema.request_headers) ||
      got?.type !== 'object' || digest(got.required) !== digest(wanted.required) ||
      digest(Object.keys(got.properties || {}).sort()) !== digest(Object.keys(wanted.properties).sort())) throw Error('Tool readback mismatch');
  for (const [key, value] of Object.entries(got.properties)) {
    if (value.type !== wanted.properties[key].type || value.description !== wanted.properties[key].description ||
        value.is_system_provided === true || value.is_omitted === true || value.dynamic_variable || value.constant_value ||
        value.allowed_values || value.enum?.length) throw Error('Guest input authority changed');
  }
  if (digest(normalizeCreatedTool(expected)) !== digest(normalizeCreatedTool(actual))) throw Error('Unexpected tool configuration change');
}
function buildTool(base, name, secret) {
  const auth = base?.api_schema?.request_headers?.Authorization;
  const vaultReference = auth && typeof auth === 'object' && Object.keys(auth).length === 1 &&
    typeof auth.secret_id === 'string' && auth.secret_id.length >= 6;
  const inlineSecret = typeof secret === 'string' && secret.length >= 32 && auth === `Bearer ${secret}`;
  if (!NAMES.includes(name) || base?.name !== 'create_reservation' || base.type !== 'webhook' ||
      base.api_schema?.url !== 'https://seatable.one/api/elevenlabs-webhook?action=create_reservation' ||
      base.api_schema.method !== 'POST' || (!vaultReference && !inlineSecret)) throw Error('Unverified shared tool preimage');
  const headers = base.api_schema.request_headers;
  for (const [key, variable] of Object.entries({ 'x-agent-id': 'system__agent_id', 'x-conversation-id': 'system__conversation_id',
    'x-called-number': 'system__called_number', 'x-caller-number': 'system__caller_id' })) {
    if (headers[key]?.variable_name !== variable) throw Error('Unverified native call header');
  }
  const result = structuredClone(base);
  result.name = name;
  result.description = name === 'lookup_reservation'
    ? 'Verify an existing reservation using its exact COMPLETE receipt code and the native caller. Never find a code by name or phone.'
    : `Execute ${name} only after verified lookup, a complete latest readback and a subsequent explicit yes. The server validates ownership, hours, capacity and state.`;
  result.api_schema.url = `https://seatable.one/api/elevenlabs-webhook?action=${name}`;
  const property = (description, type = 'string') => ({ type, description });
  const properties = { reservation_id: property('Complete opaque receipt code, preserving case, underscores and hyphens exactly.') };
  if (name === 'modify_reservation') Object.assign(properties, {
    new_date: property('Requested new restaurant-local date YYYY-MM-DD. Omit when unchanged.'),
    new_time: property('Requested new restaurant-local time HH:MM. Omit when unchanged.'),
    new_party_size: property('Requested whole-number guest count. Omit when unchanged.', 'number'),
  });
  result.api_schema.request_body_schema = { type: 'object', required: ['reservation_id'], properties,
    description: 'Exact receipt proof and explicitly confirmed requested changes. Never supply phone, email, restaurant or conversation identifiers.' };
  result.assignments = [];
  result.follow_redirects = false;
  result.follow_redirects_allowed_domains = [];
  return result;
}

function operatorApi(key, fetcher = fetch) {
  const call = async (path, method = 'GET', body) => {
    const r = await fetcher('https://api.elevenlabs.io/v1'+path, { method,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!r.ok) throw Error(`Guest tools operation refused: HTTP ${r.status}`);
    return r.json();
  };
  return { ...createApi(key, fetcher), getTool: id => call('/convai/tools/'+encodeURIComponent(id)),
    createTool: config => call('/convai/tools', 'POST', { tool_config: config }),
    patchGuest: (branch, prompt, ids) => call(`/convai/agents/${TARGET.agentId}?branch_id=${encodeURIComponent(branch)}&include_procedure_generated_workflow_elements=false`,
      'PATCH', { conversation_config: { agent: { prompt: { prompt, tool_ids: ids } } }, procedures: {} }) };
}
async function enable({ api, db, options, secret, openJournal = createJournal }) {
  const before = await inspect({ api, db, options });
  const p = before.agent.conversation_config.agent.prompt;
  const prompt = buildPrompt(p.prompt), hash = protectedHash(before.agent, before.phones);
  const tools = await Promise.all(p.tool_ids.map(id => api.getTool(id)));
  if (tools.length !== 4 || tools.some((t,i) => t.id !== p.tool_ids[i]) ||
      tools.some(t => NAMES.includes(t.tool_config?.name))) throw Error('Unexpected existing tool inventory');
  assertToolMirror(before.agent, tools);
  // Existing identification simulation mocks remain attached to the old tool.
  // Do not edit that workspace record or copy mocks into the new guest tools.
  const existingDefinitions = digest(tools.map(t => ({ id: t.id, config: t.tool_config, mocks: t.response_mocks })));
  const bases = tools.filter(t => t.tool_config?.name === 'create_reservation');
  if (bases.length !== 1) throw Error('Missing unique shared booking tool');
  const configs = NAMES.map(name => buildTool(bases[0].tool_config, name, secret));
  const report = { status: 'dry-run', beforeVersion: before.agent.version_id, beforeHash: digest(p.prompt),
    afterHash: digest(prompt), protectedHash: hash, toolNames: NAMES };
  if (!options.apply) return report;
  if (!options.expectedVersion || !options.manifest) throw Error('Apply requires reviewed version and private journal');
  const fresh = await inspect({ api, db, options });
  const freshTools = await Promise.all(p.tool_ids.map(id => api.getTool(id)));
  if (digest(fresh.agent) !== digest(before.agent) || digest(fresh.branch) !== digest(before.branch) ||
      digest(freshTools.map(t => ({ id: t.id, config: t.tool_config, mocks: t.response_mocks }))) !== existingDefinitions ||
      protectedHash(fresh.agent, fresh.phones) !== hash) throw Error('Provider changed before publication');
  const journal = openJournal(options.manifest);
  try {
    journal.append({ event: 'before', ...report, prompt: p.prompt, ids: p.tool_ids });
    const ids = [...p.tool_ids], newRecords = [];
    for (const config of configs) {
      const created = await api.createTool(config);
      if (!created.id || created.tool_config?.name !== config.name) throw Error('Unverified tool creation');
      journal.append({ event: 'created', id: created.id, name: config.name });
      const saved = await api.getTool(created.id);
      assertCreatedTool(config, saved.tool_config);
      newRecords.push(saved);
      ids.push(created.id);
    }
    await inspect({ api, db, options });
    await api.patchGuest(options.branchId, prompt, ids);
    const saved = await inspect({ api, db, options: { ...options, expectedVersion: undefined } });
    const sp = saved.agent.conversation_config.agent.prompt;
    const preservedTools = await Promise.all(p.tool_ids.map(id => api.getTool(id)));
    const savedNew = await Promise.all(newRecords.map(t => api.getTool(t.id)));
    if (digest(savedNew.map(t => t.tool_config)) !== digest(newRecords.map(t => t.tool_config))) throw Error('Created guest tool changed during publication');
    assertToolMirror(saved.agent, [...preservedTools, ...savedNew]);
    if (sp.prompt !== prompt || digest(sp.tool_ids) !== digest(ids) || protectedHash(saved.agent, saved.phones) !== hash ||
        digest(preservedTools.map(t => ({ id: t.id, config: t.tool_config, mocks: t.response_mocks }))) !== existingDefinitions ||
        saved.agent.version_id === before.agent.version_id) throw Error('Guest policy or protected configuration readback failed');
    journal.append({ event: 'verified', version: saved.agent.version_id, ids });
    return { ...report, status: 'verified', version: saved.agent.version_id, toolIds: ids.slice(-3) };
  } catch (error) {
    journal.append({ event: 'failed', note: 'Inspect current version and created tool IDs in this private journal before retrying.' });
    throw error;
  } finally { journal.close(); }
}
async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv); assertProject(options.projectRef, env.SUPABASE_URL);
  if (!env.ELEVENLABS_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Missing provider credentials');
  const result = await enable({ api: operatorApi(env.ELEVENLABS_API_KEY), db: createDb(env.SUPABASE_SERVICE_ROLE_KEY),
    options, secret: env.ELEVENLABS_SHARED_TOOL_SECRET });
  console.log(JSON.stringify(result));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { BEFORE, AFTER, NAMES, buildPrompt, buildTool, protectedHash, assertToolMirror, assertCreatedTool, enable, main };
