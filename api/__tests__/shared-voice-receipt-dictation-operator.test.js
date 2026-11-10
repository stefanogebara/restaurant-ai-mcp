'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
jest.mock('../../scripts/_lib/shared-voice-vocabulary.cjs', () => {
  const real = jest.requireActual('../../scripts/_lib/shared-voice-vocabulary.cjs');
  return { ...real, digest: jest.fn(real.digest) };
});
const realDigest = jest.requireActual('../../scripts/_lib/shared-voice-vocabulary.cjs').digest;
const { TARGET, digest } = require('../../scripts/_lib/shared-voice-vocabulary.cjs');
const initial = require('../../scripts/enable-shared-voice-guest-changes.cjs');
const m = require('../../scripts/enable-shared-voice-receipt-dictation.cjs');
const clone = value => structuredClone(value);

beforeEach(() => { digest.mockImplementation(realDigest); });
function fixture(apply = false) {
  const headers = { Authorization: { secret_id: 'fixture-owned-vault' },
    'x-agent-id': { variable_name: 'system__agent_id' }, 'x-conversation-id': { variable_name: 'system__conversation_id' },
    'x-called-number': { variable_name: 'system__called_number' }, 'x-caller-number': { variable_name: 'system__caller_id' } };
  const booking = { type: 'webhook', name: 'create_reservation', description: 'Existing booking.', assignments: [], follow_redirects: false,
    follow_redirects_allowed_domains: [], execution_mode: 'immediate', dynamic_variables: { dynamic_variable_placeholders: {} },
    api_schema: { method: 'POST', url: 'https://seatable.one/api/elevenlabs-webhook?action=create_reservation',
      request_headers: headers, request_body_schema: { type: 'object', required: ['customer_name'], properties: { customer_name: { type: 'string' } } } } };
  const records = m.SOURCE_TOOLS.map(pin => {
    const config = m.NAMES.includes(pin.name) ? initial.buildTool(booking, pin.name) : clone(booking);
    config.name = pin.name;
    config.api_schema.url = `https://seatable.one/api/elevenlabs-webhook?action=${pin.name}`;
    return { id: pin.id, tool_config: config, access_info: { is_creator: true, role: 'admin' }, usage_stats: { attachment_count: 1 },
      response_mocks: pin.name === 'identify_restaurant' ? [{ id: 'existing-mock', name: 'Binding sandbox', response: { success: false } }] : null };
  });
  const systems = [{ type: 'system', name: 'end_call', params: { system_tool_type: 'end_call' } },
    { type: 'system', name: 'language_detection', params: { system_tool_type: 'language_detection', only_at_conversation_start: false } }];
  const agent = { agent_id: TARGET.agentId, name: TARGET.agentName, branch_id: m.SOURCE_BRANCH, main_branch_id: m.SOURCE_BRANCH,
    version_id: m.SOURCE_VERSION, procedures: {}, access_info: { is_creator: true }, trust_context: { mode: 'same' },
    metadata: { created_at_unix_secs: 1, updated_at_unix_secs: 2 },
    conversation_config: { asr: { provider: 'scribe_realtime', keywords: ['Seatable'] }, tts: { voice_id: 'same', model_id: 'same' },
      language_presets: { en: { agent: { prompt: null } }, es: {} }, agent: { language: 'pt', prompt: {
        prompt: 'Fixture language/date/readback preface.\n' + m.SOURCE_POLICY + '\nFixture unchanged footer.',
        llm: 'gpt-4.1-mini', backup_llm_config: { model: 'unchanged' }, temperature: 0,
        tool_ids: records.map(r => r.id), tools: [...records.map(r => clone(r.tool_config)), ...clone(systems)],
        built_in_tools: { end_call: clone(systems[0]), language_detection: clone(systems[1]) } } } },
    platform_settings: { auth: { mode: 'same' } }, workflow: { nodes: {} }, phone_numbers: ['owned'] };
  const phone = { phone_number_id: 'owned', phone_number: TARGET.phone, assigned_agent: { agent_id: TARGET.agentId, branch_id: m.SOURCE_BRANCH } };
  const branch = { id: m.SOURCE_BRANCH, agent_id: TARGET.agentId, name: 'main', is_archived: false, current_live_percentage: 100,
    last_committed_at: 'old', most_recent_versions: [m.SOURCE_VERSION], description: 'unchanged' };
  // Unit fixtures contain no private prompt, vault IDs or provider records.
  // Translate only their exact digest preimages to the published pins. Mutating
  // any fixture input still computes a different real digest and is rejected.
  const translated = new Map([[realDigest(agent.conversation_config.agent.prompt.prompt), m.SOURCE_PROMPT_HASH],
    [m.protectedHash(agent, [phone]), m.SOURCE_PROTECTED_HASH],
    [realDigest({ ...branch, last_committed_at: null, most_recent_versions: null }), m.SOURCE_BRANCH_HASH],
    ...records.map((r, i) => [realDigest(m.recordState(r)), m.SOURCE_TOOLS[i].hash])]);
  digest.mockImplementation(value => { const hash = realDigest(value); return translated.get(hash) || hash; });
  const entries = [], events = [], created = [];
  const all = () => [...records, ...created];
  const api = { getWorkspaceId: jest.fn(async () => TARGET.workspaceId), getAgent: jest.fn(async () => clone(agent)),
    getBranch: jest.fn(async () => clone(branch)), getPhones: jest.fn(async () => [clone(phone)]),
    getProcedures: jest.fn(async () => ({ procedures: [] })), getTool: jest.fn(async id => {
      if (id.startsWith('created-')) expect(entries.some(e => e.event === 'created' && e.id === id)).toBe(true);
      return clone(all().find(r => r.id === id));
    }),
    createTool: jest.fn(async config => {
      expect(entries[0]?.event).toBe('before');
      const record = { id: `created-${created.length + 1}`, tool_config: clone(config), access_info: { is_creator: true, role: 'admin' }, response_mocks: null };
      created.push(record); events.push('create'); return { id: record.id };
    }), patchGuest: jest.fn(async (_, prompt, ids) => {
      expect(entries.at(-1)?.event).toBe('patch-intent');
      events.push('patch'); agent.version_id = 'agtvrsn_new'; agent.metadata.updated_at_unix_secs++;
      const p = agent.conversation_config.agent.prompt; p.prompt = prompt; p.tool_ids = clone(ids);
      p.tools = [...ids.map(id => clone(all().find(r => r.id === id).tool_config)), ...clone(systems)];
      branch.last_committed_at = 'new'; branch.most_recent_versions = [agent.version_id];
    }), updateTool: jest.fn(), deleteTool: jest.fn(),
  };
  const close = jest.fn();
  const openJournal = jest.fn(() => ({ append: entry => { entries.push(clone(entry)); events.push('journal:' + entry.event); }, close }));
  return { api, agent, branch, phone, records, created, entries, events, close, openJournal,
    db: { listRows: jest.fn(async () => []) }, options: { projectRef: TARGET.projectRef, workspaceId: TARGET.workspaceId,
      branchId: m.SOURCE_BRANCH, expectedVersion: m.SOURCE_VERSION, manifest: 'mock-private-journal', apply } };
}

