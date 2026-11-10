#!/usr/bin/env node
'use strict';
const { TARGET, digest, fingerprint } = require('./_lib/shared-voice-vocabulary.cjs');
const { BEFORE, DATE_ONLY, AFTER } = require('./_lib/shared-voice-date-policy.cjs');
const { parseArgs, createApi, createDb, inspect } = require('./sync-shared-voice-vocabulary.cjs');
const { assertProject, createJournal } = require('./migrate-elevenlabs-date-tools.cjs');
const { languageState } = require('./repair-shared-voice-language.cjs');
const SOURCE_MODEL = 'gpt-4o-mini';
const TARGET_MODEL = 'gpt-4.1-mini';

function upgradedState(agent) {
  const current = agent.conversation_config.agent.prompt;
  const language = languageState(agent);
  if (language.prompt !== current.prompt || digest(language.builtInTools) !== digest(current.built_in_tools)) {
    throw new Error('Reviewed baseline language policy must be applied first');
  }
  if (![SOURCE_MODEL, TARGET_MODEL].includes(current.llm)) throw new Error('Unexpected source model');
  const beforeCount = current.prompt.split(BEFORE).length - 1;
  const dateOnlyCount = current.prompt.split(DATE_ONLY).length - 1;
  const afterCount = current.prompt.split(AFTER).length - 1;
  if (beforeCount + dateOnlyCount + afterCount !== 1) throw new Error('Unknown or ambiguous date/readback policy');
  if (afterCount === 1) return { model: TARGET_MODEL, prompt: current.prompt };
  return { model: TARGET_MODEL, prompt: current.prompt.replace(beforeCount === 1 ? BEFORE : DATE_ONLY, AFTER) };
}

function protectedHash(agent, phones) {
  const copy = structuredClone(agent);
  copy.conversation_config.agent.prompt.prompt = '__REVIEWED_DATE_POLICY__';
  copy.conversation_config.agent.prompt.llm = '__REVIEWED_MODEL__';
  return digest({ config: fingerprint(copy, phones), keywords: agent.conversation_config.asr.keywords });
}

function createModelApi(key, fetcher = fetch) {
  return { ...createApi(key, fetcher), async patchModelPolicy(branch, state) {
    const response = await fetcher('https://api.elevenlabs.io/v1/convai/agents/' + TARGET.agentId + '?branch_id=' + encodeURIComponent(branch) + '&include_procedure_generated_workflow_elements=false', {
      method: 'PATCH', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_config: { agent: { prompt: { prompt: state.prompt, llm: state.model } } }, procedures: {} }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Model/policy update refused: HTTP ' + response.status);
    return response.json();
  } };
}

const branchState = branch => ({ ...branch, last_committed_at: null, most_recent_versions: null });
async function upgrade({ api, db, options, openJournal = createJournal }) {
  if (options.apply && (!options.expectedVersion || !options.manifest)) throw new Error('Apply requires expected version and private manifest');
  const state = await inspect({ api, db, options });
  const current = state.agent.conversation_config.agent.prompt;
  const before = { model: current.llm, prompt: current.prompt }, after = upgradedState(state.agent);
  const report = { agentId: TARGET.agentId, branchId: options.branchId, version: state.agent.version_id,
    beforeModel: before.model, afterModel: after.model, beforePromptHash: digest(before.prompt), afterPromptHash: digest(after.prompt),
    protectedHash: protectedHash(state.agent, state.phones) };
  if (digest(before) === digest(after)) return { ...report, status: 'no-op' };
  if (!options.apply) return { ...report, status: 'dry-run' };
  const fresh = await inspect({ api, db, options });
  const freshPrompt = fresh.agent.conversation_config.agent.prompt;
  if (digest({ model: freshPrompt.llm, prompt: freshPrompt.prompt }) !== digest(before) ||
      protectedHash(fresh.agent, fresh.phones) !== report.protectedHash || digest(fresh.branch) !== digest(state.branch)) {
    throw new Error('Configuration changed before model/policy apply');
  }
  upgradedState(fresh.agent);
  const journal = openJournal(options.manifest);
  try {
    journal.append({ event: 'before', ...report, beforeState: before, afterState: after, at: new Date().toISOString() });
    await api.patchModelPolicy(options.branchId, after);
    const saved = await inspect({ api, db, options: { ...options, expectedVersion: undefined } });
    const savedPrompt = saved.agent.conversation_config.agent.prompt;
    if (saved.agent.version_id === state.agent.version_id || savedPrompt.llm !== after.model || savedPrompt.prompt !== after.prompt ||
        digest(upgradedState(saved.agent)) !== digest(after) || protectedHash(saved.agent, saved.phones) !== report.protectedHash ||
        digest(branchState(saved.branch)) !== digest(branchState(state.branch))) throw new Error('Model/policy or protected settings readback failed');
    journal.append({ event: 'verified', version: saved.agent.version_id, protectedHash: report.protectedHash, at: new Date().toISOString() });
    return { ...report, version: saved.agent.version_id, status: 'verified' };
  } catch (error) {
    journal.append({ event: 'failed', note: 'Inspect provider state and private journal before retry; no automatic rollback.', at: new Date().toISOString() });
    throw error;
  } finally { journal.close(); }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv); assertProject(options.projectRef, env.SUPABASE_URL);
  if (!env.ELEVENLABS_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Required process environment keys missing');
  const result = await upgrade({ options, api: createModelApi(env.ELEVENLABS_API_KEY), db: createDb(env.SUPABASE_SERVICE_ROLE_KEY) });
  console.log(JSON.stringify(result, null, 2)); return result;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { SOURCE_MODEL, TARGET_MODEL, upgradedState, protectedHash, createModelApi, upgrade, main };
