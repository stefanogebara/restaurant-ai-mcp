'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TARGET, digest } = require('../../scripts/_lib/shared-voice-vocabulary.cjs');
const initial = require('../../scripts/enable-shared-voice-guest-changes.cjs');
const { SOURCE_VERSION, SOURCE_BRANCH, SOURCE_POLICY, REPAIRED_POLICY, repairedPrompt, protectedHash, createPromptApi, repair } =
  require('../../scripts/repair-shared-voice-guest-code-policy.cjs');

function fixture() {
  const names = ['identify_restaurant', 'get_current_datetime', 'check_availability', 'create_reservation', 'lookup_reservation', 'modify_reservation', 'cancel_reservation'];
  const records = names.map((name, i) => ({ id: 'tool-' + i, response_mocks: i === 0 ? [{ name: 'existing simulation' }] : [],
    tool_config: { type: 'webhook', name, api_schema: { method: 'POST', url: 'https://seatable.one/api/elevenlabs-webhook?action=' + name,
      request_headers: { Authorization: { secret_id: 'unchanged-vault' }, 'x-caller-number': { variable_name: 'system__caller_id' } },
      request_body_schema: { type: 'object', properties: { reservation_id: { type: 'string' } } } }, follow_redirects: false } }));
  const language = { type: 'system', name: 'language_detection', params: { system_tool_type: 'language_detection', only_at_conversation_start: false } };
  const agent = { agent_id: TARGET.agentId, name: TARGET.agentName, branch_id: SOURCE_BRANCH, main_branch_id: SOURCE_BRANCH,
    version_id: SOURCE_VERSION, procedures: {}, access_info: { is_creator: true }, phone_numbers: ['owned-phone'],
    conversation_config: { asr: { provider: 'scribe_realtime', keywords: ['Seatable', 'unchanged'] },
      tts: { voice_id: 'same-voice', model_id: 'eleven_flash_v2_5' }, language_presets: { en: {}, es: {} },
      agent: { language: 'pt', prompt: { prompt: 'Unchanged language/header.\n' + SOURCE_POLICY + '\nUnchanged booking/date/readback/footer.',
        llm: 'gpt-4.1-mini', temperature: 0, tool_ids: records.map(r => r.id),
        tools: [...records.map(r => structuredClone(r.tool_config)), structuredClone(language)], built_in_tools: { language_detection: structuredClone(language) } } } },
    platform_settings: { security: { auth: 'same' } }, workflow: { nodes: {} } };
  const phone = { phone_number_id: 'owned-phone', phone_number: TARGET.phone,
    assigned_agent: { agent_id: TARGET.agentId, branch_id: SOURCE_BRANCH } };
  const branch = { id: SOURCE_BRANCH, agent_id: TARGET.agentId, name: 'main', is_archived: false, current_live_percentage: 100,
    last_committed_at: 'before', most_recent_versions: [SOURCE_VERSION], description: 'same' };
  const entries = [], close = jest.fn();
  const api = { getWorkspaceId: jest.fn(async () => TARGET.workspaceId),
    getAgent: jest.fn(async () => structuredClone(agent)), getBranch: jest.fn(async () => structuredClone(branch)),
    getPhones: jest.fn(async () => [structuredClone(phone)]), getProcedures: jest.fn(async () => ({ procedures: [] })),
    getTool: jest.fn(async id => structuredClone(records.find(r => r.id === id))),
    patchPrompt: jest.fn(async (_, prompt) => {
      expect(entries[0]?.event).toBe('before');
      agent.conversation_config.agent.prompt.prompt = prompt;
      agent.version_id = 'agtvrsn_verified_repair';
      branch.last_committed_at = 'after'; branch.most_recent_versions = [agent.version_id];
    }),
    createTool: jest.fn(), patchTool: jest.fn(), deleteTool: jest.fn(),
  };
  return { api, agent, phone, branch, records, entries, close, db: { listRows: jest.fn(async () => []) },
    options: { branchId: SOURCE_BRANCH, expectedVersion: SOURCE_VERSION, manifest: 'private-test-journal', apply: false },
    openJournal: jest.fn(() => ({ append: e => entries.push(e), close })) };
}

