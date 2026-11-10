#!/usr/bin/env node
'use strict';
// Separate repair for the already-published seven-tool guest policy. This does
// not change the initial enable operator's BEFORE/AFTER contract or any tool.
const { TARGET, digest, fingerprint } = require('./_lib/shared-voice-vocabulary.cjs');
const { BEFORE, AFTER: SOURCE_POLICY } = require('./enable-shared-voice-guest-changes.cjs');
const { createApi, createDb, inspect, parseArgs } = require('./sync-shared-voice-vocabulary.cjs');
const { assertProject, createJournal } = require('./migrate-elevenlabs-date-tools.cjs');

const SOURCE_VERSION = 'agtvrsn_7201m73d9wdme25917055snhxpt6';
const SOURCE_BRANCH = 'agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e';
const TOOL_NAMES = ['identify_restaurant', 'get_current_datetime', 'check_availability', 'create_reservation',
  'lookup_reservation', 'modify_reservation', 'cancel_reservation'];
const OLD_BINDING = 'For an existing reservation, identify and bind the restaurant first, then ask for the COMPLETE confirmation code from the guest receipt.';
const OLD_CODE = 'Preserve every character, case, underscore and hyphen exactly; never guess, shorten, uppercase, or reconstruct a code.';
const OLD_ERROR = 'A verification error must disclose no booking facts.';
const NEW_BINDING = 'For an existing reservation, FIRST call identify_restaurant with the restaurant name and city, and wait for its tool result with success=true AND restaurant_identified=true in this conversation. Merely hearing or saying the restaurant name does not bind it. Do not call lookup_reservation, modify_reservation or cancel_reservation before that successful binding. Then ask for the COMPLETE confirmation code from the guest receipt.';
const NEW_CODE = 'Collect the receipt code in short parts: first the prefix R E S, then exactly eight receipt-date digits YYYYMMDD, then the twelve case-sensitive suffix characters in three chunks of four. The receipt-date digits come from the receipt, not the booking date or current clock. Transcribe each supplied character faithfully into an ordered list of suffix positions 1 through 12, including any digits, hyphens and underscores. Map explicit NATO spelling and case exactly: uppercase Tango means T, lowercase Tango means t, digit one means 1, underscore means _, and hyphen means -. If case or any character is unclear, ask the caller to repeat that short chunk and read it back with its case before continuing. Concatenating the explicitly supplied prefix, receipt-date digits and verified suffix chunks with the two structural hyphens is faithful transcription; never invent missing characters, infer case, case-fold, shorten, drop or reorder them. Before lookup_reservation, check that reservation_id has the exact shape RES-YYYYMMDD- followed by all 12 supplied suffix characters: 25 total characters, including both structural hyphens. A 10- or 11-character suffix is incomplete. Do not send a partial code or guess a missing character; ask for the affected chunk again. Read back the complete code if still uncertain, then ask for correction or repetition. If a complete code cannot be captured reliably, refer the caller to the restaurant team.';
const NEW_ERROR = 'A verification error must disclose no booking facts. HTTP 403, verification_required, verification_failed, or an incomplete-code/proof error means the request was not verified; it does NOT prove a system outage or that the reservation does not exist. Never describe those proof errors as unable to access the system. If the code is incomplete or uncertain, explain that the full code could not be verified, ask for the affected short chunk again, and recheck all 12 suffix positions before another lookup. If a complete code still cannot be verified, explain that verification failed and refer to restaurant staff; never replace the native caller number or bootstrap proof by phone or name. A requires_restaurant_identification response means call identify_restaurant and wait for successful binding before lookup. Only an explicit transport/server failure supports reporting system-access trouble; a proof refusal does not.';
const REPAIRED_POLICY = SOURCE_POLICY.replace(OLD_BINDING, NEW_BINDING).replace(OLD_CODE, NEW_CODE).replace(OLD_ERROR, NEW_ERROR);

function repairedPrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.split(SOURCE_POLICY).length !== 2 ||
      prompt.includes(BEFORE) || prompt.includes(REPAIRED_POLICY)) throw Error('Unknown or ambiguous guest-code policy preimage');
  for (const sentence of [OLD_BINDING, OLD_CODE, OLD_ERROR]) {
    if (SOURCE_POLICY.split(sentence).length !== 2) throw Error('Initial guest-policy contract changed');
  }
  return prompt.replace(SOURCE_POLICY, REPAIRED_POLICY);
}

// Stronger than the initial enable fingerprint: only the prompt is excluded.
// Tool IDs, the full custom/system mirror, language, model, ASR, voices,
// procedures, authentication, workflow and phone assignment remain protected.
function protectedHash(agent, phones) {
  const copy = structuredClone(agent);
  copy.conversation_config.agent.prompt.prompt = '__GUEST_CODE_POLICY__';
  return digest({ rest: fingerprint(copy, phones), keywords: agent.conversation_config.asr.keywords });
}
const branchState = branch => ({ ...branch, last_committed_at: null, most_recent_versions: null });
const toolState = records => records.map(t => ({ id: t.id, config: t.tool_config, mocks: t.response_mocks }));
async function readTools(api, agent) {
  const ids = agent.conversation_config.agent.prompt.tool_ids;
  if (!Array.isArray(ids) || ids.length !== 7 || new Set(ids).size !== 7) throw Error('Expected exactly seven existing tools');
  const records = await Promise.all(ids.map(id => api.getTool(id)));
  if (records.some((r, i) => r.id !== ids[i]) ||
      digest(records.map(r => r.tool_config?.name).sort()) !== digest([...TOOL_NAMES].sort())) throw Error('Existing tool inventory mismatch');
  // origin/main's initial enable operator does not export the newer mirror
  // guard. Validate it here without altering that operator or its preimages.
  const mirror = agent.conversation_config.agent.prompt.tools;
  if (!Array.isArray(mirror)) throw Error('Missing provider tool mirror');
  const custom = mirror.filter(t => t.type !== 'system');
  if (custom.length !== records.length || new Set(custom.map(t => t.name)).size !== custom.length ||
      records.some(r => !custom.some(t => digest(t) === digest(r.tool_config)))) throw Error('Provider tool mirror mismatch');
  return records;
}

