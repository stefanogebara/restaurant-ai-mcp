var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));
jest.mock('../_lib/subscription-middleware', () => ({
  inlineCheckSubscription: jest.fn().mockResolvedValue(false),
  softCheckSubscription: jest.fn().mockResolvedValue(false),
  checkSubscriptionByRestaurantId: jest.fn().mockResolvedValue({ active: true, plan: 'growth', status: 'active' }),
  inlineRequireFeature: jest.fn().mockReturnValue(false),
  checkSubscription: jest.fn((req, res, next) => next()),
  requireFeature: jest.fn(() => (req, res, next) => next()),
  checkReservationLimits: jest.fn((req, res, next) => next()),
  isDemoRestaurant: jest.fn().mockResolvedValue(false),
}));
// triggerKbSync calls into ElevenLabs — mock so tests don't make real network calls
jest.mock('../_lib/kb-sync-trigger', () => ({
  triggerKbSync: jest.fn().mockResolvedValue({ success: true, durationMs: 0 }),
}));
jest.mock('../_services/voiceAgentService', () => ({
  refreshVoiceAgentPrompt: jest.fn().mockResolvedValue({ success: true }),
}));

function makeChain(data) {
  const chain = {
    select: jest.fn(), eq: jest.fn(), single: jest.fn(),
    update: jest.fn(), schema: jest.fn(),
  };
  chain.schema.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data, error: null });
  return chain;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const handler = require('../voice-persona');
const { refreshVoiceAgentPrompt } = require('../_services/voiceAgentService');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ agent_name: 'Sofia', agent_greeting: 'Welcome!' }));
});

it('GET returns agent_name and agent_greeting', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith({ agent_name: 'Sofia', agent_greeting: 'Welcome!' });
});

it('PATCH updates agent_name and agent_greeting (and reports kb_synced)', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'Marco', agent_greeting: 'Ciao!' },
  }, res);
  expect(res.json).toHaveBeenCalledWith({
    agent_name: 'Sofia',
    agent_greeting: 'Welcome!',
    kb_synced: true,
    agent_synced: true,
  });
  expect(refreshVoiceAgentPrompt).toHaveBeenCalledWith('rest-1', { syncFirstMessage: true });
});

it('PATCH of only the agent name refreshes the prompt without replacing the opening greeting', async () => {
  const res = mockRes();
  await handler({ method: 'PATCH', headers: { authorization: 'Bearer tok' }, body: { agent_name: 'Marco' } }, res);
  expect(refreshVoiceAgentPrompt).toHaveBeenCalledWith('rest-1', { syncFirstMessage: false });
});

it('reports a saved persona separately from a failed live-agent sync', async () => {
  refreshVoiceAgentPrompt.mockResolvedValueOnce({ success: false, error: 'provider_failed' });
  const res = mockRes();
  await handler({ method: 'PATCH', headers: { authorization: 'Bearer tok' }, body: { agent_greeting: 'Olá!' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    agent_greeting: 'Welcome!', kb_synced: true, agent_synced: false,
  }));
});

it('reports a saved persona if the prompt sync throws after the database update', async () => {
  refreshVoiceAgentPrompt.mockRejectedValueOnce(new Error('network timeout'));
  const res = mockRes();
  await handler({ method: 'PATCH', headers: { authorization: 'Bearer tok' }, body: { agent_greeting: 'Olá!' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ agent_synced: false, kb_synced: true }));
  expect(res.status).not.toHaveBeenCalledWith(500);
});

it('PATCH returns 400 when agent_name exceeds 50 chars', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'A'.repeat(51) },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('PATCH returns 400 when agent_greeting exceeds 200 chars', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_greeting: 'X'.repeat(201) },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for DELETE', async () => {
  const res = mockRes();
  await handler({ method: 'DELETE', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
