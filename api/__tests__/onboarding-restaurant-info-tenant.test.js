'use strict';

/**
 * O onboarding não pode adotar nem destruir a linha de restaurant_info de outro
 * dono.
 *
 * BUG REAL, exercitado em produção em 02/08/2026:
 *   1. A busca era `.select('id').limit(1).single()` — SEM FILTRO. Pegava a
 *      primeira linha da tabela, de quem quer que fosse, e o passo seguinte a
 *      SOBRESCREVIA com os dados de quem estava entrando. Era por isso que
 *      restaurant_info tinha UMA linha para 37 restaurantes.
 *   2. Quando o insert de restaurant_config falhava, o rollback apagava essa
 *      linha adotada e as mesas dela.
 * Juntos: um cadastro que falhasse destruía o registro de outro. Aconteceu — o
 * trial de fevereiro do fundador foi apagado por um teste que falhou no passo 3.
 *
 * Os testes abaixo cobrem os dois lados: não adotar, e não apagar o que não
 * criou.
 */

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
jest.mock('../_lib/auth', () => ({
  verifyAuth: async () => ({ user: { sub: '00000000-0000-4000-8000-000000000abc', email: 'dono@teste.com' } }),
}));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/cors', () => ({ setInternalCors: () => {} }));
jest.mock('../_services/elevenlabsAgentService', () => ({
  createAgent: async () => ({ success: true, agentId: 'agent_x' }),
  syncKnowledgeBase: async () => ({ success: true }),
}));

/**
 * Estado do banco falso. `infoExistente` decide se a busca acha linha; o
 * registro de operações é o que os testes inspecionam.
 */
const mockDb = { infoExistente: null, configInsertFalha: false, ops: [] };

jest.mock('../_lib/supabase', () => {
  function construir(schema) {
    let tabela = null;
    const ctx = { op: null, filtros: {} };
    const chain = {
      schema: (s) => construir(s),
      from: (t) => { tabela = t; return chain; },
      select: () => chain,
      insert: (p) => { ctx.op = 'insert'; ctx.payload = p; return chain; },
      update: (p) => { ctx.op = 'update'; ctx.payload = p; return chain; },
      upsert: (p) => { ctx.op = 'upsert'; ctx.payload = p; return chain; },
      delete: () => { ctx.op = 'delete'; return chain; },
      eq: (col, val) => { ctx.filtros[col] = val; return chain; },
      neq: () => chain, in: () => chain, is: () => chain, not: () => chain,
      order: () => chain, limit: () => chain, gte: () => chain, lt: () => chain,
      single: () => finalizar(true),
      maybeSingle: () => finalizar(false),
      then: (resolve, reject) => finalizar(null).then(resolve, reject),
    };
    function finalizar(exigeLinha) {
      mockDb.ops.push({ schema, tabela, op: ctx.op || 'select', filtros: { ...ctx.filtros } });
      let r = { data: null, error: null };
      if (tabela === 'restaurant_info') {
        if (ctx.op === 'update' || ctx.op === 'insert') r = { data: { id: 'info-1' }, error: null };
        else if (!ctx.op || ctx.op === 'select') {
          r = mockDb.infoExistente
            ? { data: { id: mockDb.infoExistente }, error: null }
            : { data: null, error: exigeLinha ? { code: 'PGRST116' } : null };
        }
      } else if (tabela === 'restaurant_config') {
        if (ctx.op === 'insert') {
          r = mockDb.configInsertFalha
            ? { data: null, error: { code: '22P02', message: 'boom' } }
            : { data: { id: 'config-1' }, error: null };
        } else r = { data: null, error: null };
      } else if (tabela === 'tables' && ctx.op === 'insert') {
        r = { data: [{ id: 't1' }], error: null };
      }
      return Promise.resolve(r);
    }
    return chain;
  }
  return { supabaseAdmin: construir(null) };
});

const handler = require('../onboarding/complete');

