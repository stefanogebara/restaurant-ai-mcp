'use strict';
const { TARGET } = require('../../scripts/_lib/shared-voice-vocabulary.cjs');
const { BEFORE, DATE_ONLY, AFTER } = require('../../scripts/_lib/shared-voice-date-policy.cjs');
const { HEADER, FINAL_REPLY, repairedPrompt, languageState } = require('../../scripts/repair-shared-voice-language.cjs');
const { SOURCE_MODEL, TARGET_MODEL, upgradedState, protectedHash, createModelApi, upgrade } = require('../../scripts/upgrade-shared-voice-model-policy.cjs');

function fixture() {
  const language = { type: 'system', name: 'language_detection', description: '', params: { system_tool_type: 'language_detection', only_at_conversation_start: true } };
  const agent = { agent_id: TARGET.agentId, name: TARGET.agentName, branch_id: 'main-id', main_branch_id: 'main-id', version_id: 'v1', procedures: {},
    conversation_config: { asr: { provider: 'scribe_realtime', keywords: ['Seatable'] }, tts: { voice_id: 'voice', model_id: 'eleven_flash_v2_5' },
      agent: { language: 'pt', prompt: { prompt: repairedPrompt(HEADER + '\n\n' + BEFORE + '\n\n' + FINAL_REPLY), llm: SOURCE_MODEL,
        backup_llm_config: { preference: 'default' }, temperature: 0, built_in_tools: { language_detection: language },
        tool_ids: ['owned-tool'], tools: [{ type: 'webhook', id: 'owned-tool', name: 'identify_restaurant' }, structuredClone(language)] } },
      language_presets: { en: {}, es: {} } }, platform_settings: { security: 'unchanged' }, workflow: { nodes: {} } };
  const ready = languageState(agent); agent.conversation_config.agent.prompt.built_in_tools = ready.builtInTools;
  agent.conversation_config.agent.prompt.tools[1] = structuredClone(ready.builtInTools.language_detection);
  const phone = { phone_number_id: 'phone-id', phone_number: TARGET.phone, assigned_agent: { agent_id: TARGET.agentId, branch_id: null } };
  const entries = [];
  const api = { getWorkspaceId: jest.fn(async () => TARGET.workspaceId), getAgent: jest.fn(async () => structuredClone(agent)),
    getBranch: jest.fn(async () => ({ id: 'main-id', agent_id: TARGET.agentId, name: 'main', is_archived: false, current_live_percentage: 100 })),
    getPhones: jest.fn(async () => [structuredClone(phone)]), getProcedures: jest.fn(async () => ({ procedures: [] })),
    patchModelPolicy: jest.fn(async (_, state) => {
      expect(entries[0].event).toBe('before');
      agent.conversation_config.agent.prompt.llm = state.model;
      agent.conversation_config.agent.prompt.prompt = state.prompt; agent.version_id = 'v2';
    }) };
  return { api, agent, phone, entries, db: { listRows: jest.fn(async () => []) },
    options: { branchId: 'main-id', expectedVersion: 'v1', manifest: 'mock', apply: false },
    openJournal: () => ({ append: e => entries.push(e), close: jest.fn() }) };
}

test('replaces exactly the date paragraph without changing tenant, consent or language policy', () => {
  const f = fixture(), prompt = f.agent.conversation_config.agent.prompt;
  const next = upgradedState(f.agent);
  expect(next).toEqual({ model: TARGET_MODEL, prompt: prompt.prompt.replace(BEFORE, AFTER) });
  expect(next.prompt).toContain('before any check_availability or create_reservation');
  expect(next.prompt).toContain('never silently move it to another year');
  expect(next.prompt).toContain('Never collect a name or create a reservation unless the caller asks to book.');
  expect(next.prompt).toContain('Treat INVALID_DATE, INVALID_TIME, INVALID_PARTY_SIZE, and PAST_DATE as input validation errors');
  expect(next.prompt).toContain('On the first clear English or Spanish user turn');
  expect(prompt.llm).toBe(SOURCE_MODEL);
});

test('updates the known date-only state without changing its configured model or unrelated instructions', () => {
  const f = fixture(), prompt = f.agent.conversation_config.agent.prompt;
  prompt.prompt = prompt.prompt.replace(BEFORE, DATE_ONLY); prompt.llm = TARGET_MODEL;
  expect(upgradedState(f.agent)).toEqual({ model: TARGET_MODEL, prompt: prompt.prompt.replace(DATE_ONLY, AFTER) });
  expect(upgradedState(f.agent).prompt).toContain('ENTIRE latest customer_name');
  expect(upgradedState(f.agent).prompt).toContain('including every surname word');
  expect(upgradedState(f.agent).prompt).toContain('A yes accompanied by changed data is a correction');
});

