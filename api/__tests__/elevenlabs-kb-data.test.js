let mockMenuError;
let mockFactsError;
const mockReads = [];
const mockConfig = { restaurant_name: 'Bistro', elevenlabs_agent_id: 'agent-1', agent_greeting: 'Olá!' };
function mockQuery(table) {
  const filters = [];
  const chain = {
    select() { return chain; }, eq(key, value) { filters.push([key, value]); return chain; },
    order() { return chain; }, limit() { return chain; }, update() { return chain; },
    single() { return result(); }, maybeSingle() { return result(); }, then(resolve, reject) { return result().then(resolve, reject); },
  };
  async function result() {
    mockReads.push({ table, filters });
    if (table === 'restaurant_config') return { data: mockConfig, error: null };
    if (table === 'manager_memory') return { data: [{ content: 'Outdoor tables available' }], error: mockFactsError };
    if (table === 'pos_menu_items') return { data: [{ name: 'Moqueca da casa', category: 'Main', price_cents: 4200 }], error: mockMenuError };
    throw new Error(`Unexpected table ${table}`);
  }
  return chain;
}
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { schema: () => ({ from: mockQuery }), from: mockQuery } }));
jest.mock('../_lib/auth', () => ({ verifyJWT: async () => ({ sub: 'owner' }), getRestaurantIdForUser: async () => ({ restaurantId: 'rest-1' }) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/cors', () => ({ setInternalCors() {}, handlePreflight: () => false }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
const { syncKnowledgeBase } = require('../_services/elevenlabsAgentService');
const manualSync = require('../elevenlabs-kb-sync');
const envBefore = process.env.ELEVENLABS_API_KEY;
afterAll(() => { if (envBefore === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = envBefore; });
beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'test-key'; mockMenuError = null; mockFactsError = null; mockReads.length = 0;
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => ({ id: 'new-doc' }) }));
});
const uploadedText = () => JSON.parse(global.fetch.mock.calls.find(([url]) => url.endsWith('/knowledge-base/text'))[1].body).text;

test('persona-triggered service sync preserves the same menu and facts as manual sync', async () => {
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader() {} };
  await manualSync({ method: 'POST', headers: { authorization: 'Bearer test' }, body: { restaurant_id: 'untrusted-other-tenant' } }, res);
  const before = uploadedText();
  global.fetch.mockClear(); mockReads.length = 0;
  expect(await syncKnowledgeBase('rest-1')).toMatchObject({ success: true });
  expect(uploadedText()).toBe(before);
  expect(uploadedText()).toContain('Moqueca da casa');
  expect(uploadedText()).toContain('Outdoor tables available');
  expect(uploadedText()).toContain('Olá!');
  expect(mockReads).toContainEqual({ table: 'pos_menu_items', filters: [['restaurant_id', 'rest-1'], ['is_available', true]] });
  expect(mockReads).toContainEqual({ table: 'restaurant_config', filters: [['id', 'rest-1']] });
  expect(mockReads.filter(read => read.table === 'manager_memory').every(read => read.filters.some(([key, value]) => key === 'restaurant_id' && value === 'rest-1'))).toBe(true);
});

test('a menu read error cannot replace the current knowledge base with an incomplete document', async () => {
  mockMenuError = { message: 'menu unavailable' };
  expect(await syncKnowledgeBase('rest-1')).toMatchObject({ success: false });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('manual sync also leaves the provider untouched when the menu cannot be read', async () => {
  mockMenuError = { message: 'menu unavailable' };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader() {} };
  await manualSync({ method: 'POST', headers: { authorization: 'Bearer test' } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a facts read error cannot silently erase previously synced knowledge', async () => {
  mockFactsError = { message: 'facts unavailable' };
  expect(await syncKnowledgeBase('rest-1')).toMatchObject({ success: false });
  expect(global.fetch).not.toHaveBeenCalled();
});
