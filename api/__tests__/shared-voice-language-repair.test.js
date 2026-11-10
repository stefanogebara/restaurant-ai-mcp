'use strict';
const { TARGET, digest } = require('../../scripts/_lib/shared-voice-vocabulary.cjs');
const { HEADER, FINAL_REPLY, repairedPrompt, languageState, protectedHash, repair, createLanguageApi } = require('../../scripts/repair-shared-voice-language.cjs');
function fixture() {
  const language = { type: 'system', name: 'language_detection', description: '', params: { system_tool_type: 'language_detection', only_at_conversation_start: true } };
  const builtin = { language_detection: structuredClone(language), end_call: { type: 'system', name: 'end_call', params: { system_tool_type: 'end_call' } } };
  const agent = { agent_id: TARGET.agentId, name: TARGET.agentName, branch_id: 'main-id', main_branch_id: 'main-id', version_id: 'v1', procedures: {},
    conversation_config: { asr: { provider: 'scribe_realtime', keywords: ['Seatable'] }, agent: { language: 'pt', prompt: {
      prompt: `${HEADER}\n\nExact tenant binding stays unchanged. ${FINAL_REPLY}\nBooking consent stays unchanged.`, built_in_tools: builtin, tool_ids: ['owned-webhook'],
      tools: [{ type: 'webhook', name: 'identify_restaurant', id: 'owned-webhook' }, structuredClone(language)] } }, language_presets: { en: {}, es: {} } },
    platform_settings: { security: 'unchanged' }, workflow: { nodes: {} } };
  const phone = { phone_number_id: 'phone-id', phone_number: TARGET.phone, assigned_agent: { agent_id: TARGET.agentId, branch_id: null } };
  const entries = [];
  const api = { getWorkspaceId: jest.fn(async () => TARGET.workspaceId), getAgent: jest.fn(async () => structuredClone(agent)),
    getBranch: jest.fn(async () => ({ id: 'main-id', agent_id: TARGET.agentId, name: 'main', is_archived: false, current_live_percentage: 100 })),
    getPhones: jest.fn(async () => [structuredClone(phone)]), getProcedures: jest.fn(async () => ({ procedures: [] })),
    patchLanguage: jest.fn(async (_, state) => {
      agent.conversation_config.agent.prompt.prompt = state.prompt;
      agent.conversation_config.agent.prompt.built_in_tools = state.builtInTools;
      agent.conversation_config.agent.prompt.tools[1] = structuredClone(state.builtInTools.language_detection); agent.version_id = 'v2';
    }) };
  return { api, agent, phone, db: { listRows: jest.fn(async () => []) }, options: { branchId: 'main-id', expectedVersion: 'v1', manifest: 'mock', apply: false },
    entries, openJournal: () => ({ append: e => entries.push(e), close() {} }) };
}
test('changes only language instructions, preserving identity and booking consent', () => {
  const f = fixture(); const before = f.agent.conversation_config.agent.prompt.prompt; const after = repairedPrompt(before);
  expect(after).toContain('Exact tenant binding stays unchanged.'); expect(after).toContain('Booking consent stays unchanged.');
  expect(after).toMatch(/language_detection/); expect(after).toMatch(/English/); expect(after).toMatch(/Spanish/);
  expect(after).toMatch(/never.*delivered/i); expect(repairedPrompt(after)).toBe(after);
  expect(() => repairedPrompt('unknown')).toThrow(/prompt/i);
});
test('enables clear language switching without modifying other builtins or webhook tools', () => {
  const f = fixture(); const before = structuredClone(f.agent); const next = languageState(f.agent);
  expect(next.builtInTools.language_detection.params.only_at_conversation_start).toBe(false);
  expect(next.builtInTools.language_detection.description).toMatch(/proper noun/i);
  expect(next.builtInTools.end_call).toEqual(before.conversation_config.agent.prompt.built_in_tools.end_call);
  expect(f.agent).toEqual(before);
});
test.each(['missing builtin', 'missing language', 'missing English', 'missing Spanish'])('fails closed for %s', kind => {
  const f = fixture();
  if (kind === 'missing builtin') delete f.agent.conversation_config.agent.prompt.built_in_tools;
  if (kind === 'missing language') delete f.agent.conversation_config.agent.prompt.built_in_tools.language_detection;
  if (kind === 'missing English') delete f.agent.conversation_config.language_presets.en;
  if (kind === 'missing Spanish') delete f.agent.conversation_config.language_presets.es;
  expect(() => languageState(f.agent)).toThrow();
});
test('dry run writes nothing', async () => {
  const f = fixture(); expect((await repair(f)).status).toBe('dry-run'); expect(f.entries).toEqual([]); expect(f.api.patchLanguage).not.toHaveBeenCalled();
});
test('journals before guarded language-only patch and verifies a published new version', async () => {
  const f = fixture(); f.options.apply = true;
  expect((await repair(f)).status).toBe('verified'); expect(f.entries[0].event).toBe('before'); expect(f.entries[0]).toHaveProperty('beforeState');
  expect(f.entries.at(-1)).toMatchObject({ event: 'verified', version: 'v2' });
});
test.each(['webhook', 'end_call', 'ASR', 'security', 'phone', 'procedures'])('detects unrelated %s changes after patch', async kind => {
  const f = fixture(); f.options.apply = true; const original = f.api.patchLanguage;
  f.api.patchLanguage = jest.fn(async (...args) => { await original(...args);
    if (kind === 'webhook') f.agent.conversation_config.agent.prompt.tool_ids = ['foreign'];
    if (kind === 'end_call') f.agent.conversation_config.agent.prompt.built_in_tools.end_call.description = 'changed';
    if (kind === 'ASR') f.agent.conversation_config.asr.keywords = [];
    if (kind === 'security') f.agent.platform_settings.security = 'changed';
    if (kind === 'phone') f.phone.assigned_agent.agent_id = 'foreign';
    if (kind === 'procedures') f.agent.procedures = { foreign: {} };
  });
  await expect(repair(f)).rejects.toThrow(); expect(f.entries.at(-1).event).toBe('failed');
});
test('refuses stale provider version before any write', async () => {
  const f = fixture(); f.options.apply = true; f.options.expectedVersion = 'old';
  await expect(repair(f)).rejects.toThrow(); expect(f.api.patchLanguage).not.toHaveBeenCalled();
});
test('idempotent applied state is a no-op', async () => {
  const f = fixture(); await f.api.patchLanguage('main-id', languageState(f.agent)); f.api.patchLanguage.mockClear(); f.options.expectedVersion = 'v2'; f.options.apply = true;
  expect((await repair(f)).status).toBe('no-op'); expect(f.entries).toEqual([]); expect(f.api.patchLanguage).not.toHaveBeenCalled();
});
test('protected hash covers the actual ASR and other tools', () => {
  const f = fixture(); const h = protectedHash(f.agent, [f.phone]);
  const copy = structuredClone(f.agent); const next = languageState(copy);
  copy.conversation_config.agent.prompt.prompt = next.prompt; copy.conversation_config.agent.prompt.built_in_tools = next.builtInTools;
  copy.conversation_config.agent.prompt.tools[1] = structuredClone(next.builtInTools.language_detection);
  expect(protectedHash(copy, [f.phone])).toBe(h); copy.conversation_config.asr.keywords.push('Other'); expect(protectedHash(copy, [f.phone])).not.toBe(h);
});
test('adapter sends only prompt and builtins with an explicit empty procedures pin', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({}) }));const state = languageState(fixture().agent);
  await createLanguageApi('fake', fetcher).patchLanguage('main-id', state);
  const [url, init] = fetcher.mock.calls[0]; expect(url).toContain('branch_id=main-id'); const body = JSON.parse(init.body);
  expect(body).toEqual({ conversation_config: { agent: { prompt: { prompt: state.prompt, built_in_tools: state.builtInTools } } }, procedures: {} });
  expect(digest(body)).toBeTruthy();
});
