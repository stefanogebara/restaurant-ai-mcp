const {
  PROJECT_REF, SUPABASE_URL, assertProject, assertWorkspace, parseArgs, migrate, inventory, createApi,
} = require('../../scripts/migrate-elevenlabs-date-tools.cjs');

const row = (id = 'restaurant-1', agentId = 'agent-1') => ({
  id, is_active: true, is_demo: false, elevenlabs_agent_id: agentId,
  elevenlabs_webhook_secret: `el_whsec_${(id === 'restaurant-1' ? 'a' : 'b').repeat(64)}`,
});
const dateTool = (id = 'date-1', url = 'https://seatable.one/api/elevenlabs-webhook?action=get_current_datetime', secret = row().elevenlabs_webhook_secret) => ({
  id, tool_config: { type: 'webhook', name: 'get_current_datetime', description: 'Time',
    api_schema: { url, method: 'GET', request_headers: { Authorization: `Bearer ${secret}` } } },
});
const otherTool = { id: 'other-1', tool_config: { type: 'webhook', name: 'other', api_schema: { url: 'https://example.com', method: 'POST' } } };
const agent = ids => ({ conversation_config: { agent: { prompt: { tool_ids: ids } } } });

function fixture(rows = [row()], tools = [dateTool(), otherTool]) {
  let ids = tools.map(tool => tool.id);
  let createdTool;
  const calls = [];
  const api = {
    getAgent: jest.fn(async () => agent(ids)),
    getTool: jest.fn(async id => id === 'date-new' ? createdTool : tools.find(tool => tool.id === id)),
    getDependentAgents: jest.fn(async () => ({ agents: [{ id: rows[0].elevenlabs_agent_id }], branches: [], has_more: false })),
    createTool: jest.fn(async body => { calls.push(['create', body]); createdTool = { id: 'date-new', tool_config: body.tool_config }; return { id: 'date-new' }; }),
    patchAgent: jest.fn(async (id, next) => { calls.push(['patch', id, next]); ids = next; return agent(ids); }),
  };
  return { db: { listRows: jest.fn(async () => rows) }, api, calls, getIds: () => ids };
}

test('explicit project identity and apply journal are mandatory', () => {
  expect(() => assertProject('inner', SUPABASE_URL)).toThrow('Project identity mismatch');
  expect(() => assertProject(PROJECT_REF, 'https://inner.supabase.co')).toThrow('Project identity mismatch');
  expect(() => assertProject(PROJECT_REF, SUPABASE_URL)).not.toThrow();
  expect(() => parseArgs(['--apply', '--project-ref', PROJECT_REF])).toThrow('--manifest');
});

test('ElevenLabs workspace identity must match the expected Seatable workspace', async () => {
  expect(() => assertWorkspace(undefined, 'inner-id')).toThrow('workspace identity mismatch');
  expect(() => assertWorkspace('seatable-id', 'inner-id')).toThrow('workspace identity mismatch');
  expect(() => assertWorkspace('seatable-id', 'seatable-id')).not.toThrow();
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ workspace_id: 'seatable-id' }) }));
  const api = createApi('redacted-key', fetcher);
  expect(await api.getWorkspaceId()).toBe('seatable-id');
  expect(fetcher).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/user', expect.objectContaining({ method: 'GET' }));
});

test('default inventory performs zero writes', async () => {
  const { db, api } = fixture();
  const report = await migrate({ db, api });
  expect(report).toEqual([{ rowId: 'restaurant-1', agentId: 'agent-1', status: 'ready', reason: undefined, oldId: 'date-1' }]);
  expect(api.createTool).not.toHaveBeenCalled();
  expect(api.patchAgent).not.toHaveBeenCalled();
});

