'use strict';

/**
 * CAMPANHA — uma lista de leads escolhida à mão (o piloto do Racha), com os
 * templates DELA.
 *
 * Os invariantes que estes testes protegem, porque cada um manda (ou não)
 * mensagem pra gente de verdade:
 *  1. o fluxo normal (sem campanha) NUNCA pega lead de campanha — o cron não
 *     pode mandar a intro genérica pra quem está numa lista à parte;
 *  2. a campanha pega SÓ os leads dela, sem o piso de avaliações/nota (a
 *     lista foi escolhida à mão; o piso descartaria o bar pequeno);
 *  3. rótulo inválido vira o fluxo normal, nunca "todos";
 *  4. a intro da campanha NÃO tem reserva: sem template dela ativo, nada sai;
 *  5. nos toques seguintes, sem template próprio, cai no do fluxo normal.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

function criarQueryEspia(resultado) {
  const filtros = [];
  const q = {
    filtros,
    select: () => q,
    eq: (col, val) => { filtros.push({ op: 'eq', col, val }); return q; },
    is: (col, val) => { filtros.push({ op: 'is', col, val }); return q; },
    not: () => q,
    in: () => q,
    or: () => q,
    gte: (col, val) => { filtros.push({ op: 'gte', col, val }); return q; },
    lte: (col, val) => { filtros.push({ op: 'lte', col, val }); return q; },
    order: () => q,
    limit: async () => resultado,
  };
  return q;
}

let mockQuery;
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: () => mockQuery },
}));

describe('selectIntroCandidates com e sem campanha', () => {
  const { selectIntroCandidates, normalizarCampanha } = require('../_lib/prospecting/prospect-store');
  beforeEach(() => { mockQuery = criarQueryEspia({ data: [], error: null }); });

  test('sem campanha: só leads SEM campanha, com o piso de avaliações e nota', async () => {
    await selectIntroCandidates(10);
    expect(mockQuery.filtros).toContainEqual({ op: 'is', col: 'campanha', val: null });
    const cols = mockQuery.filtros.map((f) => f.col);
    expect(cols).toEqual(expect.arrayContaining(['reviews_count', 'rating']));
    expect(mockQuery.filtros.some((f) => f.op === 'eq' && f.col === 'campanha')).toBe(false);
  });

  test('com campanha: só os leads DELA, e sem piso de avaliações/nota', async () => {
    await selectIntroCandidates(10, null, 'racha-piloto');
    expect(mockQuery.filtros).toContainEqual({ op: 'eq', col: 'campanha', val: 'racha-piloto' });
    const cols = mockQuery.filtros.map((f) => f.col);
    expect(cols).not.toContain('reviews_count');
    expect(cols).not.toContain('rating');
    expect(mockQuery.filtros.some((f) => f.op === 'is' && f.col === 'campanha')).toBe(false);
  });

  test('rótulo inválido vira o fluxo normal, nunca "todos"', async () => {
    for (const lixo of ['x,campanha.is.null', 'a;drop', '', '   ', 'A'.repeat(41), 42, null]) {
      expect(normalizarCampanha(lixo)).toBeNull();
    }
    await selectIntroCandidates(10, null, 'x,campanha.is.null');
    expect(mockQuery.filtros).toContainEqual({ op: 'is', col: 'campanha', val: null });
    expect(normalizarCampanha(' Racha-Piloto ')).toBe('racha-piloto');
  });
});

describe('pickTemplate com campanha', () => {
  let mockTemplates = [];
  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
    }));
    jest.doMock('../_lib/prospecting/prospect-store', () => {
      const real = jest.requireActual('../_lib/prospecting/prospect-store');
      return {
        ...real,
        listTemplates: async (touch) => mockTemplates.filter((t) => touch == null || t.touch_number === touch),
      };
    });
  });
  const tpl = (touch, v, campanha, active = true) => ({
    touch_number: touch, variant_label: v, meta_template_name: `t_${touch}_${v}`, template_lang: 'pt_BR', active, campanha,
  });

  test('intro: a campanha usa SÓ o template dela; o fluxo normal nunca o usa', async () => {
    const { pickTemplate } = require('../_lib/prospecting/sequencer');
    mockTemplates = [tpl(1, 'E', null), tpl(1, 'P', 'racha-piloto')];
    for (let i = 0; i < 20; i++) {
      expect((await pickTemplate(1, 'racha-piloto')).variant_label).toBe('P');
      expect((await pickTemplate(1)).variant_label).toBe('E');
    }
  });

  test('intro da campanha SEM template dela ativo: null — nada sai, nem a intro genérica', async () => {
    const { pickTemplate } = require('../_lib/prospecting/sequencer');
    mockTemplates = [tpl(1, 'E', null), tpl(1, 'P', 'racha-piloto', false)];
    const antes = process.env.PROSPECTING_INTRO_TEMPLATE;
    process.env.PROSPECTING_INTRO_TEMPLATE = 'fallback_env';
    try {
      expect(await pickTemplate(1, 'racha-piloto')).toBeNull();
    } finally {
      if (antes === undefined) delete process.env.PROSPECTING_INTRO_TEMPLATE; else process.env.PROSPECTING_INTRO_TEMPLATE = antes;
    }
  });

  test('toque 2 da campanha sem template próprio: cai no do fluxo normal', async () => {
    const { pickTemplate } = require('../_lib/prospecting/sequencer');
    mockTemplates = [tpl(2, 'B', null)];
    expect((await pickTemplate(2, 'racha-piloto')).variant_label).toBe('B');
  });
});
