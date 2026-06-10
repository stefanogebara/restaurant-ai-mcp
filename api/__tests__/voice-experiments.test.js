var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn(), schema: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));
jest.mock('../_services/elevenlabsAgentService', () => ({
  getAgentIdForRestaurant: jest.fn(),
  enableVersioning: jest.fn(),
  createBranch: jest.fn(),
  deployTrafficSplit: jest.fn(),
  deleteBranch: jest.fn(),
  getBranchConversationCount: jest.fn(),
}));
jest.mock('node-fetch', () => jest.fn());

const {
  getAgentIdForRestaurant,
  enableVersioning,
  createBranch,
  deployTrafficSplit,
  deleteBranch,
  getBranchConversationCount,
} = require('../_services/elevenlabsAgentService');
const nodeFetch = require('node-fetch');

function makeChain(data) {
  const terminal = { data, error: null };
  const chain = {};
  // All chainable methods return chain; terminal methods resolve
  ['select', 'eq', 'in', 'insert', 'update', 'schema', 'from'].forEach(m => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.maybeSingle = jest.fn().mockResolvedValue(terminal);
  chain.single = jest.fn().mockResolvedValue(terminal);
  return chain;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const handler = require('../voice-experiments');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'test-123' });

  // Default: schema().from() returns a chain with null experiment (no active)
  const chain = makeChain(null);
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

  // Default ElevenLabs mocks
  getAgentIdForRestaurant.mockResolvedValue('agent-abc');
  enableVersioning.mockResolvedValue({ success: true, current_version_id: 'ver-1' });
  createBranch.mockResolvedValue({ success: true, branch_id: 'branch-xyz' });
  deployTrafficSplit.mockResolvedValue({ success: true });
  deleteBranch.mockResolvedValue({ success: true });
  getBranchConversationCount.mockResolvedValue({ success: true, count: 5 });

  // node-fetch mock for getAgentMainBranchId
  nodeFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ main_branch_id: 'main-branch-1' }),
    text: async () => '',
  });

  process.env.ELEVENLABS_API_KEY = 'test-key';
});

// ---------------------------------------------------------------------------
// 1. Auth guard
// ---------------------------------------------------------------------------