test('changes only the exact current paragraph and preserves the initial enable contract', () => {
  expect(SOURCE_POLICY).toBe(initial.AFTER);
  expect(initial.buildPrompt(initial.BEFORE)).toBe(initial.AFTER);
  const prefix = 'Keep language and never guess, shorten, uppercase, or reconstruct a code.\n';
  const suffix = '\nKeep booking names, date policy, consent and final reply.\n';
  expect(repairedPrompt(prefix + SOURCE_POLICY + suffix)).toBe(prefix + REPAIRED_POLICY + suffix);
  expect(REPAIRED_POLICY).not.toContain('never guess, shorten, uppercase, or reconstruct a code');
  expect(repairedPrompt(prefix + SOURCE_POLICY + suffix)).toContain(prefix);
});

test.each([null, '', initial.BEFORE, SOURCE_POLICY + SOURCE_POLICY, SOURCE_POLICY + initial.BEFORE,
  REPAIRED_POLICY, SOURCE_POLICY + REPAIRED_POLICY, SOURCE_POLICY.replace('or reconstruct a code', 'or rebuild a code')])(
  'rejects missing, initial, already-repaired, mixed or changed preimages %#', prompt => {
    expect(() => repairedPrompt(prompt)).toThrow(/preimage/);
  },
);

test('requires actual identify tool success before lookup and validates twelve faithfully transcribed suffix positions', () => {
  expect(REPAIRED_POLICY).toContain('FIRST call identify_restaurant');
  expect(REPAIRED_POLICY).toContain('success=true AND restaurant_identified=true');
  expect(REPAIRED_POLICY).toContain('three chunks of four');
  expect(REPAIRED_POLICY).toContain('positions 1 through 12');
  expect(REPAIRED_POLICY).toContain('uppercase Tango means T, lowercase Tango means t, digit one means 1, underscore means _, and hyphen means -');
  expect(REPAIRED_POLICY).toContain('25 total characters');
  expect(REPAIRED_POLICY).toContain('A 10- or 11-character suffix is incomplete');
  expect(REPAIRED_POLICY).toContain('receipt, not the booking date or current clock');
  expect(REPAIRED_POLICY).toContain('never invent missing characters, infer case, case-fold, shorten, drop or reorder');
});

test('distinguishes proof failures from outages and retains all later mutation/consent rules exactly', () => {
  expect(REPAIRED_POLICY).toContain('HTTP 403, verification_required, verification_failed');
  expect(REPAIRED_POLICY).toContain('does NOT prove a system outage or that the reservation does not exist');
  expect(REPAIRED_POLICY).toContain('Never describe those proof errors as unable to access the system');
  expect(REPAIRED_POLICY).toContain('requires_restaurant_identification');
  expect(REPAIRED_POLICY.slice(REPAIRED_POLICY.indexOf('For a modification,'))).toBe(SOURCE_POLICY.slice(SOURCE_POLICY.indexOf('For a modification,')));
  expect(REPAIRED_POLICY).toContain('Never look up a code by phone or name');
  expect(REPAIRED_POLICY).toContain('do not blindly retry');
});

test('dry run verifies all seven records and mirror without a write or journal', async () => {
  const f = fixture();
  expect(await repair(f)).toMatchObject({ status: 'dry-run', beforeVersion: SOURCE_VERSION, toolCount: 7 });
  expect(f.api.getTool).toHaveBeenCalledTimes(7);
  expect(f.openJournal).not.toHaveBeenCalled();
  expect(f.api.patchPrompt).not.toHaveBeenCalled();
});

