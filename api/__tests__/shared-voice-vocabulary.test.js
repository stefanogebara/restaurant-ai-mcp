'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildVocabulary, mergeKeywords, fingerprint, TARGET } = require('../../scripts/_lib/shared-voice-vocabulary.cjs');
const { parseArgs, sync, createApi, createDb } = require('../../scripts/sync-shared-voice-vocabulary.cjs');
const row = (extra = {}) => ({ id: 'r1', restaurant_name: 'Seatable CI Sandbox', is_active: true,
  onboarding_completed: true, is_demo: false, shared_routing_enabled: true, ...extra });
function fixture() {
  const agent = { agent_id: TARGET.agentId, name: TARGET.agentName, branch_id: 'main-id', main_branch_id: 'main-id', version_id: 'v1',
    conversation_config: { asr: { provider: 'scribe_realtime', quality: 'high', keywords: ['Custom'], keyterm_libraries: [] },
      agent: { prompt: { prompt: 'Protected', tool_ids: ['tool1'] } } },
    procedures: {}, platform_settings: { overrides: { keywords: false } }, workflow: { nodes: {} } };
  const phone = { phone_number_id: 'phone1', phone_number: TARGET.phone, provider: 'twilio', assigned_agent: { agent_id: TARGET.agentId, branch_id: null } };
  const api = { getWorkspaceId: jest.fn(async () => TARGET.workspaceId), getAgent: jest.fn(async () => structuredClone(agent)),
    getBranch: jest.fn(async () => ({ id: 'main-id', agent_id: TARGET.agentId, name: 'main', is_archived: false, current_live_percentage: 100 })),
    getPhones: jest.fn(async () => [structuredClone(phone)]),
    getProcedures: jest.fn(async () => ({ procedures: [] })),
    patchKeywords: jest.fn(async (branch, keywords) => { agent.conversation_config.asr.keywords = keywords; agent.version_id = 'v2'; }) };
  return { api, agent, phone, db: { listRows: jest.fn(async () => [row()]) }, options: { branchId: 'main-id', expectedVersion: 'v1', apply: false } };
}
test('canonical phrase and words only, deterministic, never aliases or guest data', () => {
  const rows = [row({ aliases: ['Casa Safira', 'C1'], customer_name: 'Guest' }), row({ id: 'r2', restaurant_name: 'Café Azul' })];
  expect(buildVocabulary(rows)).toEqual(['Azul', 'CI', 'Café', 'Café Azul', 'Sandbox', 'Seatable', 'Seatable CI Sandbox']);
  expect(buildVocabulary(rows.reverse())).toEqual(buildVocabulary(rows));
});
test.each([{ is_active: false }, { onboarding_completed: false }, { is_demo: true }, { is_demo: null },
  { shared_routing_enabled: false }, { shared_routing_enabled: 'true' }, { shared_routing_enabled: undefined }])('strict eligibility %j', extra => {
  expect(buildVocabulary([row(extra)])).toEqual([]);
});
test('overlong official names fail rather than truncate', () => expect(() => buildVocabulary([row({ restaurant_name: 'A'.repeat(21) })])).toThrow(/20/));
test('empty eligible name is an error', () => expect(() => buildVocabulary([row({ restaurant_name: ' ' })])).toThrow(/name/));
test('existing custom keywords remain byte-for-byte in order; idempotent and case-insensitive merge', () => {
  const old = ['custom Brand', 'seatable'];
  const merged = mergeKeywords(old, buildVocabulary([row()]));
  expect(merged.slice(0, 2)).toEqual(old);
  expect(merged).not.toContain('Seatable');
  expect(mergeKeywords(merged, buildVocabulary([row()]))).toEqual(merged);
});
test('overflow and invalid existing terms fail without truncating', () => {
  expect(() => mergeKeywords(Array.from({ length: 50 }, (_, i) => `custom${i}`), ['New'])).toThrow(/50/);
  expect(() => mergeKeywords(['A'.repeat(21)], [])).toThrow(/20/);
});
test('CLI defaults dry and requires explicit identities, branch, expected version and private journal for apply', () => {
  const args = ['--project-ref', TARGET.projectRef, '--workspace-id', TARGET.workspaceId, '--branch-id', 'main-id'];
  expect(parseArgs(args).apply).toBe(false);
  expect(() => parseArgs([...args, '--apply'])).toThrow();
  expect(() => parseArgs([...args, '--apply', '--manifest', '/tmp/x'])).toThrow(/expected-version/);
  expect(() => parseArgs([...args, '--unknown'])).toThrow();
  expect(() => parseArgs(args.map(x => x === TARGET.workspaceId ? 'Inner' : x))).toThrow(/identity/);
});
test('dry run reads only, includes previous and proposed keywords', async () => {
  const f = fixture(); const result = await sync(f);
  expect(result.before).toEqual(['Custom']); expect(result.after).toContain('Seatable CI Sandbox');
  expect(f.api.patchKeywords).not.toHaveBeenCalled(); expect(result.status).toBe('dry-run');
});
test.each(['workspace', 'agent', 'branch', 'phone', 'provider', 'version'])('refuses mismatched %s before patch', async kind => {
  const f = fixture();
  if (kind === 'workspace') f.api.getWorkspaceId.mockResolvedValue('Inner');
  if (kind === 'agent') f.agent.agent_id = 'foreign';
  if (kind === 'branch') f.agent.main_branch_id = 'other';
  if (kind === 'phone') f.phone.assigned_agent.agent_id = 'foreign';
  if (kind === 'provider') f.agent.conversation_config.asr.provider = 'elevenlabs';
  if (kind === 'version') f.options.expectedVersion = 'old';
  await expect(sync(f)).rejects.toThrow(); expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test('unchanged vocabulary is a no-op, even apply, without opening journal', async () => {
  const f = fixture(); f.agent.conversation_config.asr.keywords = mergeKeywords(['Custom'], buildVocabulary([row()]));
  f.options.apply = true; const openJournal = jest.fn();
  expect((await sync({ ...f, openJournal })).status).toBe('no-op');
  expect(openJournal).not.toHaveBeenCalled(); expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test('apply records rollback durably before keyword-only write; verifies protected state and new version', async () => {
  const f = fixture(); f.options.apply = true;
  const entries = []; const append = jest.fn(e => entries.push(e)); const close = jest.fn();
  f.options.manifest = 'mock';
  f.api.patchKeywords.mockImplementation(async (branch, keywords) => {
    expect(entries[0]).toMatchObject({ event: 'before', before: ['Custom'], version: 'v1', branchId: 'main-id' });
    expect(branch).toBe('main-id'); f.agent.conversation_config.asr.keywords = keywords; f.agent.version_id = 'v2';
  });
  expect((await sync({ ...f, openJournal: () => ({ append, close }) })).status).toBe('verified');
  expect(entries.at(-1)).toMatchObject({ event: 'verified', version: 'v2' }); expect(close).toHaveBeenCalled();
});
test('stale version between inspection and apply aborts before journal/write', async () => {
  const f = fixture(); f.options.apply = true; f.options.manifest = 'mock';
  const original = structuredClone(f.agent); f.api.getAgent.mockResolvedValueOnce(original).mockResolvedValue({ ...original, version_id: 'v2' });
  await expect(sync(f)).rejects.toThrow(/version/i); expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test('protected prompt change on readback fails and retains rollback journal', async () => {
  const f = fixture(); f.options.apply = true; f.options.manifest = 'mock'; const entries = [];
  f.api.patchKeywords.mockImplementation(async (_, keywords) => { f.agent.conversation_config.asr.keywords = keywords; f.agent.conversation_config.agent.prompt.prompt = 'Changed'; });
  await expect(sync({ ...f, openJournal: () => ({ append: e => entries.push(e), close() {} }) })).rejects.toThrow(/protected/i);
  expect(entries[0].before).toEqual(['Custom']); expect(entries.at(-1).event).toBe('failed');
});
test('journal is exclusive and mode 0600 before any write', () => {
  const { createJournal } = require('../../scripts/migrate-elevenlabs-date-tools.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-test-')); const file = path.join(dir, 'rollback.jsonl');
  try { const journal = createJournal(file); journal.append({ before: [] }); journal.close();
    expect(fs.statSync(file).mode & 0o777).toBe(0o600); expect(() => createJournal(file)).toThrow();
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('adapter sends ASR keywords and explicit empty procedure pin to the exact branch', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  await createApi('fake', fetcher).patchKeywords('main-id', ['Seatable']);
  const [url, init] = fetcher.mock.calls[0]; expect(url).toContain('branch_id=main-id');
  expect(init.method).toBe('PATCH'); expect(JSON.parse(init.body)).toEqual({ conversation_config: { asr: { keywords: ['Seatable'] } }, procedures: {} });
});
test('directory REST projection excludes aliases/guests and requires complete result', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => [row()], headers: { get: () => '0-0/1' } }));
  const rows = await createDb('fake', fetcher).listRows(); expect(rows).toHaveLength(1);
  const [url, init] = fetcher.mock.calls[0]; const select = new URL(url).searchParams.get('select');
  expect(select).toContain('shared_routing_enabled:ai_config->phone->shared_routing_enabled');
  expect(select).not.toContain('aliases'); expect(init.headers['Accept-Profile']).toBe('restaurant');
  fetcher.mockResolvedValue({ ok: true, json: async () => [row()], headers: { get: () => null } });
  await expect(createDb('fake', fetcher).listRows()).rejects.toThrow(/incomplete/i);
});
test('protected fingerprints ignore only keywords and volatile version, not security/workflow/phone', () => {
  const f = fixture(); const original = fingerprint(f.agent, [f.phone]); f.agent.version_id = 'v2';
  f.agent.conversation_config.asr.keywords = ['New']; expect(fingerprint(f.agent, [f.phone])).toBe(original);
  f.agent.platform_settings.overrides.keywords = true; expect(fingerprint(f.agent, [f.phone])).not.toBe(original);
});
test('directory changes between dry inspection and write abort before patch', async () => {
  const f = fixture(); f.options = { ...f.options, apply: true, manifest: 'mock' };
  f.db.listRows.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row({ restaurant_name: 'Changed Name' })]);
  await expect(sync(f)).rejects.toThrow(/changed/); expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test('phone reassignment on readback fails protected verification', async () => {
  const f = fixture(); f.options = { ...f.options, apply: true, manifest: 'mock' };
  f.api.patchKeywords.mockImplementation(async (_, keywords) => { f.agent.conversation_config.asr.keywords = keywords; f.phone.assigned_agent.agent_id = 'other'; });
  await expect(sync({ ...f, openJournal: () => ({ append() {}, close() {} }) })).rejects.toThrow(/protected/);
});
test('journal failure prevents provider mutation', async () => {
  const f = fixture(); f.options = { ...f.options, apply: true, manifest: 'mock' };
  await expect(sync({ ...f, openJournal: () => { throw new Error('Disk unavailable'); } })).rejects.toThrow(/Disk/);
  expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test('project URL mismatch fails before private API or directory access', async () => {
  const { main } = require('../../scripts/sync-shared-voice-vocabulary.cjs');
  await expect(main(['--project-ref', TARGET.projectRef, '--workspace-id', TARGET.workspaceId, '--branch-id', 'main-id'],
    { SUPABASE_URL: 'https://other.supabase.co' })).rejects.toThrow(/Project identity/);
});
test('archived, non-main and non-serving branches fail without patch', async () => {
  for (const changes of [{ name: 'preview' }, { is_archived: true }, { current_live_percentage: 99 }]) {
    const f = fixture(); f.api.getBranch.mockResolvedValue({ id: 'main-id', agent_id: TARGET.agentId, name: 'main', is_archived: false, current_live_percentage: 100, ...changes });
    await expect(sync(f)).rejects.toThrow(/main/); expect(f.api.patchKeywords).not.toHaveBeenCalled();
  }
});
test('incomplete or duplicate directory cannot yield partial vocabulary', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => [row(), row()], headers: { get: () => '0-1/2' } }));
  await expect(createDb('fake', fetcher).listRows()).rejects.toThrow(/incomplete/);
  expect(() => buildVocabulary(Array.from({ length: 1000 }, () => row()))).toThrow(/incomplete/);
});

test.each([undefined, null, [], { proc1: { version_id: 'p1' } }])('unknown or nonempty published procedure map blocks before write: %j', async procedures => {
  const f = fixture(); f.agent.procedures = procedures;
  await expect(sync(f)).rejects.toThrow(/procedure/i); expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test.each([null, {}, { procedures: null }, { procedures: [{ procedure_id: 'draft1', has_draft: true }] },
  { procedures: [{ procedure_id: 'published1', has_draft: false }] }])('unproven empty procedure inventory blocks: %j', async listing => {
  const f = fixture(); f.api.getProcedures.mockResolvedValue(listing);
  await expect(sync(f)).rejects.toThrow(/procedure/i); expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test('published snapshot and draft-aware list are both checked, including the final preflight', async () => {
  const f = fixture(); f.options = { ...f.options, apply: true, manifest: 'mock' };
  f.api.getProcedures.mockResolvedValueOnce({ procedures: [] }).mockResolvedValueOnce({ procedures: [] })
    .mockResolvedValueOnce({ procedures: [] }).mockResolvedValueOnce({ procedures: [{ procedure_id: 'new', has_draft: true }] });
  await expect(sync(f)).rejects.toThrow(/procedure/i);
  expect(f.api.getProcedures.mock.calls.slice(0, 2)).toEqual([['main-id', 'v1'], ['main-id']]);
  expect(f.api.patchKeywords).not.toHaveBeenCalled();
});
test('pinning empty published map prevents implicit draft publication before readback', async () => {
  const f = fixture(); f.options = { ...f.options, apply: true, manifest: 'mock' };
  let implicitPublications = 0;
  const provider = createApi('fake', jest.fn(async (_, init) => {
    const body = JSON.parse(init.body); f.agent.conversation_config.asr.keywords = body.conversation_config.asr.keywords;
    f.agent.version_id = 'v2';
    // Publishing without procedures implicitly picks up drafts. This used to write
    // once, then fail the protected fingerprint, after publication had occurred.
    if (body.procedures === undefined) implicitPublications++;
    f.agent.procedures = body.procedures === undefined ? { unpublished: { version_id: 'accidental' } } : body.procedures;
    return { ok: true, json: async () => f.agent };
  }));
  f.api.patchKeywords = jest.fn(provider.patchKeywords);
  await expect(sync({ ...f, openJournal: () => ({ append() {}, close() {} }) })).resolves.toMatchObject({ status: 'verified' });
  expect(f.api.patchKeywords).toHaveBeenCalledTimes(1); expect(f.agent.procedures).toEqual({});
  expect(implicitPublications).toBe(0);
});
test('procedure adapter scopes published listing to exact version and separately reads drafts', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ procedures: [] }) }));
  const api = createApi('fake', fetcher);
  await api.getProcedures('main-id', 'v1'); await api.getProcedures('main-id');
  expect(fetcher.mock.calls[0][0]).toContain('/branches/main-id/procedures?agent_version_id=v1');
  expect(fetcher.mock.calls[1][0]).toMatch(/\/branches\/main-id\/procedures$/);
});