test('pins full serving version, JSON prompt hash and all seven source records, without mutable pin overrides', () => {
  expect(m.SOURCE_VERSION).toBe('agtvrsn_9201m73fm1c9e36ba4g7baq4pf65');
  expect(m.SOURCE_PROMPT_HASH).toBe('c87717a656b9cd420542420302e05014d3ac302588fd817eb5867a8bf818ba69');
  expect(m.SOURCE_TOOLS).toHaveLength(7); expect(Object.isFrozen(m.SOURCE_TOOLS[0])).toBe(true);
  expect(() => m.buildPrompt(m.SOURCE_POLICY)).toThrow(/hash|preimage/);
});
test('changes only four reviewed guest-proof phrases and keeps consent/clock/language/uncertain-result clauses', () => {
  const f = fixture(); const before = f.agent.conversation_config.agent.prompt.prompt;
  const after = m.buildPrompt(before);
  expect(after).toBe(before.replace(m.SOURCE_POLICY, m.AFTER_POLICY));
  expect(m.REPLACEMENTS).toHaveLength(4);
  expect(after).toContain('FIRST call identify_restaurant'); expect(after).toContain('canonical name and city');
  expect(after).toContain('Do NOT manually decode'); expect(after).toContain('25 decoded characters');
  expect(after).toContain('A 10- or 11-character suffix is incomplete'); expect(after).toContain('receipt, not the booking date or current clock');
  expect(after).toContain('SAME proof field and exact value'); expect(after).toContain('ENTIRELY, including empty or null'); expect(after).toContain('EVERY letter, including the RES prefix'); expect(after).toContain('STOP and wait for a subsequent user turn');
  expect(after).toContain('do not blindly retry'); expect(after).toContain('Do not claim an email or WhatsApp');
});
test.each([null, '', 'unknown', m.SOURCE_POLICY + m.SOURCE_POLICY, m.AFTER_POLICY])('rejects an unreviewed or duplicate full prompt %#', p => {
  fixture(); expect(() => m.buildPrompt(p)).toThrow();
});
test.each(m.NAMES)('full %s schema has exactly the optional proof fields plus unchanged modify fields', name => {
  const f = fixture(); const before = f.records.find(r => r.tool_config.name === name).tool_config, copy = clone(before);
  const result = m.buildTool(before), schema = result.api_schema.request_body_schema;
  expect(before).toEqual(copy); expect(schema.required).toEqual([]); expect(schema.oneOf).toBeUndefined();
  const expectedKeys = ['reservation_id', 'reservation_code_spelling', ...(name === 'modify_reservation' ? ['new_date', 'new_time', 'new_party_size'] : [])];
  expect(Object.keys(schema.properties).sort()).toEqual(expectedKeys.sort());
  expect(schema.properties.reservation_id).toEqual(copy.api_schema.request_body_schema.properties.reservation_id);
  expect(schema.properties.reservation_code_spelling).toEqual({ type: 'string', description: expect.stringContaining('maximum 1500') });
  if (name === 'modify_reservation') for (const key of ['new_date', 'new_time', 'new_party_size']) expect(schema.properties[key]).toEqual(copy.api_schema.request_body_schema.properties[key]);
  const normalized = clone(result); normalized.description = copy.description; normalized.api_schema.request_body_schema = copy.api_schema.request_body_schema;
  expect(normalized).toEqual(copy); expect(result.api_schema.request_headers).toEqual(copy.api_schema.request_headers);
});
test.each(['x-agent-id', 'x-conversation-id', 'x-called-number', 'x-caller-number'])('refuses altered native header %s', header => {
  const f = fixture(); const config = clone(f.records[4].tool_config); config.api_schema.request_headers[header] = { variable_name: 'model_supplied' };
  expect(() => m.buildTool(config)).toThrow(/identity/);
});
test.each(['auth', 'origin', 'method', 'required', 'extra body key', 'proof type'])('refuses unexpected source guest %s', kind => {
  const f = fixture(), config = clone(f.records[4].tool_config);
  if (kind === 'auth') config.api_schema.request_headers.Authorization = { variable_name: 'model_supplied' };
  if (kind === 'origin') config.api_schema.url = 'https://foreign.example';
  if (kind === 'method') config.api_schema.method = 'GET';
  if (kind === 'required') config.api_schema.request_body_schema.required = [];
  if (kind === 'extra body key') config.api_schema.request_body_schema.properties.phone = { type: 'string' };
  if (kind === 'proof type') config.api_schema.request_body_schema.properties.reservation_id.type = 'number';
  expect(() => m.buildTool(config)).toThrow();
});
test('dry run reads all seven source records but never creates tools, patches or opens a journal', async () => {
  const f = fixture(); expect(await m.replaceGuestTools(f)).toMatchObject({ status: 'dry-run', toolCount: 7, sourceVersion: m.SOURCE_VERSION });
  expect(f.api.getTool).toHaveBeenCalledTimes(7); expect(f.openJournal).not.toHaveBeenCalled(); expect(f.api.createTool).not.toHaveBeenCalled(); expect(f.api.patchGuest).not.toHaveBeenCalled();
});
test('creates only three replacements, preserves four positions/all old records+mocks and verifies the full readback', async () => {
  const f = fixture(true), before = clone(f.records), beforeIds = [...f.agent.conversation_config.agent.prompt.tool_ids];
  const result = await m.replaceGuestTools(f);
  expect(result.status).toBe('verified'); expect(f.created).toHaveLength(3); expect(f.api.createTool).toHaveBeenCalledTimes(3);
  expect(f.api.patchGuest).toHaveBeenCalledTimes(1); expect(f.records).toEqual(before);
  expect(f.agent.conversation_config.agent.prompt.tool_ids.slice(0, 4)).toEqual(beforeIds.slice(0, 4));
  expect(f.agent.conversation_config.agent.prompt.tool_ids).toHaveLength(7);
  expect(f.events[0]).toBe('journal:before'); expect(f.entries[0].before.tools).toHaveLength(7);
  expect(f.entries.filter(e => e.event === 'created').map(e => e.id)).toEqual(result.createdIds);
  expect(f.entries.at(-1).event).toBe('verified'); expect(f.api.updateTool).not.toHaveBeenCalled(); expect(f.api.deleteTool).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalledTimes(1);
  const expected = f.records.slice(0, 4).concat(f.created);
  expect(f.agent.conversation_config.agent.prompt.tools.filter(t => t.type !== 'system')).toEqual(expected.map(r => r.tool_config));
});

