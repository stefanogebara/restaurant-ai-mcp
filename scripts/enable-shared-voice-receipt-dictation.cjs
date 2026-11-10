#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { TARGET, digest } = require('./_lib/shared-voice-vocabulary.cjs');
const { createApi, createDb, inspect, parseArgs } = require('./sync-shared-voice-vocabulary.cjs');
const { assertProject, createJournal } = require('./migrate-elevenlabs-date-tools.cjs');
const { assertCreatedTool, assertToolMirror } = require('./enable-shared-voice-guest-changes.cjs');
const { REPAIRED_POLICY: SOURCE_POLICY } = require('./repair-shared-voice-guest-code-policy.cjs');

const SOURCE_VERSION = 'agtvrsn_9201m73fm1c9e36ba4g7baq4pf65';
const SOURCE_BRANCH = 'agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e';
const SOURCE_PROMPT_HASH = 'c87717a656b9cd420542420302e05014d3ac302588fd817eb5867a8bf818ba69';
// Deliberately not an argument/env override. Set only in a reviewed follow-up
// after this exact backend commit passes CI and is verified in production.
const BACKEND_RELEASE = Object.freeze({
  commit: 'bab12e70db5228788a2f29eb6352131787df9251',
  ci: 'https://github.com/stefanogebara/restaurant-ai-mcp/actions/runs/42894474135',
  productionVerified: true,
});
const NAMES = Object.freeze(['lookup_reservation', 'modify_reservation', 'cancel_reservation']);
const SOURCE_TOOLS = Object.freeze([
  {
    "id": "tool_3601km84yydse58s3338p3xptg0d",
    "name": "identify_restaurant",
    "hash": "c738d3c6e119e0fe627f65645cc1046e23d9c6f95e5a0a18e87de475a8e14940"
  },
  {
    "id": "tool_8101kmdxkpa4ezprx1mv8ymtmz9a",
    "name": "get_current_datetime",
    "hash": "c5915f23894d680cf59e4376a58c6ed1b8c0ce878a4edef756198acc126a6cb2"
  },
  {
    "id": "tool_0501km84yydvf28vfbyczwg82s34",
    "name": "check_availability",
    "hash": "a6628ba4128a32d41047fcbfbeebc213a0e43ccbc8f2c76a6a9c98acf0e6b283"
  },
  {
    "id": "tool_7101kmdet7a5e9zsrh93rctvygst",
    "name": "create_reservation",
    "hash": "32c40e2405f537753cdd0c9ef0487b650d466c49ea74bd4f535674d76f137cbc"
  },
  {
    "id": "tool_7901m73d9dh3e23bjqhx4k2t9423",
    "name": "lookup_reservation",
    "hash": "976252e69da25127363fbed1283133794344b17ac34838bc519afbe1185342bc"
  },
  {
    "id": "tool_9301m73d9f8kfnfr44xkgvtgtmgm",
    "name": "modify_reservation",
    "hash": "9781ee344a1e8133151e4b7aad72ac5834a04d4e18a80b10080b83ba9cebc570"
  },
  {
    "id": "tool_3401m73d9gjgf5yr4sjm3f9at9br",
    "name": "cancel_reservation",
    "hash": "7f0466afc57af4b153570ff5bad6f929195f023475e5334253e11d86284e716e"
  }
].map(Object.freeze));
const SOURCE_PROTECTED_HASH = '83882acd74571332500bcdab7abe2de46579eec0debb27c5ea6df2b789939f83';
const SOURCE_BRANCH_HASH = '1bd7c47e8de665d4d1fee4037d89b7735c068ec95eeab4ec0b224fbf13ca6564';
const BINDING_BEFORE = SOURCE_POLICY.slice(SOURCE_POLICY.indexOf('For an existing reservation,'), SOURCE_POLICY.indexOf('Collect the receipt code'));
const CODE_BEFORE = SOURCE_POLICY.slice(SOURCE_POLICY.indexOf('Collect the receipt code'), SOURCE_POLICY.indexOf(' Never look up a code by phone or name.'));
const LOOKUP_BEFORE = 'Call lookup_reservation with the full code.';
const MUTATION_BEFORE = 'Use modify_reservation or cancel_reservation with the SAME complete verified receipt code.';
const BINDING_AFTER = 'For an existing reservation, FIRST call identify_restaurant with the restaurant name and city. Wait for its result with success=true AND restaurant_identified=true in this conversation. If the result instead needs canonical restaurant confirmation, ask the caller to confirm the returned canonical name and city, STOP for the answer, then call identify_restaurant again and wait for successful binding. A suggestion, rejected candidate, spoken name, or confirmation alone is not binding. Do not call lookup_reservation, modify_reservation or cancel_reservation unless successfully bound. If the caller rejects the restaurant, stop guest operations until the restaurant is correctly identified and bound. Then ask for the COMPLETE confirmation code from the guest receipt. ';
const CODE_AFTER = 'Collect the receipt proof in short parts: the prefix R E S, the eight receipt-date digits YYYYMMDD, and all twelve case-sensitive suffix positions in three chunks of four, including every digit, hyphen and underscore. The receipt-date digits come from the receipt, not the booking date or current clock. For spoken or NATO dictation, prefer reservation_code_spelling: transmit the caller\'s complete spelling verbatim and in order, up to 1500 characters. Require an explicit uppercase or lowercase marker before EVERY letter, including the RES prefix, then a NATO word or single ASCII letter. The caller may dictate in English, Portuguese or Spanish using the exact backend aliases: for example uppercase Mike, maiúscula Mike or mayúscula Mike; explicit case aliases include maiuscula/maiúscula, mayuscula/mayúscula and minuscula/minúscula. Preserve these directives and spelling words verbatim; spelling/control word case does not replace the explicit case directive. Digits may be ASCII 0-9 or exact English/PT/ES word aliases for zero through nine, with an optional digit label such as digit or dígito. Symbols must use exact supported English/PT/ES word aliases for hyphen and underscore, never raw symbol tokens. Do not translate or transliterate the case, digit, symbol or NATO words; do not accept opaque letter names or guess an unknown token. Include the dictated prefix, date and both structural hyphens. Do not add prose, chunk labels, quotes or positional numbers to the spelling stream. Do NOT manually decode dictation into reservation_id, convert NATO words into letters, infer or change case, invent missing characters, drop, reorder, shorten, or repair the proof. The server strictly decodes and verifies the exact RES-YYYYMMDD- plus twelve-character suffix shape: 25 decoded characters. A 10- or 11-character suffix is incomplete. Ask for the affected chunk again if any position, case, or structural separator is missing or unclear; do not guess. Use reservation_id only for an already literal, complete exact receipt token, preserving it unchanged. If a complete proof cannot be captured reliably, refer the caller to the restaurant team.';
const LOOKUP_AFTER = 'Call lookup_reservation with exactly ONE nonempty proof representation: reservation_code_spelling for complete caller dictation, or reservation_id for an already literal exact token. Omit the other field ENTIRELY, including empty or null values; both fields present is a proof conflict. Never send proof in query parameters. Preserve the exact successful lookup field and value for any mutation. A correction to the proof requires a fresh verified lookup.';
const MUTATION_AFTER = 'Use modify_reservation or cancel_reservation with the SAME proof field and exact value from the successful verified lookup; never manually decode, re-encode or change its case.';
const REPLACEMENTS = [[BINDING_BEFORE, BINDING_AFTER], [CODE_BEFORE, CODE_AFTER], [LOOKUP_BEFORE, LOOKUP_AFTER], [MUTATION_BEFORE, MUTATION_AFTER]];
const AFTER_POLICY = REPLACEMENTS.reduce((p, [before, after]) => {
  if (!before || p.split(before).length !== 2) throw Error('Guest policy source contract changed');
  return p.replace(before, after);
}, SOURCE_POLICY);

