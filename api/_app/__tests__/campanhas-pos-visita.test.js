'use strict';

/**
 * As campanhas pós-visita nunca enviaram nada.
 *
 * `processPostVisitThankYou` e `processReviewRequest` liam `service_records`
 * pedindo `customer_email` e `completed_at` — NENHUMA das duas existe naquela
 * tabela. Em PostgREST uma coluna inexistente derruba o select inteiro, e o
 * chamador nem desestruturava o `error`:
 *
 *     const { data: records } = await supabaseAdmin...
 *     for (const record of records || []) { ... }
 *
 * `records` vinha null, o laço rodava zero vezes, a função devolvia 0
 * enviados, e o cron registrava sucesso. O agradecimento pós-visita e o pedido
 * de avaliação no Google nunca saíram.
 *
 * Confirmado contra produção: `service_records` tem 656 linhas, 653
 * `completed`, e as 653 têm `actual_departure` — que é o "completed_at" que o
 * código queria. O e-mail vive em `customer_ltv` (cobertura de 70%).
 */

const mockConsultas = [];
let mockLinhas = [];
let mockErro = null;

var mockSupabaseAdmin = {
  schema: () => mockSupabaseAdmin,
  from(tabela) {
    const q = { tabela, filtros: {} };
    q.select = (cols) => { mockConsultas.push({ tabela, cols }); return q; };
    q.eq = (c, v) => { q.filtros[c] = v; return q; };
    q.in = (c, v) => { q.filtros[c] = v; return Promise.resolve({ data: mockLinhas, error: mockErro }); };
    return q;
  },
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const { buscarEmailsPorTelefone } = require('../_services/automatedCampaignService');

beforeEach(() => { mockConsultas.length = 0; mockLinhas = []; mockErro = null; });

describe('buscarEmailsPorTelefone', () => {
  test('resolve o e-mail que service_records não tem', async () => {
    mockLinhas = [
      { customer_phone: '+5511111', customer_email: 'a@x.com' },
      { customer_phone: '+5511222', customer_email: 'b@x.com' },
    ];
    const m = await buscarEmailsPorTelefone('r1', ['+5511111', '+5511222']);
    expect(m.get('+5511111')).toBe('a@x.com');
    expect(m.get('+5511222')).toBe('b@x.com');
  });

  // Uma consulta para a leva inteira, não uma por cliente: o laço processa até
  // 100 registros, e 100 idas ao banco por campanha derrubariam a lambda.
  test('faz UMA consulta em lote, não uma por telefone', async () => {
    mockLinhas = [];
    await buscarEmailsPorTelefone('r1', ['+1', '+2', '+3', '+4', '+5']);
    expect(mockConsultas).toHaveLength(1);
  });

  test('telefone repetido não vira consulta maior', async () => {
    await buscarEmailsPorTelefone('r1', ['+1', '+1', '+1']);
    expect(mockConsultas).toHaveLength(1);
  });

  // 30% dos clientes não têm e-mail no customer_ltv. Eles simplesmente não
  // recebem — que já era a intenção do código original.
  test('cliente sem e-mail fica de fora do mapa, sem quebrar', async () => {
    mockLinhas = [
      { customer_phone: '+1', customer_email: 'a@x.com' },
      { customer_phone: '+2', customer_email: null },
    ];
    const m = await buscarEmailsPorTelefone('r1', ['+1', '+2']);
    expect(m.get('+1')).toBe('a@x.com');
    expect(m.has('+2')).toBe(false);
  });

  test('sem telefone nenhum, não consulta o banco', async () => {
    const m = await buscarEmailsPorTelefone('r1', []);
    expect(m.size).toBe(0);
    expect(mockConsultas).toEqual([]);
  });

  test.each([[null], [undefined], [[null, undefined, '']]])('entrada %p não derruba', async (v) => {
    await expect(buscarEmailsPorTelefone('r1', v)).resolves.toBeInstanceOf(Map);
  });

  // O erro que era descartado é o que deixou a campanha morta em silêncio.
  test('erro do banco devolve mapa vazio, não explode a campanha', async () => {
    mockErro = { message: 'boom' };
    const m = await buscarEmailsPorTelefone('r1', ['+1']);
    expect(m.size).toBe(0);
  });

  test('lê de customer_ltv, a tabela viva — não de customer_history', async () => {
    await buscarEmailsPorTelefone('r1', ['+1']);
    expect(mockConsultas[0].tabela).toBe('customer_ltv');
  });
});
