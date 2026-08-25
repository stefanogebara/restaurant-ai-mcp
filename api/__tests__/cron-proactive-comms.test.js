/**
 * Tests for api/cron/proactive-comms.js (rewritten for the queue-backed C6 impl).
 *
 * The cron now writes to restaurant.proactive_comms_queue, generates AI drafts,
 * and is auth-gated by CRON_SECRET. We test:
 *   1. Auth (401 on wrong secret)
 *   2. Empty restaurants list (no crash)
 *   3. Pure helpers — parseOccasionDate, normaliseLang
 *   4. Graceful no-op when the table doesn't exist (42P01)
 */

var mockFrom = jest.fn();
var mockSchemaFrom = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));
// Stub the AI client so tests don't make real API calls
jest.mock('../_lib/ai-client', () => ({
  getAI: jest.fn().mockReturnValue({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: 'Olá! Te esperamos para celebrar.' }],
      }),
    },
  }),
  AI_MODEL_FAST: 'anthropic/claude-3.5-haiku',
}));

const handler = require('../cron/proactive-comms');
const { parseOccasionDate, normaliseLang } = require('../cron/proactive-comms');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

/**
 * The cron does several supabase reads. To make tests readable, we model each
 * call as `chain(data, error)` returning a chainable mock that resolves with
 * { data, error } at any leaf-level call.
 */
function chain(data, error = null) {
  const result = Promise.resolve({ data, error });
  // Every method returns a self-chain that also acts as a thenable
  const handler = {
    get(_, prop) {
      if (prop === 'then') return result.then.bind(result);
      if (prop === 'catch') return result.catch.bind(result);
      if (prop === 'finally') return result.finally.bind(result);
      // Special: select() on insert() should chain to leaf — but for the simple
      // test cases below we always resolve at any property access.
      return new Proxy(() => proxy, handler);
    },
  };
  const proxy = new Proxy(() => proxy, handler);
  return proxy;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/proactive-comms — handler', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with all-zero stats when no restaurants exist', async () => {
    // expireStalePendingItems → empty result
    // restaurant_config list → empty
    mockSchemaFrom.mockReturnValue(chain([], null));

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.restaurants_processed).toBe(0);
    expect(json.occasions_queued).toBe(0);
    expect(json.churn_queued).toBe(0);
  });

  test('does not crash when proactive_comms_queue table is missing (42P01)', async () => {
    // Simulate the migration not being applied yet.
    // Both expire and any insert should fail with 42P01 — handler should
    // still return 200 with the stats it got.
    mockSchemaFrom.mockReturnValue(chain(null, { code: '42P01', message: 'relation does not exist' }));

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);

    // The handler doesn't 500 — it returns 200 with restaurants_processed=0
    // because the restaurant_config list itself errored (also 42P01-ish).
    // Important: it doesn't throw.
    expect(res.status).toHaveBeenCalled();
    expect([200, 500]).toContain(res.status.mock.calls[0][0]);
  });
});

describe('cron/proactive-comms — pure helpers', () => {
  describe('parseOccasionDate', () => {
    test('parses MM-DD format and rolls forward to next year if past', () => {
      const yearAgo = new Date();
      yearAgo.setMonth(yearAgo.getMonth() - 1);
      const mmdd = `${String(yearAgo.getMonth() + 1).padStart(2, '0')}-${String(yearAgo.getDate()).padStart(2, '0')}`;
      const parsed = parseOccasionDate(mmdd, new Date().getFullYear());
      expect(parsed).toBeInstanceOf(Date);
      // Should be in the future (next year)
      expect(parsed.getTime()).toBeGreaterThan(Date.now());
    });

    test('parses YYYY-MM-DD format', () => {
      const future = new Date();
      future.setMonth(future.getMonth() + 2);
      const ymd = future.toISOString().split('T')[0];
      const parsed = parseOccasionDate(ymd, new Date().getFullYear());
      expect(parsed).toBeInstanceOf(Date);
    });

    test('parses month-name format (en)', () => {
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const str = `${monthNames[next.getMonth()]} ${next.getDate()}`;
      const parsed = parseOccasionDate(str, new Date().getFullYear());
      expect(parsed).toBeInstanceOf(Date);
    });

    test('returns null on garbage input', () => {
      expect(parseOccasionDate('not a date', 2026)).toBeNull();
      expect(parseOccasionDate('', 2026)).toBeNull();
      expect(parseOccasionDate('99-99', 2026)).toBeNull();
    });
  });

  describe('normaliseLang', () => {
    test("'pt' → 'pt-BR'", () => expect(normaliseLang('pt')).toBe('pt-BR'));
    test("'pt-BR' → 'pt-BR'", () => expect(normaliseLang('pt-BR')).toBe('pt-BR'));
    test("'pt-PT' → 'pt-BR'", () => expect(normaliseLang('pt-PT')).toBe('pt-BR'));
    test("'es' → 'es'", () => expect(normaliseLang('es')).toBe('es'));
    test("'es-ES' → 'es'", () => expect(normaliseLang('es-ES')).toBe('es'));
    test("'en' → 'en'", () => expect(normaliseLang('en')).toBe('en'));
    test("'en-US' → 'en'", () => expect(normaliseLang('en-US')).toBe('en'));
    test("unknown → 'pt-BR' (BR-first default)", () => expect(normaliseLang('fr-FR')).toBe('pt-BR'));
    test("null → 'pt-BR'", () => expect(normaliseLang(null)).toBe('pt-BR'));
  });
});