function buildPrompt(prompt) {
  // digest() hashes JSON.stringify of the stable value, matching the reviewed snapshot.
  if (typeof prompt !== 'string' || digest(prompt) !== SOURCE_PROMPT_HASH ||
      prompt.split(SOURCE_POLICY).length !== 2 || prompt.includes(AFTER_POLICY)) throw Error('Unknown full prompt hash or guest policy preimage');
  return prompt.replace(SOURCE_POLICY, AFTER_POLICY);
}
function recordState(record) {
  const copy = structuredClone(record);
  // Provider attachment/usage statistics change when references change. They
  // grant no authority. Every other record field, config and mock is protected.
  delete copy.usage_stats;
  return copy;
}
function protectedHash(agent, phones) {
  const copy = structuredClone(agent);
  delete copy.version_id;
  if (copy.metadata) delete copy.metadata.updated_at_unix_secs;
  const p = copy.conversation_config.agent.prompt;
  p.prompt = '__REVIEWED_GUEST_DICTATION_POLICY__';
  p.tool_ids = [];
  p.tools = p.tools.filter(t => t.type === 'system');
  // Unlike the historical vocabulary fingerprint, this includes all ASR fields,
  // backup LLM settings, unknown root fields, system tools and builtin maps.
  return digest({ agent: copy, phones });
}
const branchState = branch => ({ ...branch, last_committed_at: null, most_recent_versions: null });
function assertNative(config) {
  const headers = config?.api_schema?.request_headers;
  for (const [name, variable] of Object.entries({ 'x-agent-id': 'system__agent_id', 'x-conversation-id': 'system__conversation_id',
    'x-called-number': 'system__called_number', 'x-caller-number': 'system__caller_id' })) {
    if (digest(headers?.[name]) !== digest({ variable_name: variable })) throw Error('Native identity header mismatch');
  }
  const auth = headers?.Authorization;
  const vault = auth && typeof auth === 'object' && Object.keys(auth).length === 1 && typeof auth.secret_id === 'string' && auth.secret_id.length >= 6;
  const bearer = typeof auth === 'string' && /^Bearer .{32,}$/.test(auth);
  if (!vault && !bearer) throw Error('Unverified tool authorization');
}
function buildTool(config) {
  if (!NAMES.includes(config?.name) || config.type !== 'webhook' || config.api_schema?.method !== 'POST' ||
      config.api_schema.url !== `https://seatable.one/api/elevenlabs-webhook?action=${config.name}` || config.follow_redirects !== false) throw Error('Unexpected guest tool preimage');
  assertNative(config);
  const schema = config.api_schema.request_body_schema;
  const keys = ['reservation_id', ...(config.name === 'modify_reservation' ? ['new_date', 'new_time', 'new_party_size'] : [])];
  if (schema?.type !== 'object' || digest(schema.required) !== digest(['reservation_id']) ||
      digest(Object.keys(schema.properties || {}).sort()) !== digest(keys.sort()) ||
      schema.properties.reservation_id.type !== 'string') throw Error('Unexpected source guest schema');
  const result = structuredClone(config);
  result.description += ' For complete spoken/NATO proof use reservation_code_spelling verbatim; never manually decode. Send exactly one nonempty proof field and retain its exact form/value after verified lookup.';
  result.api_schema.request_body_schema.required = [];
  // maxLength/oneOf are not assumed provider-supported. The backend enforces
  // the 1500-character bound, strict grammar and exactly-one proof rule.
  result.api_schema.request_body_schema.properties.reservation_code_spelling = {
    type: 'string', description: 'Complete caller dictation verbatim, maximum 1500 characters, in English, Portuguese or Spanish using exact backend case/digit/symbol aliases: for example uppercase Mike, maiúscula Mike or mayúscula Mike, with an explicit case directive before each NATO word or single ASCII letter. Digits are 0-9 or supported zero-nine word aliases with an optional digit/dígito label; hyphen/underscore require supported symbol words. Include prefix RES, eight receipt-date digits and all twelve suffix characters with structural hyphens; do not translate or transliterate tokens, manually decode, infer letters or change case. Omit reservation_id when supplying this field.',
  };
  result.api_schema.request_body_schema.description = 'Supply exactly one nonempty proof representation: literal reservation_id OR verbatim reservation_code_spelling, never both. Omit the unused property entirely, including null/empty values. The server strictly validates proof and native ownership. Preserve the successful lookup form/value for changes. Existing optional modification fields retain their meaning.';
  return result;
}
async function readTools(api, agent, source = true) {
  const ids = agent.conversation_config.agent.prompt.tool_ids;
  if (!Array.isArray(ids) || ids.length !== 7 || new Set(ids).size !== 7) throw Error('Expected exactly seven unique tool IDs');
  const records = await Promise.all(ids.map(id => api.getTool(id)));
  if (records.some((r, i) => !r || r.id !== ids[i]) ||
      digest(records.map(r => r.tool_config?.name).sort()) !== digest(SOURCE_TOOLS.map(r => r.name).sort())) throw Error('Tool inventory identity mismatch');
  assertToolMirror(agent, records);
  if (source && records.some((r, i) => ids[i] !== SOURCE_TOOLS[i].id || r.tool_config.name !== SOURCE_TOOLS[i].name ||
      digest(recordState(r)) !== SOURCE_TOOLS[i].hash)) throw Error('Source tool record/config/mocks mismatch');
  return records;
}
function openPrivateJournal(file) {
  const dir = fs.lstatSync(path.dirname(path.resolve(file)));
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) || (process.getuid && dir.uid !== process.getuid())) throw Error('Journal requires an owned private directory');
  return createJournal(file); // exclusive wx, 0600, fsync on every entry
}
function createDictationApi(key, fetcher = fetch) {
  const base = createApi(key, fetcher);
  const call = async (route, method = 'GET', body) => {
    const response = await fetcher('https://api.elevenlabs.io/v1' + route, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw Error(`Receipt dictation operation refused: HTTP ${response.status}`);
    return response.json();
  };
  return { getWorkspaceId: base.getWorkspaceId, getAgent: base.getAgent, getBranch: base.getBranch,
    getPhones: base.getPhones, getProcedures: base.getProcedures,
    getTool: id => call('/convai/tools/' + encodeURIComponent(id)),
    createTool: tool => call('/convai/tools', 'POST', { tool_config: tool }),
    patchGuest: (branch, prompt, ids) => call(`/convai/agents/${TARGET.agentId}?branch_id=${encodeURIComponent(branch)}&include_procedure_generated_workflow_elements=false`,
      'PATCH', { conversation_config: { agent: { prompt: { prompt, tool_ids: ids } } }, procedures: {} }) };
}

// Low-level transaction for mocked acceptance tests. The CLI additionally holds
// publication until BACKEND_RELEASE is populated by a reviewed source change.
async function replaceGuestTools({ api, db, options, openJournal = openPrivateJournal }) {
  if (options.branchId !== SOURCE_BRANCH || options.expectedVersion !== SOURCE_VERSION ||
      options.projectRef !== TARGET.projectRef || options.workspaceId !== TARGET.workspaceId) throw Error('Exact reviewed project/workspace/main branch/version required');
  if (options.apply && !options.manifest) throw Error('Apply requires a private journal');
  const state = await inspect({ api, db, options });
  if (state.agent.conversation_config.agent.prompt.llm !== 'gpt-4.1-mini') throw Error('Unexpected source model');
  const p = state.agent.conversation_config.agent.prompt;
  const afterPrompt = buildPrompt(p.prompt), records = await readTools(api, state.agent);
  const configs = records.filter(r => NAMES.includes(r.tool_config.name)).map(r => buildTool(r.tool_config));
  const original = digest(records.map(recordState));
  const hash = protectedHash(state.agent, state.phones);
  if (hash !== SOURCE_PROTECTED_HASH || digest(branchState(state.branch)) !== SOURCE_BRANCH_HASH) throw Error('Protected source configuration or branch mismatch');
  const report = { status: 'dry-run', sourceVersion: SOURCE_VERSION, sourcePromptHash: SOURCE_PROMPT_HASH,
    afterPromptHash: digest(afterPrompt), protectedHash: hash, sourceToolRecordsHash: original,
    toolCount: 7, replacementNames: NAMES, backendRelease: BACKEND_RELEASE };
  if (!options.apply) return report;
  const unchanged = async () => {
    const fresh = await inspect({ api, db, options });
    const freshRecords = await readTools(api, fresh.agent);
    if (digest(fresh.agent) !== digest(state.agent) || digest(fresh.branch) !== digest(state.branch) ||
        digest(fresh.phones) !== digest(state.phones) || digest(freshRecords.map(recordState)) !== original) throw Error('Source changed before publication');
  };
  await unchanged();
  const journal = openJournal(options.manifest);
  const createdIds = [];
  try {
    journal.append({ event: 'before', ...report, before: { agent: state.agent, phones: state.phones, branch: state.branch, tools: records },
      afterPrompt, intendedTools: configs, at: new Date().toISOString() });
    const newRecords = [];
    for (const config of configs) {
      const created = await api.createTool(config);
      if (typeof created?.id !== 'string' || !created.id) throw Error('Tool creation returned no usable ID; state is uncertain');
      createdIds.push(created.id);
      // Record any returned identity before GET/validation, even if it is wrong.
      journal.append({ event: 'created', id: created.id, name: config.name });
      if (p.tool_ids.includes(created.id) || new Set(createdIds).size !== createdIds.length) throw Error('Created tool identity collision');
      const saved = await api.getTool(created.id);
      if (saved?.id !== created.id || saved.access_info?.is_creator !== true ||
          digest(saved.access_info) !== digest(records.find(r => r.tool_config.name === config.name).access_info) ||
          (saved.response_mocks != null && (!Array.isArray(saved.response_mocks) || saved.response_mocks.length !== 0))) throw Error('Created tool record identity/authority/mocks mismatch');
      assertCreatedTool(config, saved.tool_config);
      newRecords.push(saved);
    }
    await unchanged();
    for (const record of newRecords) {
      const fresh = await api.getTool(record.id);
      if (digest(recordState(fresh)) !== digest(recordState(record))) throw Error('Created tool changed before PATCH');
    }
    const ids = records.map(r => newRecords.find(n => n.tool_config.name === r.tool_config.name)?.id || r.id);
    if (new Set(ids).size !== 7 || ids.length !== 7) throw Error('Invalid replacement inventory');
    journal.append({ event: 'patch-intent', beforeVersion: SOURCE_VERSION, beforeIds: p.tool_ids, afterIds: ids, afterPromptHash: digest(afterPrompt) });
    await api.patchGuest(SOURCE_BRANCH, afterPrompt, ids);
    const saved = await inspect({ api, db, options: { ...options, expectedVersion: undefined } });
    const savedRecords = await readTools(api, saved.agent, false);
    const oldRecords = await Promise.all(records.map(r => api.getTool(r.id)));
    if (digest(oldRecords.map(recordState)) !== original ||
        saved.agent.conversation_config.agent.prompt.prompt !== afterPrompt ||
        digest(saved.agent.conversation_config.agent.prompt.tool_ids) !== digest(ids) ||
        protectedHash(saved.agent, saved.phones) !== hash || !saved.agent.version_id || saved.agent.version_id === SOURCE_VERSION ||
        digest(branchState(saved.branch)) !== digest(branchState(state.branch))) throw Error('Full source/protected-state readback mismatch');
    for (const r of savedRecords) {
      const expected = newRecords.find(n => n.id === r.id) || records.find(n => n.id === r.id);
      if (!expected || digest(recordState(r)) !== digest(recordState(expected))) throw Error('Attached tool full readback mismatch');
    }
    journal.append({ event: 'verified', version: saved.agent.version_id, ids, createdIds, protectedHash: hash });
    return { ...report, status: 'verified', version: saved.agent.version_id, createdIds };
  } catch (error) {
    journal.append({ event: 'failed', createdIds, at: new Date().toISOString(),
      note: 'State may have committed. Inspect the private preimage and all returned IDs. No automatic retry, rollback, update or delete.' });
    throw error;
  } finally { journal.close(); }
}
function assertBackendRelease(release = BACKEND_RELEASE) {
  if (!release || release.productionVerified !== true || typeof release.commit !== 'string' ||
      !/^[a-f0-9]{40}$/.test(release.commit) || typeof release.ci !== 'string' || !release.ci.trim()) {
    throw Error('Publication held: exact backend commit, passing CI and production verification are not pinned');
  }
}
async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.apply) assertBackendRelease();
  assertProject(options.projectRef, env.SUPABASE_URL);
  if (!env.ELEVENLABS_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Required credentials unavailable');
  const result = await replaceGuestTools({ api: createDictationApi(env.ELEVENLABS_API_KEY), db: createDb(env.SUPABASE_SERVICE_ROLE_KEY), options });
  console.log(JSON.stringify(result));
  return result;
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { SOURCE_VERSION, SOURCE_BRANCH, SOURCE_PROMPT_HASH, SOURCE_TOOLS, SOURCE_PROTECTED_HASH, SOURCE_BRANCH_HASH, SOURCE_POLICY, AFTER_POLICY, REPLACEMENTS,
  BACKEND_RELEASE, assertBackendRelease, NAMES, buildPrompt, buildTool, recordState, protectedHash, readTools, openPrivateJournal, createDictationApi, replaceGuestTools, main };
