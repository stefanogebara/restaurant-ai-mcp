#!/usr/bin/env node
'use strict';
const { TARGET, digest, fingerprint } = require('./_lib/shared-voice-vocabulary.cjs');
const { parseArgs, createApi, createDb, inspect } = require('./sync-shared-voice-vocabulary.cjs');
const { assertProject, createJournal } = require('./migrate-elevenlabs-date-tools.cjs');
const ANCHOR = 'If restaurant_identified=false and needs_clarification=true, ask for the city and retry. If false without needs_clarification, ask the caller to repeat the full name and city.';
const REPLACEMENT = "If restaurant_identified=false and needs_confirmation=true, the tool has NOT identified or bound a restaurant. Read suggested_restaurant.restaurant_name and suggested_restaurant.city exactly as returned, naturally in the caller's language, and ask whether this is the restaurant they mean. Then STOP and wait for the caller's next turn. Only after the caller explicitly confirms that offered restaurant, call identify_restaurant with the suggested official restaurant_name and city, unchanged. A clear yes to that offered restaurant can confirm its identity even if the repeated name still has the SAME inserted connector; that alone is not a different restaurant. An explicit different name or city is a correction, not confirmation. A yes to restaurant identity is not consent to book. If the caller rejects it, changes the name/city, is unclear, or has not answered yet, do not select the suggestion or access restaurant operations; ask for the full name and city instead. Never invent suggestions or turn a failed result into a successful identification. If restaurant_identified=false and needs_clarification=true without needs_confirmation, ask for the city and retry. If false without either flag, ask the caller to repeat the full name and city.";
function buildPrompt(prompt) {
  if (typeof prompt !== 'string') throw new Error('Unknown prompt preimage');
  const oldCount = prompt.split(ANCHOR).length - 1;
  const newCount = prompt.split(REPLACEMENT).length - 1;
  if (oldCount === 0 && newCount === 1) return prompt;
  if (oldCount !== 1 || newCount !== 0) throw new Error('Unknown or ambiguous prompt preimage');
  return prompt.replace(ANCHOR, REPLACEMENT);
}
function protectedHash(agent, phones) {
  const copy = structuredClone(agent); copy.conversation_config.agent.prompt.prompt = '__PROMPT_TEXT__';
  // The ASR operator excludes keywords from its hash. This operation must protect them too.
  return digest({ base: fingerprint(copy, phones), keywords: agent.conversation_config.asr.keywords });
}
function createPromptApi(key, fetcher = fetch) {
  return { ...createApi(key, fetcher), async patchPrompt(branch, prompt) {
    const url = `https://api.elevenlabs.io/v1/convai/agents/${TARGET.agentId}?branch_id=${encodeURIComponent(branch)}&include_procedure_generated_workflow_elements=false`;
    const response = await fetcher(url, { method: 'PATCH', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_config: { agent: { prompt: { prompt } } }, procedures: {} }),
      signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`Prompt update refused: HTTP ${response.status}`);
    return response.json();
  } };
}
const branchState = branch => ({ ...branch, last_committed_at: null, most_recent_versions: null });
async function updatePrompt({ api, db, options, openJournal = createJournal }) {
  if (options.apply && (!options.expectedVersion || !options.manifest)) throw new Error('Apply requires expected version and private manifest');
  const state = await inspect({ api, db, options });
  const before = state.agent.conversation_config.agent.prompt.prompt;
  const after = buildPrompt(before);
  const report = { agentId: TARGET.agentId, branchId: options.branchId, version: state.agent.version_id,
    beforeHash: digest(before), afterHash: digest(after), protectedHash: protectedHash(state.agent, state.phones) };
  if (before === after) return { ...report, status: 'no-op' };
  if (!options.apply) return { ...report, paragraph: REPLACEMENT, status: 'dry-run' };
  const fresh = await inspect({ api, db, options });
  if (digest(fresh.agent.conversation_config.agent.prompt.prompt) !== report.beforeHash ||
      protectedHash(fresh.agent, fresh.phones) !== report.protectedHash || digest(fresh.branch) !== digest(state.branch)) {
    throw new Error('Configuration changed before prompt apply');
  }
  const journal = openJournal(options.manifest);
  try {
    journal.append({ event: 'before', ...report, beforePrompt: before, afterPrompt: after, at: new Date().toISOString() });
    await api.patchPrompt(options.branchId, after);
    const saved = await inspect({ api, db, options: { ...options, expectedVersion: undefined } });
    if (saved.agent.version_id === state.agent.version_id || saved.agent.conversation_config.agent.prompt.prompt !== after ||
        protectedHash(saved.agent, saved.phones) !== report.protectedHash ||
        digest(branchState(saved.branch)) !== digest(branchState(state.branch))) throw new Error('Prompt/protected settings readback failed');
    journal.append({ event: 'verified', version: saved.agent.version_id, protectedHash: report.protectedHash, at: new Date().toISOString() });
    return { ...report, version: saved.agent.version_id, status: 'verified' };
  } catch (error) {
    journal.append({ event: 'failed', note: 'Inspect current provider version and journal before retry; no automatic rollback.', at: new Date().toISOString() });
    throw error;
  } finally { journal.close(); }
}
async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv); assertProject(options.projectRef, env.SUPABASE_URL);
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.ELEVENLABS_API_KEY) throw new Error('Required process environment keys missing');
  const result = await updatePrompt({ options, api: createPromptApi(env.ELEVENLABS_API_KEY), db: createDb(env.SUPABASE_SERVICE_ROLE_KEY) });
  console.log(JSON.stringify(result, null, 2)); return result;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { ANCHOR, REPLACEMENT, buildPrompt, protectedHash, createPromptApi, updatePrompt, main };