it('returns 401 without valid JWT', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', query: { action: 'current' }, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

// ---------------------------------------------------------------------------
// 2. Method validation
// ---------------------------------------------------------------------------

it('returns 405 for PUT', async () => {
  const res = mockRes();
  await handler({ method: 'PUT', query: {}, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

it('returns 405 for DELETE', async () => {
  const res = mockRes();
  await handler({ method: 'DELETE', query: {}, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

// ---------------------------------------------------------------------------
// 3. GET current — no experiment
// ---------------------------------------------------------------------------

it('GET current returns null experiment when none exists', async () => {
  const chain = makeChain(null);
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

  const res = mockRes();
  await handler({
    method: 'GET',
    query: { action: 'current' },
    headers: { authorization: 'Bearer tok' },
  }, res);

  expect(res.json).toHaveBeenCalledWith({ success: true, experiment: null });
});

// ---------------------------------------------------------------------------
// 4. GET current — with running experiment
// ---------------------------------------------------------------------------

it('GET current returns experiment with conversation counts', async () => {
  const experiment = {
    id: 'exp-1',
    status: 'running',
    branch_id: 'branch-xyz',
    branch_name: 'Test B',
    variant_config: { agent_name: 'Marco' },
    traffic_split: 20,
    started_at: '2026-03-16T00:00:00Z',
    created_at: '2026-03-16T00:00:00Z',
  };

  const chain = makeChain(experiment);
  chain.maybeSingle.mockResolvedValue({ data: experiment, error: null });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

  getBranchConversationCount
    .mockResolvedValueOnce({ success: true, count: 10 })
    .mockResolvedValueOnce({ success: true, count: 3 });

  const res = mockRes();
  await handler({
    method: 'GET',
    query: { action: 'current' },
    headers: { authorization: 'Bearer tok' },
  }, res);

  const call = res.json.mock.calls[0][0];
  expect(call.success).toBe(true);
  expect(call.experiment.branch_name).toBe('Test B');
  expect(call.experiment.control_count).toBe(10);
  expect(call.experiment.variant_count).toBe(3);
});

// ---------------------------------------------------------------------------
// 5. POST create — missing branch_name
// ---------------------------------------------------------------------------

it('POST create returns 400 when branch_name is missing', async () => {
  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'create' },
    headers: { authorization: 'Bearer tok' },
    body: { variant_config: { agent_name: 'Marco' }, traffic_split: 10 },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

// ---------------------------------------------------------------------------
// 6. POST create — invalid variant_config (empty)
// ---------------------------------------------------------------------------

it('POST create returns 400 when variant_config is empty', async () => {
  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'create' },
    headers: { authorization: 'Bearer tok' },
    body: { branch_name: 'Test', variant_config: {}, traffic_split: 10 },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

// ---------------------------------------------------------------------------
// 7. POST create — invalid traffic_split (0 or 51)
// ---------------------------------------------------------------------------

it('POST create returns 400 when traffic_split is 0', async () => {
  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'create' },
    headers: { authorization: 'Bearer tok' },
    body: { branch_name: 'Test', variant_config: { agent_name: 'Marco' }, traffic_split: 0 },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('POST create returns 400 when traffic_split is 51', async () => {
  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'create' },
    headers: { authorization: 'Bearer tok' },
    body: { branch_name: 'Test', variant_config: { agent_name: 'Marco' }, traffic_split: 51 },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

// ---------------------------------------------------------------------------
// 8. POST create — active experiment exists
// ---------------------------------------------------------------------------

it('POST create returns 409 when active experiment exists', async () => {
  const existing = { id: 'exp-old', status: 'running', branch_id: 'b-1' };
  const chain = makeChain(existing);
  chain.maybeSingle.mockResolvedValue({ data: existing, error: null });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'create' },
    headers: { authorization: 'Bearer tok' },
    body: { branch_name: 'New', variant_config: { agent_name: 'Marco' }, traffic_split: 10 },
  }, res);
  expect(res.status).toHaveBeenCalledWith(409);
});

// ---------------------------------------------------------------------------
// 9. POST create — success
// ---------------------------------------------------------------------------

it('POST create returns experiment with status running', async () => {
  // First call: getActiveExperiment returns null (no active)
  // Second call: insert returns the new experiment
  const insertedExperiment = {
    id: 'exp-new',
    status: 'running',
    branch_id: 'branch-xyz',
    branch_name: 'Friendly Voice',
    variant_config: { agent_name: 'Marco' },
    traffic_split: 10,
  };

  // Chain that returns null for maybeSingle (no active experiment) and inserted data for single
  const chain = makeChain(insertedExperiment);
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  chain.single.mockResolvedValue({ data: insertedExperiment, error: null });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'create' },
    headers: { authorization: 'Bearer tok' },
    body: { branch_name: 'Friendly Voice', variant_config: { agent_name: 'Marco' }, traffic_split: 10 },
  }, res);

  const call = res.json.mock.calls[0][0];
  expect(call.success).toBe(true);
  expect(call.experiment.status).toBe('running');
  expect(call.experiment.branch_name).toBe('Friendly Voice');
});

// ---------------------------------------------------------------------------
// 10. POST promote — no active experiment
// ---------------------------------------------------------------------------

it('POST promote returns 404 when no active experiment', async () => {
  const chain = makeChain(null);
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'promote' },
    headers: { authorization: 'Bearer tok' },
    body: {},
  }, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

// ---------------------------------------------------------------------------
// 11. POST rollback — no active experiment
// ---------------------------------------------------------------------------

it('POST rollback returns 404 when no active experiment', async () => {
  const chain = makeChain(null);
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) });

  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'rollback' },
    headers: { authorization: 'Bearer tok' },
    body: {},
  }, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

// ---------------------------------------------------------------------------
// 12. POST unknown action
// ---------------------------------------------------------------------------

it('POST with unknown action returns 405', async () => {
  const res = mockRes();
  await handler({
    method: 'POST',
    query: { action: 'unknown' },
    headers: {},
  }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
