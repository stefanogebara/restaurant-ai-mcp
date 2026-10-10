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
  refreshVoiceAgentPrompt: jest.fn().mockResolvedValue({ success: true, prompt_synced: true, greeting_synced: true }),
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
const { triggerKbSync } = require('../_lib/kb-sync-trigger');
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

it('GET exposes a failed database read instead of pretending the saved greeting is empty', async () => {
  const chain = makeChain(null);
  chain.single.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
  mockSupabaseAdmin.from.mockReturnValue(chain);
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: 'Voice persona temporarily unavailable' });
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
    prompt_synced: true,
    greeting_synced: true,
  });
  expect(triggerKbSync).toHaveBeenCalledWith('rest-1', { reason: 'voice_persona' });
  expect(refreshVoiceAgentPrompt).toHaveBeenCalledWith('rest-1', { syncGreeting: true });
});

it('PATCH reports a saved persona without claiming remote success when either sync fails', async () => {
  triggerKbSync.mockResolvedValueOnce({ success: false, error: 'timeout' });
  refreshVoiceAgentPrompt.mockResolvedValueOnce({ success: true, prompt_synced: true });
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'Marco' },
  }, res);
  expect(res.status).not.toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    kb_synced: false,
    prompt_synced: true,
    greeting_synced: null,
  }));
  expect(refreshVoiceAgentPrompt).toHaveBeenCalledWith('rest-1', { syncGreeting: false });
});

it('PATCH reports an unverified greeting separately from a verified prompt', async () => {
  refreshVoiceAgentPrompt.mockResolvedValueOnce({ success: false, prompt_synced: true, greeting_synced: false });
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_greeting: 'Buongiorno!' },
  }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    kb_synced: true,
    prompt_synced: true,
    greeting_synced: false,
  }));
});

it('PATCH can retry a saved greeting after remote sync fails', async () => {
  refreshVoiceAgentPrompt
    .mockResolvedValueOnce({ success: false, prompt_synced: true, greeting_synced: false })
    .mockResolvedValueOnce({ success: true, prompt_synced: true, greeting_synced: true });
  const request = {
    method: 'PATCH', headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'Sofia', agent_greeting: 'Welcome!' },
  };
  const first = mockRes();
  const retry = mockRes();
  await handler(request, first);
  await handler(request, retry);

  expect(first.json).toHaveBeenCalledWith(expect.objectContaining({ greeting_synced: false }));
  expect(retry.json).toHaveBeenCalledWith(expect.objectContaining({ greeting_synced: true }));
  expect(refreshVoiceAgentPrompt).toHaveBeenCalledTimes(2);
  expect(refreshVoiceAgentPrompt).toHaveBeenNthCalledWith(2, 'rest-1', { syncGreeting: true });
});

it('PATCH reports partial success if KB sync throws after the database save', async () => {
  triggerKbSync.mockRejectedValueOnce(new Error('KB unavailable'));
  const res = mockRes();
  await handler({ method: 'PATCH', headers: { authorization: 'Bearer tok' }, body: { agent_greeting: 'Welcome!' } }, res);
  expect(res.status).not.toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    kb_synced: false, prompt_synced: true, greeting_synced: true,
  }));
});

it('PATCH still returns saved values when prompt refresh throws', async () => {
  refreshVoiceAgentPrompt.mockRejectedValueOnce(new Error('ElevenLabs unavailable'));
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_greeting: 'Buongiorno!' },
  }, res);
  expect(res.status).not.toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    kb_synced: true,
    prompt_synced: false,
    greeting_synced: false,
  }));
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