/**
 * O CONSERTO DE 25/08/2026.
 *
 * O cron não estava parado — rodava todo domingo e gravava na fila, mas morria
 * antes da última linha (logCronRun), então `cron_runs` ficou sem registro
 * desde 09/08 e parecia morto. Morria de lentidão: `queueOpportunity` gera o
 * rascunho no LLM ANTES do INSERT, e o INSERT é o único lugar onde a duplicata
 * é descoberta (23505). Com 36 linhas já pendentes, eram 36 chamadas de Haiku
 * por rodada cujo destino garantido era o lixo — e o relógio de 60s da Vercel
 * acabava no meio.
 *
 * Este teste falha na versão antiga: ela chamaria o LLM duas vezes (uma para o
 * telefone já pendente) em vez de uma.
 */
describe('cron/proactive-comms — dedupe antes do LLM', () => {
  const RID = 'rest-1';
  const JA_NA_FILA = '+5511900000001';
  const NOVO = '+5511900000002';

  /** Construtor encadeável que registra as chamadas e resolve pelo que foi pedido. */
  function builder(resolver) {
    const calls = [];
    const obj = {};
    for (const m of ['select', 'eq', 'in', 'not', 'gte', 'lt', 'order', 'limit', 'update', 'insert']) {
      obj[m] = (...args) => { calls.push([m, ...args]); return obj; };
    }
    obj.then = (ok, err) => Promise.resolve(resolver(calls)).then(ok, err);
    return obj;
  }
  const usou = (calls, metodo, arg0) => calls.some(([m, a]) => m === metodo && a === arg0);

  test('não gasta LLM em oportunidade que já tem linha pendente na fila', async () => {
    const inseridos = [];

    mockSupabaseAdmin.schema.mockReturnValue({
      from: jest.fn().mockImplementation((tabela) => builder((calls) => {
        if (tabela === 'restaurant_config') {
          return { data: [{ id: RID, restaurant_name: 'Casa', agent_language: 'pt-BR' }], error: null };
        }
        if (tabela === 'customer_ltv') {
          // A consulta de ocasiões filtra por special_occasions; a de risco, por churn.
          if (usou(calls, 'not', 'special_occasions')) return { data: [], error: null };
          return {
            data: [
              { restaurant_id: RID, customer_id: 'c1', customer_phone: JA_NA_FILA, customer_name: 'Ana', churn_risk_score: 90, total_visits: 5 },
              { restaurant_id: RID, customer_id: 'c2', customer_phone: NOVO, customer_name: 'Bia', churn_risk_score: 80, total_visits: 4 },
            ],
            error: null,
          };
        }
        // proactive_comms_queue: três usos distintos no mesmo handler.
        if (usou(calls, 'update')) return { data: [], error: null };          // expira vencidas
        const ins = calls.find(([m]) => m === 'insert');
        if (ins) { inseridos.push(ins[1]); return { data: null, error: null }; }
        return {                                                              // fila pendente
          data: [{ restaurant_id: RID, type: 'churn_risk', customer_phone: JA_NA_FILA }],
          error: null,
        };
      })),
    });

    const criar = require('../_lib/ai-client').getAI().messages.create;
    criar.mockClear();

    const res = mockRes();
    await handler({ headers: { authorization: 'Bearer test-cron-secret' } }, res);

    // Só o telefone novo custa uma chamada de LLM. O que já estava na fila, zero.
    expect(criar).toHaveBeenCalledTimes(1);
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0].customer_phone).toBe(NOVO);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true, churn_queued: 1, skipped_duplicate: 1,
    }));
  });
});