const DIAS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const corpo = () => ({
  customer_email: 'dono@teste.com',
  email: 'dono@teste.com',
  restaurant_name: 'Cantina Teste',
  phone_number: '+5511999990000',
  restaurant_type: 'casual-dining',
  city: 'São Paulo',
  country: 'BR',
  business_hours: DIAS.map((day) => ({ day, is_open: true, open_time: '12:00', close_time: '23:00' })),
  // Sem `areas` o handler estoura em `areas.map` no passo 3 e cai no catch
  // EXTERNO — e aí o teste passa sem nunca exercitar o rollback do config, que
  // é justamente o que se quer provar. Aconteceu comigo aqui.
  areas: [{ name: 'Salão', tables: [{ table_number: '1', capacity: 4 }] }],
  plan: 'Starter',
});

function resposta() {
  const r = { code: null, corpo: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  r.end = () => r; r.setHeader = () => r;
  return r;
}
const pedido = () => ({ method: 'POST', headers: { authorization: 'Bearer x' }, body: corpo(), query: {} });

const buscasInfo = () => mockDb.ops.filter((o) => o.tabela === 'restaurant_info' && o.op === 'select');
const deletesInfo = () => mockDb.ops.filter((o) => o.tabela === 'restaurant_info' && o.op === 'delete');

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.ops = [];
  mockDb.infoExistente = null;
  mockDb.configInsertFalha = false;
  process.env.CRON_SECRET = 'x';
});

describe('não encostar em restaurant_info', () => {
  // A garantia ficou MAIS FORTE que a original. A primeira correção (01/08) fez
  // a busca filtrar por e-mail, para não adotar linha de terceiro. A
  // aposentadoria da tabela (02/08) tornou a busca desnecessária: o id do
  // restaurante é gerado no próprio request. Sem consulta, sem adoção, sem a
  // classe de bug inteira.
  test('nenhuma operação em restaurant_info, de nenhum tipo', async () => {
    await handler(pedido(), resposta());
    const tocou = mockDb.ops.filter((o) => o.tabela === 'restaurant_info');
    expect(tocou).toEqual([]);
  });

  test('mesas, config e registry compartilham o MESMO id', async () => {
    // O antigo passo 3b existia porque as mesas nasciam com o id do
    // restaurant_info e precisavam ser realinhadas ao do config. Agora nascem
    // certas; este teste é o que garante que o realinhamento não faz falta.
    await handler(pedido(), resposta());
    const idDasMesas = mockDb.ops.find((o) => o.tabela === 'tables' && o.op === 'delete')?.filtros?.restaurant_id;
    expect(idDasMesas).toBeTruthy();
    expect(idDasMesas).toMatch(/^[0-9a-f-]{36}$/i); // uuid gerado, não emprestado
  });
});

describe('rollback não apaga o que não criou', () => {
  test('linha PREEXISTENTE do mesmo dono sobrevive à falha do config', async () => {
    mockDb.infoExistente = 'info-de-alguem';
    mockDb.configInsertFalha = true;

    const res = resposta();
    await handler(pedido(), res);

    expect(res.code).toBe(500);
    expect(deletesInfo()).toHaveLength(0); // <<< o dano de 02/08 não se repete
  });

  test('na falha do config, apaga as MESAS e nada de restaurant_info', async () => {
    mockDb.configInsertFalha = true;

    const res = resposta();
    await handler(pedido(), res);

    // Diagnóstico embutido: se falhar, quero ver ONDE parou, não adivinhar.
    const trilha = mockDb.ops.map((o) => `${o.tabela}.${o.op}`).join(' > ');
    const erros = mockLogger.error.mock.calls.map(
      (c) => `${c[0]} :: ${c[1]?.message || c[1]?.stack || JSON.stringify(c[1])}`.slice(0, 260)
    );
    const mesasApagadas = mockDb.ops.filter((o) => o.tabela === 'tables' && o.op === 'delete');
    expect([res.code, res.corpo?.error, deletesInfo().length, mesasApagadas.length >= 1, trilha, erros])
      .toEqual([500, 'restaurant_config_insert_failed', 0, true, trilha, erros]);
  });

  test('as mesas são apagadas nos dois casos — essas são sempre nossas', async () => {
    mockDb.infoExistente = 'info-de-alguem';
    mockDb.configInsertFalha = true;
    await handler(pedido(), resposta());
    expect(mockDb.ops.some((o) => o.tabela === 'tables' && o.op === 'delete')).toBe(true);
  });
});
