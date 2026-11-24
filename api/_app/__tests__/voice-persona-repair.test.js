const mockConfig = { id: 'rest-1', restaurant_name: 'Bistro', agent_language: 'pt', voice_engine: 'elevenlabs', elevenlabs_agent_id: 'agent-1', agent_greeting: 'Old opening' };
const mockQuery = {
  select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
  single: jest.fn(async () => ({ data: { ...mockConfig }, error: null })),
  update: jest.fn(function (patch) { Object.assign(mockConfig, patch); return this; }),
  then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
};
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { schema: () => ({ from: () => mockQuery }) } }));
jest.mock('../_lib/auth', () => ({ verifyJWT: async () => ({ restaurant_id: 'rest-1' }), verifyAuth: async () => ({ user: { restaurant_id: 'rest-1' } }) }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/cors', () => ({ setInternalCors() {} }));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscriptionByRestaurantId: async () => ({ active: true, plan: 'growth' }),
  inlineRequireFeature: () => false,
  checkSubscription: async (_req, _res, next) => next(), requireFeature: () => (_req, _res, next) => next(),
}));
jest.mock('../_lib/kb-sync-trigger', () => ({ triggerKbSync: async () => ({ success: true }) }));
const savePersona = require('../voice-persona');
const repairPersona = require('../elevenlabs-voice-settings');
const envBefore = process.env.ELEVENLABS_API_KEY;
afterAll(() => { if (envBefore === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = envBefore; });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader() {} });

test('manual repair replays the saved opening after a failed provider save', async () => {
  process.env.ELEVENLABS_API_KEY = 'test-key';
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' }).mockResolvedValue({ ok: true });
  const save = response();
  await savePersona({ method: 'PATCH', headers: {}, body: { agent_greeting: 'Olá, aqui é a Sofia!' } }, save);
  expect(save.json).toHaveBeenCalledWith(expect.objectContaining({ agent_synced: false }));
  expect(mockConfig.agent_greeting).toBe('Olá, aqui é a Sofia!');
  const repair = response();
  await repairPersona({ method: 'POST', headers: {}, query: { action: 'refresh_prompt' } }, repair);
  expect(repair.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  const patch = JSON.parse(global.fetch.mock.calls[1][1].body);
  expect(patch.conversation_config.agent.first_message).toBe('Olá, aqui é a Sofia!');
  expect(patch.conversation_config.agent.prompt.prompt).toContain('Olá, aqui é a Sofia!');
});
