#!/usr/bin/env node
'use strict';
const { TARGET, digest, fingerprint } = require('./_lib/shared-voice-vocabulary.cjs');
const { parseArgs, createApi, createDb, inspect } = require('./sync-shared-voice-vocabulary.cjs');
const { assertProject, createJournal } = require('./migrate-elevenlabs-date-tools.cjs');
const HEADER = "You are Seatable's receptionist on a shared restaurant phone line. Speak the caller's language: Brazilian Portuguese, English, or Spanish. If unsure, ask briefly. Never force Portuguese after the caller speaks another language.";
const LANGUAGE_RULE = "You are Seatable's receptionist on a shared restaurant phone line. Match the caller's clearly spoken language: Brazilian Portuguese (pt), English (en), or Spanish (es). On the first clear English or Spanish user turn, call language_detection with that language and a reason grounded in the caller's utterance before your first reply or any restaurant tool. Do not repeat the tool while the selected language is unchanged. Use it again if the caller explicitly requests a different supported language, even later in the call. Then keep all spoken replies in the selected language. The Portuguese greeting, Portuguese examples, restaurant/city names, and tool-result language do not override the caller's language. A proper noun alone is not a language-change request. If unsure, ask one brief language question. Never force Portuguese on an English or Spanish caller. Consultation-only replies must also match the caller: English 'This was only an availability check; no reservation was made.'; Spanish 'Fue solo una consulta de disponibilidad; no se hizo ninguna reserva.'; Portuguese 'Foi apenas uma consulta; nenhuma reserva foi feita.' Use actual availability facts and do not offer a booking after consultation-only intent.";
const FINAL_REPLY = "For the final spoken reply after a successful create_reservation, read the tool's message field verbatim in the caller's language. You may add a brief question afterward, but do not paraphrase its WhatsApp sentence.";
const FINAL_RULE = "For the final spoken reply after a successful create_reservation, use the caller's selected language. If the tool's message is already in that language, read it verbatim. Otherwise translate its confirmed facts faithfully, especially the WhatsApp status: requested sending stays only requested sending; an unconfirmed send stays unconfirmed. Never translate accepted or requested into delivered, will arrive, or will receive. Preserve the date, time, party size and confirmed reservation. Do not invent a delivery result or change the stored booking.";
const TOOL_DESCRIPTION = 'Switch output language before responding when the caller clearly speaks English (en), Spanish (es), or Portuguese (pt) instead of the current language, or explicitly asks to switch. Call this before restaurant tools for a new English or Spanish caller. A proper noun, restaurant name, city name, tool result or background voice alone is not a reason to switch. Keep the selected language until a clear caller language change.';
function replaceOnce(text, before, after) {
  const oldCount = text.split(before).length - 1, newCount = text.split(after).length - 1;
  if (oldCount === 0 && newCount === 1) return text;
  if (oldCount !== 1 || newCount !== 0) throw new Error('Unknown or ambiguous language prompt preimage');
  return text.replace(before, after);
}
function repairedPrompt(prompt) {
  if (typeof prompt !== 'string') throw new Error('Missing language prompt');
  return replaceOnce(replaceOnce(prompt, HEADER, LANGUAGE_RULE), FINAL_REPLY, FINAL_RULE);
}
function languageState(agent) {
  const config = agent.conversation_config, prompt = config?.agent?.prompt;
  const supported = new Set([config?.agent?.language, ...Object.keys(config?.language_presets || {})]);
  if (!['pt', 'en', 'es'].every(lang => supported.has(lang))) throw new Error('Required supported languages missing');
  const language = prompt?.built_in_tools?.language_detection;
  const expanded = prompt?.tools?.filter(tool => tool.name === 'language_detection');
  if (!language || language.type !== 'system' || language.name !== 'language_detection' ||
      language.params?.system_tool_type !== 'language_detection' || expanded?.length !== 1 || digest(expanded[0]) !== digest(language)) {
    throw new Error('Language builtin and expanded tool must match exactly');
  }
  const builtInTools = structuredClone(prompt.built_in_tools);
  builtInTools.language_detection.description = TOOL_DESCRIPTION;
  builtInTools.language_detection.params.only_at_conversation_start = false;
  return { prompt: repairedPrompt(prompt.prompt), builtInTools };
}
function protectedHash(agent, phones) {
  const copy = structuredClone(agent), prompt = copy.conversation_config.agent.prompt;
  prompt.prompt = '__LANGUAGE_PROMPT__';
  for (const language of [prompt.built_in_tools.language_detection, ...prompt.tools.filter(tool => tool.name === 'language_detection')]) {
    language.description = '__LANGUAGE_DESCRIPTION__'; language.params.only_at_conversation_start = '__LANGUAGE_WINDOW__';
  }
  return digest({ base: fingerprint(copy, phones), keywords: agent.conversation_config.asr.keywords });
}
function createLanguageApi(key, fetcher = fetch) {
  return { ...createApi(key, fetcher), async patchLanguage(branch, state) {
    const response = await fetcher(`https://api.elevenlabs.io/v1/convai/agents/${TARGET.agentId}?branch_id=${encodeURIComponent(branch)}&include_procedure_generated_workflow_elements=false`, {
      method: 'PATCH', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_config: { agent: { prompt: { prompt: state.prompt, built_in_tools: state.builtInTools } } }, procedures: {} }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Language update refused: HTTP ${response.status}`);
    return response.json();
  } };
}
const branchState = branch => ({ ...branch, last_committed_at: null, most_recent_versions: null });
async function repair({ api, db, options, openJournal = createJournal }) {
  if (options.apply && (!options.expectedVersion || !options.manifest)) throw new Error('Apply requires expected version and private manifest');
  const state = await inspect({ api, db, options }), after = languageState(state.agent);
  const before = { prompt: state.agent.conversation_config.agent.prompt.prompt, builtInTools: state.agent.conversation_config.agent.prompt.built_in_tools };
  const report = { agentId: TARGET.agentId, branchId: options.branchId, version: state.agent.version_id,
    beforeHash: digest(before), afterHash: digest(after), protectedHash: protectedHash(state.agent, state.phones) };
  if (report.beforeHash === report.afterHash) return { ...report, status: 'no-op' };
  if (!options.apply) return { ...report, status: 'dry-run' };
  const fresh = await inspect({ api, db, options });
  if (digest({ prompt: fresh.agent.conversation_config.agent.prompt.prompt, builtInTools: fresh.agent.conversation_config.agent.prompt.built_in_tools }) !== report.beforeHash ||
      protectedHash(fresh.agent, fresh.phones) !== report.protectedHash || digest(fresh.branch) !== digest(state.branch)) throw new Error('Configuration changed before language apply');
  languageState(fresh.agent);
  const journal = openJournal(options.manifest);
  try {
    journal.append({ event: 'before', ...report, beforeState: before, afterState: after, at: new Date().toISOString() });
    await api.patchLanguage(options.branchId, after);
    const saved = await inspect({ api, db, options: { ...options, expectedVersion: undefined } });
    if (saved.agent.version_id === state.agent.version_id || digest(languageState(saved.agent)) !== report.afterHash ||
        saved.agent.conversation_config.agent.prompt.prompt !== after.prompt ||
        digest(saved.agent.conversation_config.agent.prompt.built_in_tools) !== digest(after.builtInTools) ||
        protectedHash(saved.agent, saved.phones) !== report.protectedHash || digest(branchState(saved.branch)) !== digest(branchState(state.branch))) {
      throw new Error('Language/protected settings readback failed');
    }
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
  const result = await repair({ options, api: createLanguageApi(env.ELEVENLABS_API_KEY), db: createDb(env.SUPABASE_SERVICE_ROLE_KEY) });
  console.log(JSON.stringify(result, null, 2)); return result;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { HEADER, FINAL_REPLY, repairedPrompt, languageState, protectedHash, repair, createLanguageApi, main };