test('refuses mixed policy states rather than partially rewriting the prompt', () => {
  const f = fixture(); f.agent.conversation_config.agent.prompt.prompt += '\n' + DATE_ONLY;
  expect(() => upgradedState(f.agent)).toThrow(/ambiguous/);
});

test.each(['unprepared language', 'foreign model', 'unknown dates', 'duplicate dates'])('fails closed on %s', kind => {
  const f = fixture(), prompt = f.agent.conversation_config.agent.prompt;
  if (kind === 'unprepared language') prompt.built_in_tools.language_detection.description = '';
  if (kind === 'foreign model') prompt.llm = 'unreviewed-model';
  if (kind === 'unknown dates') prompt.prompt = prompt.prompt.replace(BEFORE, 'unknown');
  if (kind === 'duplicate dates') prompt.prompt += '\n' + BEFORE;
  expect(() => upgradedState(f.agent)).toThrow();
});

test('dry run reports hashes without writing or opening a journal', async () => {
  const f = fixture(), result = await upgrade(f);
  expect(result).toMatchObject({ status: 'dry-run', beforeModel: SOURCE_MODEL, afterModel: TARGET_MODEL });
  expect(f.entries).toEqual([]); expect(f.api.patchModelPolicy).not.toHaveBeenCalled();
});

test('journals before publication and verifies a new serving version', async () => {
  const f = fixture(); f.options.apply = true;
  const result = await upgrade(f);
  expect(result).toMatchObject({ status: 'verified', version: 'v2' });
  expect(f.entries[0]).toHaveProperty('beforeState.model', SOURCE_MODEL);
  expect(f.entries.at(-1).event).toBe('verified');
});

test.each(['model', 'prompt', 'ASR', 'webhook', 'language tool', 'TTS', 'backup', 'phone', 'procedures'])('detects unintended %s readback', async kind => {
  const f = fixture(); f.options.apply = true; const patch = f.api.patchModelPolicy;
  f.api.patchModelPolicy = jest.fn(async (...args) => { await patch(...args);
    const prompt = f.agent.conversation_config.agent.prompt;
    if (kind === 'model') prompt.llm = SOURCE_MODEL;
    if (kind === 'prompt') prompt.prompt += '\nUnexpected extra instruction';
    if (kind === 'ASR') f.agent.conversation_config.asr.keywords = [];
    if (kind === 'webhook') prompt.tool_ids = ['foreign-tool'];
    if (kind === 'language tool') prompt.built_in_tools.language_detection.params.only_at_conversation_start = true;
    if (kind === 'TTS') f.agent.conversation_config.tts.voice_id = 'foreign-voice';
    if (kind === 'backup') prompt.backup_llm_config.preference = 'changed';
    if (kind === 'phone') f.phone.assigned_agent.agent_id = 'foreign-agent';
    if (kind === 'procedures') f.agent.procedures = { draft: {} };
  });
  await expect(upgrade(f)).rejects.toThrow();
  expect(f.entries.at(-1).event).toBe('failed');
});

test('stale version and foreign workspace refuse publication before journaling', async () => {
  for (const kind of ['version', 'workspace']) {
    const f = fixture(); f.options.apply = true;
    if (kind === 'version') f.options.expectedVersion = 'old';
    else f.api.getWorkspaceId.mockResolvedValue('foreign-workspace');
    await expect(upgrade(f)).rejects.toThrow();
    expect(f.entries).toEqual([]); expect(f.api.patchModelPolicy).not.toHaveBeenCalled();
  }
});

test('an already applied policy/model is a no-op', async () => {
  const f = fixture(), after = upgradedState(f.agent);
  Object.assign(f.agent.conversation_config.agent.prompt, { llm: after.model, prompt: after.prompt });
  f.options.apply = true;
  expect((await upgrade(f)).status).toBe('no-op');
  expect(f.entries).toEqual([]); expect(f.api.patchModelPolicy).not.toHaveBeenCalled();
});

test('protected hash permits only the exact model/prompt edit and covers ASR keywords', () => {
  const f = fixture(), before = protectedHash(f.agent, [f.phone]), state = upgradedState(f.agent);
  Object.assign(f.agent.conversation_config.agent.prompt, { llm: state.model, prompt: state.prompt });
  expect(protectedHash(f.agent, [f.phone])).toBe(before);
  f.agent.conversation_config.asr.keywords.push('new');
  expect(protectedHash(f.agent, [f.phone])).not.toBe(before);
});

test('adapter sends no tools, voices, presets, routing or authentication replacements', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  const state = upgradedState(fixture().agent);
  await createModelApi('fake', fetcher).patchModelPolicy('main-id', state);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toContain('branch_id=main-id');
  expect(JSON.parse(init.body)).toEqual({ conversation_config: { agent: { prompt: { llm: TARGET_MODEL, prompt: state.prompt } } }, procedures: {} });
});