test('shared agent and shared date tool are skipped', async () => {
  const sharedAgent = fixture([row('restaurant-1'), row('restaurant-2', 'agent-1')]);
  expect((await inventory(sharedAgent)).map(item => item.reason)).toEqual(['shared_agent', 'shared_agent']);
  expect(sharedAgent.api.getAgent).not.toHaveBeenCalled();

  const sharedTool = fixture([row('restaurant-1', 'agent-1'), row('restaurant-2', 'agent-2')]);
  sharedTool.api.getAgent.mockImplementation(async () => agent(['date-1', 'other-1']));
  expect((await inventory(sharedTool)).map(item => item.reason)).toEqual(['shared_date_tool', 'credential_mismatch']);
  expect(sharedTool.api.createTool).not.toHaveBeenCalled();
});

test('foreign and already fixed date tools are skipped', async () => {
  const foreign = fixture([row()], [dateTool('date-1', 'https://seatable.one/api/elevenlabs-webhook?action=get_current_datetime&restaurant_id=other'), otherTool]);
  expect((await inventory(foreign))[0].reason).toBe('foreign_restaurant_tool');
  const fixed = fixture([row()], [dateTool('date-1', 'https://seatable.one/api/elevenlabs-webhook?action=get_current_datetime&restaurant_id=restaurant-1'), otherTool]);
  expect((await inventory(fixed))[0].reason).toBe('already_fixed');
});

test('a tool used by an agent outside the selected rows is skipped', async () => {
  const f = fixture();
  f.api.getDependentAgents.mockResolvedValue({ agents: [{ id: 'agent-1' }, { id: 'other-agent' }], branches: [], has_more: false });
  expect((await inventory(f))[0].reason).toBe('shared_date_tool');
  expect(f.api.createTool).not.toHaveBeenCalled();
});

test('apply creates a copy and swaps exactly one ID, then verifies readback', async () => {
  const f = fixture();
  const journal = jest.fn();
  const result = await migrate({ ...f, apply: true, journal });
  expect(result[0].status).toBe('verified');
  expect(f.calls.map(call => call[0])).toEqual(['create', 'patch']);
  const body = f.api.createTool.mock.calls[0][0];
  expect(body.tool_config.description).toBe('Time');
  expect(new URL(body.tool_config.api_schema.url).searchParams.get('restaurant_id')).toBe('restaurant-1');
  expect(body.tool_config.api_schema.request_headers.Authorization).toBe(`Bearer ${row().elevenlabs_webhook_secret}`);
  expect(f.api.patchAgent).toHaveBeenCalledWith('agent-1', ['date-new', 'other-1']);
  expect(f.getIds()).toEqual(['date-new', 'other-1']);
  expect(journal.mock.calls.map(([entry]) => entry.state)).toEqual(['create_intent', 'created', 'patch_intent', 'patch_returned', 'verified']);
  expect(JSON.stringify(journal.mock.calls)).not.toContain(row().elevenlabs_webhook_secret);
});

test.each(['create', 'tool_readback', 'patch', 'readback'])('%s failure stops with recovery state', async stage => {
  const f = fixture();
  const journal = jest.fn();
  if (stage === 'create') f.api.createTool.mockRejectedValue(new Error('create failed'));
  if (stage === 'tool_readback') f.api.getTool.mockImplementation(async id => id === 'date-new' ? undefined : [dateTool(), otherTool].find(tool => tool.id === id));
  if (stage === 'patch') f.api.patchAgent.mockRejectedValue(new Error('patch failed'));
  if (stage === 'readback') {
    f.api.getAgent.mockImplementationOnce(async () => agent(['date-1', 'other-1']))
      .mockImplementationOnce(async () => agent(['date-1', 'other-1']))
      .mockImplementationOnce(async () => { throw new Error('readback failed'); });
  }
  await expect(migrate({ ...f, apply: true, journal })).rejects.toThrow('Migration stopped');
  expect(journal.mock.calls.at(-1)[0].state).toBe('failed');
  if (stage === 'create' || stage === 'tool_readback') expect(f.api.patchAgent).not.toHaveBeenCalled();
  else expect(journal.mock.calls.at(-1)[0].new_tool_id).toBe('date-new');
});
