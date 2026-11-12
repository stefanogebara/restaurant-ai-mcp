'use strict';

// The language screen promises the choice reaches "all customer
// communications and AI interactions", but the voice agent at ElevenLabs never
// followed a database change (Osteria del Sole stayed in English). A language
// change in settings now replays to the restaurant's own agent.

let mockConfig;
let mockUpdateResult;
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => {
        const chain = {
          select: () => chain, eq: () => chain,
          update: () => chain,
          single: async () => mockUpdateResult,
          maybeSingle: async () => ({ data: mockConfig, error: null }),
        };
        return chain;
      },
    }),
  },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn(async () => ({ user: { restaurant_id: 'r-1' } })) }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn(async () => false) }));
jest.mock('../_lib/kb-sync-trigger', () => ({ triggerKbSync: jest.fn(async () => ({ success: true })) }));
const mockSync = jest.fn();
jest.mock('../_lib/elevenlabs-language-sync', () => ({ syncAgentLanguage: (...a) => mockSync(...a), CONFIG_COLUMNS: 'id, agent_language' }));

const handler = require('../restaurant-settings');

async function put(body) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {} };
  await handler({ method: 'PUT', url: '/api/restaurant-settings', query: {}, body, headers: { authorization: 'Bearer t' } }, res);
  return res;
}

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'el-key';
  mockConfig = { id: 'r-1', agent_language: 'pt-BR', elevenlabs_agent_id: 'agent_osteria_0001' };
  mockUpdateResult = { data: { agent_language: 'pt-BR', restaurant_name: 'Osteria' }, error: null };
  mockSync.mockReset().mockResolvedValue({ changed: true });
});
afterAll(() => { delete process.env.ELEVENLABS_API_KEY; });

test('a language change syncs the restaurant agent with the saved config', async () => {
  const res = await put({ language: 'pt-BR' });
  expect(res.statusCode).toBe(200);
  expect(mockSync).toHaveBeenCalledWith(mockConfig, 'el-key');
  expect(res.body.agent_language_synced).toBe(true);
});

test('a failed agent sync keeps the saved setting and reports it', async () => {
  mockSync.mockRejectedValueOnce(new Error('PATCH agent 500'));
  const res = await put({ language: 'pt-BR' });
  expect(res.statusCode).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.agent_language_synced).toBe(false);
});

test('no agent, no key, or no language change means no provider call', async () => {
  mockConfig = { ...mockConfig, elevenlabs_agent_id: null };
  expect((await put({ language: 'pt-BR' })).body.agent_language_synced).toBeNull();
  mockConfig = { ...mockConfig, elevenlabs_agent_id: 'agent_osteria_0001' };
  expect((await put({ restaurant_name: 'Osteria Nova' })).body.agent_language_synced).toBeNull();
  delete process.env.ELEVENLABS_API_KEY;
  expect((await put({ language: 'pt-BR' })).body.agent_language_synced).toBeNull();
  expect(mockSync).not.toHaveBeenCalled();
});