function createPromptApi(key, fetcher = fetch) {
  const base = createApi(key, fetcher);
  const call = async (path, method = 'GET', body) => {
    const r = await fetcher('https://api.elevenlabs.io/v1' + path, { method,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error('Guest-code policy operation refused: HTTP ' + r.status);
    return r.json();
  };
  return { getWorkspaceId: base.getWorkspaceId, getAgent: base.getAgent, getBranch: base.getBranch,
    getPhones: base.getPhones, getProcedures: base.getProcedures,
    getTool: id => call('/convai/tools/' + encodeURIComponent(id)),
    patchPrompt: (branch, prompt) => call(`/convai/agents/${TARGET.agentId}?branch_id=${encodeURIComponent(branch)}&include_procedure_generated_workflow_elements=false`,
      'PATCH', { conversation_config: { agent: { prompt: { prompt } } }, procedures: {} }) };
}

async function repair({ api, db, options, openJournal = createJournal }) {
  if (options.branchId !== SOURCE_BRANCH || options.expectedVersion !== SOURCE_VERSION) throw Error('Repair requires the exact reviewed main branch and source version');
  if (options.apply && !options.manifest) throw Error('Apply requires a private journal');
  const state = await inspect({ api, db, options });
  if (state.agent.conversation_config.agent.prompt.llm !== 'gpt-4.1-mini') throw Error('Unexpected serving model');
  const beforePrompt = state.agent.conversation_config.agent.prompt.prompt;
  const afterPrompt = repairedPrompt(beforePrompt);
  const records = await readTools(api, state.agent);
  const report = { status: 'dry-run', agentId: TARGET.agentId, branchId: SOURCE_BRANCH, beforeVersion: SOURCE_VERSION,
    beforePromptHash: digest(beforePrompt), afterPromptHash: digest(afterPrompt),
    protectedHash: protectedHash(state.agent, state.phones), toolRecordsHash: digest(toolState(records)), toolCount: records.length };
  if (!options.apply) return report;
  // There is no conditional PATCH. Require no concurrent editors; recheck all
  // guards/records immediately before journaling, then verify the full readback.
  const fresh = await inspect({ api, db, options });
  const freshRecords = await readTools(api, fresh.agent);
  if (digest(fresh.agent) !== digest(state.agent) || digest(fresh.branch) !== digest(state.branch) ||
      protectedHash(fresh.agent, fresh.phones) !== report.protectedHash ||
      digest(toolState(freshRecords)) !== report.toolRecordsHash) throw Error('Provider changed before guest-code repair');
  repairedPrompt(fresh.agent.conversation_config.agent.prompt.prompt);
  const journal = openJournal(options.manifest);
  try {
    journal.append({ event: 'before', ...report, at: new Date().toISOString(), beforePrompt, afterPrompt,
      toolIds: state.agent.conversation_config.agent.prompt.tool_ids, toolRecords: toolState(records) });
    await api.patchPrompt(SOURCE_BRANCH, afterPrompt);
    const saved = await inspect({ api, db, options: { ...options, expectedVersion: undefined } });
    const savedRecords = await readTools(api, saved.agent);
    if (!saved.agent.version_id || saved.agent.version_id === SOURCE_VERSION ||
        saved.agent.conversation_config.agent.prompt.prompt !== afterPrompt ||
        protectedHash(saved.agent, saved.phones) !== report.protectedHash ||
        digest(toolState(savedRecords)) !== report.toolRecordsHash ||
        digest(branchState(saved.branch)) !== digest(branchState(state.branch))) throw Error('Guest-code prompt or protected settings readback failed');
    journal.append({ event: 'verified', version: saved.agent.version_id, protectedHash: report.protectedHash,
      toolRecordsHash: report.toolRecordsHash, at: new Date().toISOString() });
    return { ...report, status: 'verified', version: saved.agent.version_id };
  } catch (error) {
    journal.append({ event: 'failed', at: new Date().toISOString(), note: 'Inspect provider state and private preimage before retry; no automatic retry or rollback.' });
    throw error;
  } finally { journal.close(); }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  assertProject(options.projectRef, env.SUPABASE_URL);
  if (!env.ELEVENLABS_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Required credentials unavailable');
  const result = await repair({ api: createPromptApi(env.ELEVENLABS_API_KEY), db: createDb(env.SUPABASE_SERVICE_ROLE_KEY), options });
  console.log(JSON.stringify(result));
  return result;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { SOURCE_VERSION, SOURCE_BRANCH, SOURCE_POLICY, REPAIRED_POLICY, repairedPrompt, protectedHash, createPromptApi, repair, main };
