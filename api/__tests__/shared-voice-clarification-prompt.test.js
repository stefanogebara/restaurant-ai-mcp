'use strict';
const { TARGET } = require('../../scripts/_lib/shared-voice-vocabulary.cjs');
const { ANCHOR, REPLACEMENT, buildPrompt, protectedHash, createPromptApi, updatePrompt } = require('../../scripts/clarify-shared-voice-name.cjs');
const prompt = `Scope and authentication stay unchanged. ${ANCHOR} Booking consent stays unchanged.`;
function fixture() {
  const agent = { agent_id: TARGET.agentId, name: TARGET.agentName, branch_id: 'main-id', main_branch_id: 'main-id', version_id: 'v1',
    conversation_config: { asr: { provider: 'scribe_realtime', keywords: ['Seatable'] }, agent: { prompt: { prompt, tool_ids: ['private-tool'] } } },
    procedures: {}, workflow: { nodes: {} }, platform_settings: { overrides: { enabled: false } } };
  const phone = { phone_number_id: 'phone-id', phone_number: TARGET.phone, assigned_agent: { agent_id: TARGET.agentId, branch_id: null } };
  const api = { getWorkspaceId: jest.fn(async () => TARGET.workspaceId), getAgent: jest.fn(async () => structuredClone(agent)),
    getBranch: jest.fn(async () => ({ id: 'main-id', agent_id: TARGET.agentId, name: 'main', is_archived: false, current_live_percentage: 100 })),
    getPhones: jest.fn(async () => [structuredClone(phone)]), getProcedures: jest.fn(async () => ({ procedures: [] })),
    patchPrompt: jest.fn(async (_, next) => { agent.conversation_config.agent.prompt.prompt = next; agent.version_id = 'v2'; }) };
  const entries = [];
  return { agent, phone, api, db: { listRows: jest.fn(async () => []) }, options: { branchId: 'main-id', expectedVersion: 'v1', apply: false, manifest: 'mock' },
    entries, openJournal: () => ({ append: e => entries.push(e), close() {} }) };
}
test('replaces only the reviewed failure instruction, preserving scope and booking consent', () => {
  expect(buildPrompt(prompt)).toBe(`Scope and authentication stay unchanged. ${REPLACEMENT} Booking consent stays unchanged.`);
  expect(buildPrompt(buildPrompt(prompt))).toBe(buildPrompt(prompt));
  expect(REPLACEMENT).toMatch(/wait for the caller's next turn/i);
  expect(REPLACEMENT).toMatch(/not consent to book/i);
});
test.each(['unknown prompt', `${ANCHOR} ${ANCHOR}`, `${ANCHOR} ${REPLACEMENT}`])('refuses unknown or ambiguous prompt preimage', p => {
  expect(() => buildPrompt(p)).toThrow(/prompt/i);
});
test('dry run performs no mutation and returns only hashes and the reviewed paragraph', async () => {
  const f = fixture(); const r = await updatePrompt(f);
  expect(r.status).toBe('dry-run'); expect(r).not.toHaveProperty('beforePrompt');
  expect(f.api.patchPrompt).not.toHaveBeenCalled(); expect(f.entries).toEqual([]);
});
test('records exact rollback prompt before applying only the new paragraph', async () => {
  const f = fixture(); f.options.apply = true;
  f.api.patchPrompt.mockImplementation(async (branch, next) => {
    expect(branch).toBe('main-id'); expect(f.entries[0].beforePrompt).toBe(prompt);
    expect(next).toBe(buildPrompt(prompt)); f.agent.conversation_config.agent.prompt.prompt = next; f.agent.version_id = 'v2';
  });
  expect((await updatePrompt(f)).status).toBe('verified');
  expect(f.entries.at(-1)).toMatchObject({ event: 'verified', version: 'v2' });
});
test.each(['keywords', 'tool', 'workflow', 'phone', 'procedures'])('readback rejects unrelated %s mutation', async kind => {
  const f = fixture(); f.options.apply = true;
  f.api.patchPrompt.mockImplementation(async (_, next) => {
    f.agent.conversation_config.agent.prompt.prompt = next; f.agent.version_id = 'v2';
    if (kind === 'keywords') f.agent.conversation_config.asr.keywords = ['Changed'];
    if (kind === 'tool') f.agent.conversation_config.agent.prompt.tool_ids = ['other'];
    if (kind === 'workflow') f.agent.workflow.nodes = { other: {} };
    if (kind === 'phone') f.phone.assigned_agent.agent_id = 'other';
    if (kind === 'procedures') f.agent.procedures = { unpublished: {} };
  });
  await expect(updatePrompt(f)).rejects.toThrow(); expect(f.entries.at(-1).event).toBe('failed');
});
test.each(['workspace', 'version', 'draft'])('refuses stale/wrong %s before patch', async kind => {
  const f = fixture(); f.options.apply = true;
  if (kind === 'workspace') f.api.getWorkspaceId.mockResolvedValue('Inner');
  if (kind === 'version') f.options.expectedVersion = 'old';
  if (kind === 'draft') f.api.getProcedures.mockResolvedValue({ procedures: [{ has_draft: true }] });
  await expect(updatePrompt(f)).rejects.toThrow(); expect(f.api.patchPrompt).not.toHaveBeenCalled(); expect(f.entries).toEqual([]);
});
test('racing preflight prompt change refuses write', async () => {
  const f = fixture(); f.options.apply = true;
  f.api.getAgent.mockResolvedValueOnce(structuredClone(f.agent)).mockImplementation(async () => {
    const next = structuredClone(f.agent); next.conversation_config.agent.prompt.prompt = 'Changed'; return next;
  });
  await expect(updatePrompt(f)).rejects.toThrow(); expect(f.api.patchPrompt).not.toHaveBeenCalled();
});
test('already migrated prompt is a no-op and does not create a journal', async () => {
  const f = fixture(); f.agent.conversation_config.agent.prompt.prompt = buildPrompt(prompt); f.options.apply = true;
  expect((await updatePrompt(f)).status).toBe('no-op'); expect(f.api.patchPrompt).not.toHaveBeenCalled(); expect(f.entries).toEqual([]);
});
test('protected hash permits only the prompt text to change, not ASR keywords', () => {
  const f = fixture(); const before = protectedHash(f.agent, [f.phone]);
  f.agent.conversation_config.agent.prompt.prompt = buildPrompt(prompt); expect(protectedHash(f.agent, [f.phone])).toBe(before);
  f.agent.conversation_config.asr.keywords.push('Changed'); expect(protectedHash(f.agent, [f.phone])).not.toBe(before);
});
test('adapter pins empty procedures and changes only prompt text on an explicit branch', async () => {
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  await createPromptApi('fake', fetcher).patchPrompt('main-id', 'new prompt');
  const [url, init] = fetcher.mock.calls[0]; expect(url).toContain('branch_id=main-id'); expect(init.method).toBe('PATCH');
  expect(JSON.parse(init.body)).toEqual({ conversation_config: { agent: { prompt: { prompt: 'new prompt' } } }, procedures: {} });
});