test.each(['project', 'workspace option', 'workspace actual', 'version option', 'version actual', 'branch option', 'branch actual', 'not main', 'phone',
  'model', 'full prompt', 'ASR', 'voice', 'backup model', 'trust', 'builtin', 'system mirror', 'count', 'duplicate ID', 'source config', 'source mock', 'source record access', 'procedures', 'draft procedures'])('rejects %s before any journal/write', async kind => {
  const f = fixture(true), p = f.agent.conversation_config.agent.prompt;
  if (kind === 'project') f.options.projectRef = 'other';
  if (kind === 'workspace option') f.options.workspaceId = 'other';
  if (kind === 'workspace actual') f.api.getWorkspaceId.mockResolvedValue('other');
  if (kind === 'version option') f.options.expectedVersion = 'other';
  if (kind === 'version actual') f.agent.version_id = 'other';
  if (kind === 'branch option') f.options.branchId = 'other';
  if (kind === 'branch actual') f.agent.branch_id = 'other';
  if (kind === 'not main') f.branch.current_live_percentage = 0;
  if (kind === 'phone') f.phone.assigned_agent.agent_id = 'other';
  if (kind === 'model') p.llm = 'other';
  if (kind === 'full prompt') p.prompt += ' changed outside policy';
  if (kind === 'ASR') f.agent.conversation_config.asr.keywords = [];
  if (kind === 'voice') f.agent.conversation_config.tts.voice_id = 'other';
  if (kind === 'backup model') p.backup_llm_config.model = 'other';
  if (kind === 'trust') f.agent.trust_context.mode = 'other';
  if (kind === 'builtin') p.built_in_tools.language_detection.params.only_at_conversation_start = true;
  if (kind === 'system mirror') p.tools.at(-1).params.only_at_conversation_start = true;
  if (kind === 'count') p.tool_ids.pop();
  if (kind === 'duplicate ID') p.tool_ids[1] = p.tool_ids[0];
  if (kind === 'source config') f.records[0].tool_config.description += 'changed';
  if (kind === 'source mock') f.records[0].response_mocks.push({ name: 'new' });
  if (kind === 'source record access') f.records[0].access_info.role = 'other';
  if (kind === 'procedures') f.agent.procedures = { foreign: {} };
  if (kind === 'draft procedures') f.api.getProcedures.mockImplementation(async (_, version) => ({ procedures: version ? [] : [{}] }));
  await expect(m.replaceGuestTools(f)).rejects.toThrow();
  expect(f.openJournal).not.toHaveBeenCalled(); expect(f.api.createTool).not.toHaveBeenCalled(); expect(f.api.patchGuest).not.toHaveBeenCalled();
});
test.each(['agent', 'record', 'mock', 'phone', 'branch'])('rejects concurrent %s drift before creating tools', async kind => {
  const f = fixture(true); let reads = 0;
  f.api.getAgent.mockImplementation(async () => {
    if (++reads === 2) {
      if (kind === 'agent') f.agent.platform_settings.extra = true;
      if (kind === 'record') f.records[3].tool_config.description += 'changed';
      if (kind === 'mock') f.records[0].response_mocks.push({ name: 'drift' });
      if (kind === 'phone') f.phone.phone_number_id = 'other';
      if (kind === 'branch') f.branch.description = 'other';
    } return clone(f.agent);
  });
  await expect(m.replaceGuestTools(f)).rejects.toThrow(); expect(f.openJournal).not.toHaveBeenCalled(); expect(f.api.createTool).not.toHaveBeenCalled();
});
test.each(['no ID', 'old ID', 'duplicate ID', 'failed create', 'failed second create', 'wrong ID', 'ownership', 'extra access', 'mocks', 'malformed mocks', 'native header', 'constant', 'body keys', 'required', 'assignment', 'query schema', 'redirect'])('journals and stops %s without PATCH/retry/delete', async kind => {
  const f = fixture(true), original = f.api.createTool.getMockImplementation(); let count = 0;
  f.api.createTool.mockImplementation(async config => {
    ++count;
    if (kind === 'failed create' || (kind === 'failed second create' && count === 2)) throw Error('uncertain create');
    const result = await original(config), record = f.created.at(-1);
    if (kind === 'no ID') return {};
    if (kind === 'old ID') return { id: f.records[0].id };
    if (kind === 'duplicate ID' && count === 2) return { id: f.created[0].id };
    if (kind === 'wrong ID') record.id = 'other-id';
    if (kind === 'ownership') record.access_info.is_creator = false;
    if (kind === 'extra access') record.access_info.anonymous_access_level_override = 'admin';
    if (kind === 'mocks') record.response_mocks = [{ name: 'unreviewed' }];
    if (kind === 'malformed mocks') record.response_mocks = { name: 'unreviewed' };
    if (kind === 'native header') record.tool_config.api_schema.request_headers['x-caller-number'].variable_name = 'user';
    if (kind === 'constant') record.tool_config.api_schema.request_body_schema.properties.reservation_code_spelling.constant_value = 'foreign';
    if (kind === 'body keys') record.tool_config.api_schema.request_body_schema.properties.phone = { type: 'string' };
    if (kind === 'required') record.tool_config.api_schema.request_body_schema.required = ['reservation_id'];
    if (kind === 'assignment') record.tool_config.assignments = [{ source: 'foreign' }];
    if (kind === 'query schema') record.tool_config.api_schema.query_params_schema = { type: 'object', properties: {} };
    if (kind === 'redirect') record.tool_config.follow_redirects = true;
    return result;
  });
  await expect(m.replaceGuestTools(f)).rejects.toThrow(); expect(f.api.patchGuest).not.toHaveBeenCalled(); expect(f.api.deleteTool).not.toHaveBeenCalled();
  expect(f.entries.at(-1).event).toBe('failed'); expect(f.close).toHaveBeenCalledTimes(1);
  if (['failed create', 'no ID'].includes(kind)) expect(count).toBe(1);
  if (kind === 'failed second create') expect(f.entries.at(-1).createdIds).toEqual(['created-1']);
  if (kind === 'old ID') expect(f.entries.some(e => e.event === 'created' && e.id === f.records[0].id)).toBe(true);
});
test.each(['old record', 'old mock', 'new record'])('rejects %s drift after creation and before PATCH', async kind => {
  const f = fixture(true), original = f.api.createTool.getMockImplementation();
  f.api.createTool.mockImplementation(async config => {
    const result = await original(config);
    if (f.created.length === 3) {
      if (kind === 'old record') f.records[4].access_info.role = 'changed';
      if (kind === 'old mock') f.records[0].response_mocks = [];
      if (kind === 'new record') f.created[0].tool_config.description += 'changed';
    } return result;
  });
  await expect(m.replaceGuestTools(f)).rejects.toThrow(); expect(f.api.patchGuest).not.toHaveBeenCalled(); expect(f.entries.at(-1).createdIds).toHaveLength(3);
});
test.each(['prompt', 'same version', 'IDs', 'old record', 'old mock', 'new record', 'system', 'builtin', 'ASR', 'voice', 'backup', 'platform', 'workflow', 'phone', 'branch', 'procedures'])('detects %s readback drift with no automatic second PATCH', async kind => {
  const f = fixture(true), patch = f.api.patchGuest.getMockImplementation();
  f.api.patchGuest.mockImplementation(async (...args) => {
    await patch(...args); const p = f.agent.conversation_config.agent.prompt;
    if (kind === 'prompt') p.prompt += 'changed';
    if (kind === 'same version') f.agent.version_id = m.SOURCE_VERSION;
    if (kind === 'IDs') p.tool_ids.reverse();
    if (kind === 'old record') f.records[4].tool_config.description += 'changed';
    if (kind === 'old mock') f.records[0].response_mocks = [];
    if (kind === 'new record') f.created[0].tool_config.description += 'changed';
    if (kind === 'system') p.tools.at(-1).params.only_at_conversation_start = true;
    if (kind === 'builtin') p.built_in_tools.end_call.params.system_tool_type = 'other';
    if (kind === 'ASR') f.agent.conversation_config.asr.keywords = [];
    if (kind === 'voice') f.agent.conversation_config.tts.voice_id = 'other';
    if (kind === 'backup') p.backup_llm_config.model = 'other';
    if (kind === 'platform') f.agent.platform_settings.auth.mode = 'other';
    if (kind === 'workflow') f.agent.workflow.nodes.foreign = {};
    if (kind === 'phone') f.phone.assigned_agent.agent_id = 'other';
    if (kind === 'branch') f.branch.description = 'other';
    if (kind === 'procedures') f.agent.procedures = { foreign: {} };
  });
  await expect(m.replaceGuestTools(f)).rejects.toThrow(); expect(f.api.patchGuest).toHaveBeenCalledTimes(1);
  expect(f.entries.at(-1).event).toBe('failed'); expect(f.api.updateTool).not.toHaveBeenCalled(); expect(f.api.deleteTool).not.toHaveBeenCalled();
});
test('an ambiguous PATCH error never retries or rolls back', async () => {
  const f = fixture(true); f.api.patchGuest.mockRejectedValue(Error('timeout after possible commit'));
  await expect(m.replaceGuestTools(f)).rejects.toThrow(/timeout/); expect(f.api.patchGuest).toHaveBeenCalledTimes(1);
  expect(f.entries.at(-1).createdIds).toHaveLength(3); expect(f.api.deleteTool).not.toHaveBeenCalled();
});
test('wire adapter has only GET, create and a narrow agent PATCH, with no expanded tools/builtin edits', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({}) })), api = m.createDictationApi('fake-key', fetcher);
  await api.patchGuest(m.SOURCE_BRANCH, 'reviewed prompt', ['seven-exact-ids']);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toContain(`?branch_id=${m.SOURCE_BRANCH}&include_procedure_generated_workflow_elements=false`);
  expect(init.method).toBe('PATCH'); expect(init.redirect).toBe('error');
  expect(JSON.parse(init.body)).toEqual({ conversation_config: { agent: { prompt: { prompt: 'reviewed prompt', tool_ids: ['seven-exact-ids'] } } }, procedures: {} });
  expect(api.updateTool).toBeUndefined(); expect(api.deleteTool).toBeUndefined(); expect(api.patchKeywords).toBeUndefined();
  await api.createTool({ name: 'new-guest' });
  expect(fetcher.mock.calls[1][0]).toBe('https://api.elevenlabs.io/v1/convai/tools');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ tool_config: { name: 'new-guest' } });
});
test('HTTP failure is surfaced once, without retry or response-body disclosure', async () => {
  const fetcher = jest.fn(async () => ({ ok: false, status: 403, json: jest.fn() }));
  await expect(m.createDictationApi('fake-key', fetcher).createTool({})).rejects.toThrow('HTTP 403'); expect(fetcher).toHaveBeenCalledTimes(1);
});
test('CLI publication hold fails before any fetch even with apply arguments', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockRejectedValue(Error('must not be called'));
  try {
    await expect(m.main(['--project-ref', TARGET.projectRef, '--workspace-id', TARGET.workspaceId, '--branch-id', m.SOURCE_BRANCH,
      '--expected-version', m.SOURCE_VERSION, '--apply', '--manifest', '/private/journal'], {})).rejects.toThrow(/Publication held/);
    expect(fetcher).not.toHaveBeenCalled(); expect(m.BACKEND_RELEASE.productionVerified).toBe(false);
  } finally { fetcher.mockRestore(); }
});
test('journal is exclusive, private and fsynced; unsafe directories and reuse are refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seatable-dictation-test-')), file = path.join(dir, 'before.jsonl');
  const sync = jest.spyOn(fs, 'fsyncSync');
  try {
    fs.chmodSync(dir, 0o700); const journal = m.openPrivateJournal(file);
    journal.append({ event: 'before' }); expect(sync).toHaveBeenCalledTimes(1); journal.close();
    expect(fs.statSync(file).mode & 0o777).toBe(0o600); expect(() => m.openPrivateJournal(file)).toThrow();
    fs.chmodSync(dir, 0o755); expect(() => m.openPrivateJournal(path.join(dir, 'unsafe'))).toThrow(/private/);
  } finally { sync.mockRestore(); fs.rmSync(dir, { recursive: true, force: true }); }
});
