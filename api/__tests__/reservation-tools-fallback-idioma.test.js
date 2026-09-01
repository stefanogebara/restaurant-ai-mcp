'use strict';

/**
 * O fallback de restaurante pedia colunas que não existem.
 *
 * `resolveSessionRestaurant` tem três caminhos: a sessão já traz o restaurante,
 * o registry resolve, ou — último recurso — sintetiza a partir de
 * `restaurant.restaurant_config`. Esse terceiro fazia:
 *
 *     .select('id, restaurant_name, restaurant_slug, agent_language, language')
 *
 * `restaurant_slug` e `language` NÃO EXISTEM nessa tabela (as reais são `slug`
 * e `agent_language`). O Postgres devolve 42703, o cliente do Supabase põe isso
 * em `error` e deixa `data` null SEM LANÇAR — então o `catch` nem roda, o
 * `if (data)` é falso, e a função devolvia null em 100% das vezes.
 *
 * Quem chama recebe o stub `{ id }`, e aí `restaurante?.language` é undefined.
 * No `handoff_to_human` (set/2026) isso vira `|| 'en'`: o aviso de "já chamei
 * alguém" sai em INGLÊS para o cliente de um restaurante brasileiro, no
 * momento em que ele já está insatisfeito o bastante para pedir um humano.
 *
 * Confirmado contra o banco de produção: `select language from
 * restaurant.restaurant_config` → ERROR 42703.
 */

const mockSelects = [];
let mockLinha = null;
let mockErro = null;

var mockSupabaseAdmin = {
  schema: () => ({
    from: () => {
      const q = {
        select(cols) { mockSelects.push(cols); return q; },
        eq() { return q; },
        single() { return Promise.resolve({ data: mockLinha, error: mockErro }); },
      };
      return q;
    },
  }),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/restaurant-registry', () => ({
  getAllActiveRestaurants: jest.fn().mockResolvedValue([]),
}));

const { resolveSessionRestaurant } = require('../_services/whatsapp/reservation-tools');

beforeEach(() => {
  mockSelects.length = 0;
  mockLinha = null;
  mockErro = null;
});

describe('resolveSessionRestaurant — o fallback de restaurant_config', () => {
  // A causa raiz: colunas que não existem no schema.
  test('NÃO pede colunas inexistentes (restaurant_slug, language)', async () => {
    mockLinha = { id: 'r1', restaurant_name: 'Mocotó', slug: 'mocoto', agent_language: 'pt' };
    await resolveSessionRestaurant({ restaurant_id: 'r1' });

    const cols = mockSelects.join(' ');
    expect(cols).not.toMatch(/restaurant_slug/);
    expect(cols).not.toMatch(/\blanguage\b/);
    // e pede as que existem
    expect(cols).toMatch(/\bslug\b/);
    expect(cols).toMatch(/agent_language/);
  });

  test('devolve o idioma real do restaurante, não um padrão', async () => {
    mockLinha = { id: 'r1', restaurant_name: 'Mocotó', slug: 'mocoto', agent_language: 'pt' };
    const r = await resolveSessionRestaurant({ restaurant_id: 'r1' });
    expect(r).toMatchObject({ id: 'r1', restaurant_name: 'Mocotó', restaurant_slug: 'mocoto', language: 'pt' });
  });

  test('idioma ausente cai em pt, o mercado principal — nunca en', async () => {
    mockLinha = { id: 'r1', restaurant_name: 'X', slug: 'x', agent_language: null };
    const r = await resolveSessionRestaurant({ restaurant_id: 'r1' });
    expect(r.language).toBe('pt');
  });

  // O bug atravessou a revisão porque o erro era descartado. Agora ele é lido.
  test('erro do banco não vira null silencioso — o motivo é registrado', async () => {
    mockErro = { message: 'column "language" does not exist' };
    const r = await resolveSessionRestaurant({ restaurant_id: 'r1' });
    expect(r).toBeNull();
    // O importante é que o caminho de erro seja DISTINTO do "não achou".
    expect(mockSelects.length).toBeGreaterThan(0);
  });

  test('sem restaurant_id não consulta nada', async () => {
    expect(await resolveSessionRestaurant({})).toBeNull();
    expect(mockSelects).toEqual([]);
  });

  test('sessão que já traz o restaurante não consulta o banco', async () => {
    const pronto = { id: 'r1', language: 'es' };
    expect(await resolveSessionRestaurant({ restaurant: pronto })).toBe(pronto);
    expect(mockSelects).toEqual([]);
  });
});