test('apply journals the full preimage first, changes only the prompt, and verifies every tool on readback', async () => {
  const f = fixture(); f.options.apply = true;
  const oldPrompt = f.agent.conversation_config.agent.prompt.prompt;
  const oldHash = protectedHash(f.agent, [f.phone]), definitions = digest(f.records);
  const result = await repair(f);
  expect(result).toMatchObject({ status: 'verified', version: 'agtvrsn_verified_repair', toolCount: 7 });
  expect(f.entries[0]).toMatchObject({ event: 'before', beforePrompt: oldPrompt, afterPrompt: repairedPrompt(oldPrompt) });
  expect(f.entries[0].toolRecords).toHaveLength(7);
  expect(f.api.patchPrompt).toHaveBeenCalledTimes(1);
  expect(f.api.patchPrompt).toHaveBeenCalledWith(SOURCE_BRANCH, repairedPrompt(oldPrompt));
  expect(f.api.getTool).toHaveBeenCalledTimes(21);
  expect(protectedHash(f.agent, [f.phone])).toBe(oldHash);
  expect(digest(f.records)).toBe(definitions);
  expect(f.api.createTool).not.toHaveBeenCalled(); expect(f.api.patchTool).not.toHaveBeenCalled(); expect(f.api.deleteTool).not.toHaveBeenCalled();
  expect(f.entries.at(-1).event).toBe('verified'); expect(f.close).toHaveBeenCalledTimes(1);
});

test.each(['source version', 'branch', 'workspace', 'unreviewed live version', 'tool count', 'model', 'unknown prompt', 'mirror'])('refuses %s before journaling/publication', async kind => {
  const f = fixture(); f.options.apply = true;
  if (kind === 'source version') f.options.expectedVersion = 'other';
  if (kind === 'branch') f.options.branchId = 'other';
  if (kind === 'workspace') f.api.getWorkspaceId.mockResolvedValue('foreign-workspace');
  if (kind === 'unreviewed live version') f.agent.version_id = 'changed';
  if (kind === 'tool count') f.agent.conversation_config.agent.prompt.tool_ids.pop();
  if (kind === 'model') f.agent.conversation_config.agent.prompt.llm = 'other-model';
  if (kind === 'unknown prompt') f.agent.conversation_config.agent.prompt.prompt += SOURCE_POLICY;
  if (kind === 'mirror') f.agent.conversation_config.agent.prompt.tools[0].name = 'foreign';
  await expect(repair(f)).rejects.toThrow();
  expect(f.openJournal).not.toHaveBeenCalled(); expect(f.api.patchPrompt).not.toHaveBeenCalled();
});

test.each(['prompt', 'record', 'mocks', 'ASR'])('rejects concurrent %s drift before PATCH', async kind => {
  const f = fixture(); f.options.apply = true;
  let reads = 0;
  f.api.getAgent.mockImplementation(async () => {
    if (++reads === 2) {
      if (kind === 'prompt') f.agent.conversation_config.agent.prompt.prompt += 'extra';
      if (kind === 'ASR') f.agent.conversation_config.asr.keywords.push('drift');
      if (kind === 'record') f.records[0].tool_config.api_schema.url = 'https://foreign.example/';
      if (kind === 'mocks') f.records[0].response_mocks.push({ name: 'drift' });
    }
    return structuredClone(f.agent);
  });
  await expect(repair(f)).rejects.toThrow();
  expect(f.openJournal).not.toHaveBeenCalled(); expect(f.api.patchPrompt).not.toHaveBeenCalled();
});

