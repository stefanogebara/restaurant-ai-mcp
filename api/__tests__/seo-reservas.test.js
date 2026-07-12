/**
 * Tests for api/seo/reservas.js — the buyer-intent PT-BR landing page.
 *
 * Pins the load-bearing contracts:
 *  - valid matrix combos NEVER 404 (the legacy page's fatal flaw);
 *  - unknown combos 404 in PT-BR;
 *  - cache hit short-circuits generation;
 *  - market stats and customer proof only render when the data supports them
 *    (no false "restaurants use Seatable" claims from prospect data);
 *  - JSON-LD ships server-side; cache upsert uses the matrix cacheKey;
 *  - AI failure falls back to static PT-BR copy (page still 200).
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockCreate = jest.fn();
jest.mock('../_lib/ai-client', () => ({
  getAI: () => ({ messages: { create: mockCreate } }),
  AI_MODEL_FAST: 'claude-haiku-test',
}));

// --- chainable supabase mock -------------------------------------------------
// Behavior is driven by module-level state set per test.
const mockState = {
  cacheResult: { data: null, error: { code: 'PGRST116' } }, // default: miss
  prospectCounts: [], // shift()ed per prospect_leads query, in creation order
  customerCount: 0,
  upsertCalls: [],
};

function mockThenable(result) {
  const chain = {};
  const methods = ['select', 'eq', 'ilike', 'not', 'gte', 'or', 'in'];
  for (const m of methods) chain[m] = () => chain;
  chain.single = () => Promise.resolve(mockState.cacheResult);
  chain.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
  return chain;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (table) => {
      if (table === 'seo_page_cache') {
        const chain = mockThenable(() => ({ error: null }));
        chain.upsert = (row) => {
          mockState.upsertCalls.push(row);
          return Promise.resolve({ error: null });
        };
        return chain;
      }
      if (table === 'prospect_leads') {
        const count = mockState.prospectCounts.length ? mockState.prospectCounts.shift() : 0;
        return mockThenable(() => ({ count, error: null }));
      }
      return mockThenable(() => ({ count: 0, error: null }));
    },
    schema: () => ({
      from: () => mockThenable(() => ({ count: mockState.customerCount, error: null })),
    }),
  },
}));

const handler = require('../seo/reservas');

function mkRes() {
  const res = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.cacheResult = { data: null, error: { code: 'PGRST116' } };
  mockState.prospectCounts = [];
  mockState.customerCount = 0;
  mockState.upsertCalls = [];
  mockCreate.mockResolvedValue({ content: [{ text: '<p>um</p><p>dois</p><p>três</p>' }] });
});

describe('routing / validation', () => {
  test('unknown combo returns PT-BR 404 without generating', async () => {
    const res = mkRes();
    await handler({ method: 'GET', query: { city: 'gotham', cuisine: 'japones' } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Página não encontrada');
    expect(res.body).toContain('lang="pt-BR"');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('non-GET is rejected', async () => {
    const res = mkRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  test('valid matrix combo with zero customers and zero leads still renders 200', async () => {
    mockState.prospectCounts = [0, 0, 0];
    const res = mkRes();
    await handler({ method: 'GET', query: { city: 'belem', cuisine: 'cafe' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('cafés em Belém');
  });
});

describe('cache behavior', () => {
  test('cache hit returns stored HTML and skips the LLM', async () => {
    mockState.cacheResult = { data: { html: '<html>CACHED-PAGE</html>' }, error: null };
    const res = mkRes();
    await handler({ method: 'GET', query: { city: 'sao-paulo', cuisine: 'japones' } }, res);
    expect(res.body).toBe('<html>CACHED-PAGE</html>');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockState.upsertCalls).toHaveLength(0);
  });

  test('generation upserts with the matrix cacheKey', async () => {
    mockState.prospectCounts = [0, 0, 0];
    const res = mkRes();
    await handler({ method: 'GET', query: { city: 'curitiba', cuisine: 'pizzaria' } }, res);
    expect(mockState.upsertCalls).toHaveLength(1);
    expect(mockState.upsertCalls[0].cache_key).toBe('reservas:curitiba:pizzaria');
    expect(mockState.upsertCalls[0].html).toContain('pizzarias em Curitiba');
  });
});

describe('generated page content', () => {
  test('full page: H1, JSON-LD server-side, canonical, market stats and honest proof', async () => {
    mockState.prospectCounts = [4634, 2686, 2000];
    mockState.customerCount = 17;
    const res = mkRes();
    await handler({ method: 'GET', query: { city: 'sao-paulo', cuisine: 'japones' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('restaurantes japoneses em São Paulo');
    expect(res.body).toContain('application/ld+json');
    expect(res.body).toContain('FAQPage');
    expect(res.body).toContain('BreadcrumbList');
    expect(res.body).toContain('/sistema-de-reservas/sao-paulo/japones');
    // Market block: real prospect aggregates, pt-BR formatted
    expect(res.body).toContain('4.634 restaurantes');
    // Honest social proof — customers exist here
    expect(res.body).toContain('17 restaurantes em São Paulo');
    // LLM copy made it in
    expect(res.body).toContain('<p>um</p>');
  });

  test('no market block below the 50-lead threshold; no proof below 3 customers', async () => {
    mockState.prospectCounts = [10, 5, 4];
    mockState.customerCount = 2;
    const res = mkRes();
    await handler({ method: 'GET', query: { city: 'recife', cuisine: 'bar' } }, res);
    expect(res.body).not.toContain('em números');
    expect(res.body).not.toContain('já recebem reservas pela Seatable');
  });

  test('AI failure falls back to static PT-BR copy and still returns 200', async () => {
    mockState.prospectCounts = [0, 0, 0];
    mockCreate.mockRejectedValue(new Error('boom'));
    const res = mkRes();
    await handler({ method: 'GET', query: { city: 'santos', cuisine: 'italiano' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('atendente de IA');
    expect(res.body).toContain('restaurantes italianos em Santos');
  });
});