test.each(['prompt', 'same version', 'tool IDs', 'tool config', 'tool mocks', 'system mirror', 'language tool', 'procedures', 'draft procedures',
  'model', 'ASR', 'voice', 'phone', 'platform', 'workflow', 'branch'])('detects %s readback drift and journals failure', async kind => {
  const f = fixture(); f.options.apply = true;
  const patch = f.api.patchPrompt;
  f.api.patchPrompt = jest.fn(async (...args) => {
    await patch(...args);
    const p = f.agent.conversation_config.agent.prompt;
    if (kind === 'prompt') p.prompt += 'unexpected';
    if (kind === 'same version') f.agent.version_id = SOURCE_VERSION;
    if (kind === 'tool IDs') p.tool_ids.reverse();
    if (kind === 'tool config') f.records[0].tool_config.api_schema.request_headers.Authorization = 'changed';
    if (kind === 'tool mocks') f.records[0].response_mocks.push({ name: 'changed' });
    if (kind === 'system mirror') p.tools.at(-1).params.only_at_conversation_start = true;
    if (kind === 'language tool') p.built_in_tools.language_detection.params.only_at_conversation_start = true;
    if (kind === 'procedures') f.agent.procedures = { unexpected: {} };
    if (kind === 'draft procedures') f.api.getProcedures.mockResolvedValue({ procedures: [{ id: 'unexpected' }] });
    if (kind === 'model') p.llm = 'other';
    if (kind === 'ASR') f.agent.conversation_config.asr.keywords = [];
    if (kind === 'voice') f.agent.conversation_config.tts.voice_id = 'other';
    if (kind === 'phone') f.phone.assigned_agent.agent_id = 'other';
    if (kind === 'platform') f.agent.platform_settings.security.auth = 'other';
    if (kind === 'workflow') f.agent.workflow.nodes = { injected: {} };
    if (kind === 'branch') f.branch.description = 'other';
  });
  await expect(repair(f)).rejects.toThrow();
  expect(f.entries.at(-1).event).toBe('failed'); expect(f.api.patchPrompt).toHaveBeenCalledTimes(1);
  expect(f.close).toHaveBeenCalledTimes(1);
});

test('wire payload contains only prompt plus the verified empty procedure map, with no tool/model/route replacement', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  const api = createPromptApi('fake-key', fetcher);
  await api.patchPrompt(SOURCE_BRANCH, REPAIRED_POLICY);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(`https://api.elevenlabs.io/v1/convai/agents/${TARGET.agentId}?branch_id=${SOURCE_BRANCH}&include_procedure_generated_workflow_elements=false`);
  expect(init.method).toBe('PATCH'); expect(init.redirect).toBe('error');
  expect(JSON.parse(init.body)).toEqual({ conversation_config: { agent: { prompt: { prompt: REPAIRED_POLICY } } }, procedures: {} });
  expect(api.createTool).toBeUndefined(); expect(api.patchKeywords).toBeUndefined();
});

test('an ambiguous PATCH failure is journaled without retry or rollback', async () => {
  const f = fixture(); f.options.apply = true;
  f.api.patchPrompt.mockRejectedValue(new Error('response lost'));
  await expect(repair(f)).rejects.toThrow('response lost');
  expect(f.api.patchPrompt).toHaveBeenCalledTimes(1);
  expect(f.entries.at(-1).event).toBe('failed'); expect(f.close).toHaveBeenCalledTimes(1);
});

test('uses an exclusive mode-0600 journal and refuses reuse before another publication', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seatable-guest-code-policy-test-'));
  try {
    const f = fixture(); f.options.apply = true; f.options.manifest = path.join(dir, 'journal.jsonl');
    delete f.openJournal;
    // The production journal is real local IO; every provider/DB method is fake.
    f.api.patchPrompt.mockImplementation(async (_, prompt) => {
      const lines = fs.readFileSync(f.options.manifest, 'utf8').trim().split('\n').map(JSON.parse);
      expect(lines[0].event).toBe('before');
      f.agent.conversation_config.agent.prompt.prompt = prompt; f.agent.version_id = 'agtvrsn_verified_repair';
    });
    await repair(f);
    expect(fs.statSync(f.options.manifest).mode & 0o777).toBe(0o600);
    const second = fixture(); second.options.apply = true; second.options.manifest = f.options.manifest; delete second.openJournal;
    await expect(repair(second)).rejects.toThrow();
    expect(second.api.patchPrompt).not.toHaveBeenCalled();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
