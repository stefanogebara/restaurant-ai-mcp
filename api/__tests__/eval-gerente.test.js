'use strict';

/**
 * Os testes do AVALIADOR, não do agente.
 *
 * Um arnês de avaliação com verificador quebrado é pior que arnês nenhum: ele
 * dá verde em cima de defeito e treina todo mundo a confiar no número. É o
 * mesmo padrão da ALLOWLIST podre, do live-smoke que falhou 100/100 sem criar
 * job, e do guarda de paleta que vigiava dez arquivos de cento e trinta.
 *
 * Então: cada checagem automática da bateria é testada com uma resposta que
 * DEVE passar e uma que DEVE reprovar.
 */

const { extrairBlocos, numerosDoContexto } = require('../../scripts/eval-gerente/analise.js');
const { CASOS, idiomaDe } = require('../../scripts/eval-gerente/casos.js');

const cerca = (tipo, corpo) => '```' + tipo + '\n' + corpo + '\n```';

describe('extrairBlocos', () => {
  test('separa chart de mermaid', () => {
    const r = extrairBlocos(
      'Olha:\n' + cerca('chart', '{"type":"bar"}') + '\ne o fluxo:\n' + cerca('mermaid', 'flowchart TD'),
    );
    expect(r.chart).toEqual(['{"type":"bar"}']);
    expect(r.mermaid).toEqual(['flowchart TD']);
  });

  test('conta dois gráficos como dois — o prompt permite só um', () => {
    const r = extrairBlocos(cerca('chart', '{"a":1}') + '\n' + cerca('chart', '{"b":2}'));
    expect(r.chart).toHaveLength(2);
  });

  test('bloco de código comum não vira gráfico', () => {
    const r = extrairBlocos(cerca('js', 'const x = 1;'));
    expect(r.chart).toEqual([]);
    expect(r.outros).toEqual(['js']);
  });

  test('resposta sem cerca nenhuma', () => {
    expect(extrairBlocos('Você tem 4 reservas hoje.')).toEqual({ chart: [], mermaid: [], outros: [] });
  });

  // A regex é global; sem reset do lastIndex a segunda chamada pularia blocos.
  test('chamadas seguidas não perdem blocos (lastIndex da regex global)', () => {
    const t = cerca('chart', '{"x":1}');
    expect(extrairBlocos(t).chart).toHaveLength(1);
    expect(extrairBlocos(t).chart).toHaveLength(1);
    expect(extrairBlocos(t).chart).toHaveLength(1);
  });
});

describe('numerosDoContexto', () => {
  test('acha número em qualquer profundidade', () => {
    const n = numerosDoContexto({ a: 1, b: { c: [2, { d: 3 }] } });
    expect([...n].sort()).toEqual([1, 2, 3]);
  });

  test('acha número dentro de texto — o snapshot mistura os dois', () => {
    const n = numerosDoContexto({ resumo: '31 covers hoje, 42 amanhã' });
    expect(n.has(31)).toBe(true);
    expect(n.has(42)).toBe(true);
  });

  test('decimal com vírgula, como vem em pt-BR', () => {
    expect(numerosDoContexto({ ticket: 'R$ 42,50' }).has(42.5)).toBe(true);
  });

  test.each([[null], [undefined], ['']])('entrada %p não derruba', (v) => {
    expect(() => numerosDoContexto(v)).not.toThrow();
  });

  // Sem o teto, um snapshot com referência circular giraria para sempre.
  test('objeto profundo demais para de descer em vez de girar', () => {
    let fundo = { v: 999 };
    for (let i = 0; i < 40; i++) fundo = { dentro: fundo };
    expect(() => numerosDoContexto(fundo)).not.toThrow();
  });
});

describe('idiomaDe', () => {
  test.each([
    ['Você tem 4 reservas para hoje à noite, e a mesa 3 está livre.', 'pt'],
    ['You have 4 reservations for tonight and table 3 is free.', 'en'],
    ['Usted tiene 4 reservas para hoy y la mesa 3 está libre.', 'es'],
  ])('%s → %s', (texto, esperado) => {
    expect(idiomaDe(texto)).toBe(esperado);
  });

  // Indeterminado NÃO pode reprovar — seria falso positivo em resposta curta.
  test('texto sem marca devolve null, e null não reprova ninguém', () => {
    expect(idiomaDe('42')).toBeNull();
    expect(idiomaDe('')).toBeNull();
  });
});

// ── as checagens da bateria, uma a uma ──────────────────────────────────────

const acha = (id) => CASOS.find((c) => c.id === id);
const rodar = (caso, texto, contexto = { numeros: [] }) =>
  caso.checa.flatMap((fn) => fn({ texto, blocos: extrairBlocos(texto), caso, contexto }));

describe('as checagens reprovam o que devem reprovar', () => {
  test('idioma: resposta em inglês para pergunta em português REPROVA', () => {
    const c = acha('facil-pt');
    expect(rodar(c, 'Você tem 4 reservas hoje à noite.')).toEqual([]);
    expect(rodar(c, 'You have 4 reservations for tonight and the table is ready.')[0]).toMatch(/English/);
  });

  test('gráfico não pedido num cumprimento REPROVA', () => {
    const c = acha('grafico-nao-pedido');
    expect(rodar(c, 'Tudo tranquilo por aqui, e com você?')).toEqual([]);
    expect(rodar(c, 'Tudo certo!\n' + cerca('chart', '{"type":"bar","data":[]}'))
      .some((f) => /sem que a pergunta pedisse/.test(f))).toBe(true);
  });

  test('diagrama não pedido REPROVA', () => {
    const c = acha('facil-pt');
    expect(rodar(c, 'Você tem 4 reservas.\n' + cerca('mermaid', 'flowchart TD'))
      .some((f) => /diagrama sem o gerente pedir/.test(f))).toBe(true);
  });

  describe('a boa-formação do bloco chart', () => {
    const c = acha('grafico-serie-real');
    const bom = '{"type":"bar","title":"Covers","data":[{"label":"Seg","value":31}]}';

    test('gráfico válido passa', () => {
      expect(rodar(c, 'Aqui:\n' + cerca('chart', bom), { numeros: [31] })).toEqual([]);
    });

    test('JSON inválido REPROVA', () => {
      expect(rodar(c, cerca('chart', '{isso nao e json}'))
        .some((f) => /não é JSON válido/.test(f))).toBe(true);
    });

    test('type fora de bar|line|area REPROVA', () => {
      expect(rodar(c, cerca('chart', '{"type":"pizza","data":[{"label":"a","value":1}]}'), { numeros: [1] })
        .some((f) => /fora de bar\|line\|area/.test(f))).toBe(true);
    });

    test('mais de 12 pontos REPROVA', () => {
      const data = Array.from({ length: 13 }, (_, i) => ({ label: `d${i}`, value: 1 }));
      expect(rodar(c, cerca('chart', JSON.stringify({ type: 'bar', data })), { numeros: [1] })
        .some((f) => /no máximo 12/.test(f))).toBe(true);
    });

    test('dois gráficos numa resposta REPROVA', () => {
      expect(rodar(c, cerca('chart', bom) + '\n' + cerca('chart', bom), { numeros: [31] })
        .some((f) => /no máximo UM/.test(f))).toBe(true);
    });

    test('não trazer gráfico onde a pergunta pede REPROVA', () => {
      expect(rodar(c, 'Você tem bastante coisa essa semana.')
        .some((f) => /não trouxe gráfico/.test(f))).toBe(true);
    });
  });

  // A checagem mais importante da bateria inteira.
  describe('ancoragem dos números', () => {
    const c = acha('grafico-serie-real');

    test('valores que existem no contexto passam', () => {
      const g = '{"type":"bar","data":[{"label":"Seg","value":31},{"label":"Ter","value":42}]}';
      expect(rodar(c, cerca('chart', g), { numeros: [31, 42] })).toEqual([]);
    });

    test('valor INVENTADO reprova, e a falha diz quais', () => {
      const g = '{"type":"bar","data":[{"label":"Seg","value":31},{"label":"Ter","value":999}]}';
      const falhas = rodar(c, cerca('chart', g), { numeros: [31, 42] });
      const f = falhas.find((x) => /NÃO estão no contexto/.test(x));
      expect(f).toBeDefined();
      expect(f).toContain('999');
      expect(f).not.toContain('31');
    });

    // Sem números conhecidos a checagem se desliga em vez de reprovar tudo —
    // senão uma rodada sem snapshot reprovaria o agente por culpa do arnês.
    test('sem contexto, a ancoragem não reprova ninguém', () => {
      const g = '{"type":"bar","data":[{"label":"x","value":123456}]}';
      expect(rodar(c, cerca('chart', g), { numeros: [] })
        .some((x) => /NÃO estão no contexto/.test(x))).toBe(false);
    });
  });

  test('resposta longa demais para pergunta curta REPROVA', () => {
    const c = acha('grafico-nao-pedido');
    expect(rodar(c, 'palavra '.repeat(200)).some((f) => /palavras para uma pergunta curta/.test(f))).toBe(true);
  });
});

describe('a bateria em si', () => {
  test('todo caso tem id único', () => {
    const ids = CASOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('todo caso declara idioma, grupo, checagens e o que olhar', () => {
    // O id entra no VALOR, não como segundo argumento: `expect(v, msg)` é
    // Vitest; no Jest ele lança "Expect takes at most one argument". Assim a
    // falha ainda aponta qual caso está torto.
    for (const c of CASOS) {
      expect(`${c.id}:${c.idioma}`).toMatch(/:(pt|en|es)$/);
      expect(`${c.id}:grupo=${c.grupo || ''}`).not.toMatch(/=$/);
      expect(`${c.id}:checa=${(c.checa || []).length}`).not.toMatch(/=0$/);
      expect(`${c.id}:olhar=${(c.olhar || '').length}`).toMatch(/=\d{2,}$/);
    }
  });

  test('cobre os três idiomas e os grupos que importam', () => {
    const idiomas = new Set(CASOS.map((c) => c.idioma));
    expect([...idiomas].sort()).toEqual(['en', 'es', 'pt']);
    const grupos = new Set(CASOS.map((c) => c.grupo));
    const faltando = ['fácil', 'difícil', 'gráfico', 'fora de contexto'].filter((g) => !grupos.has(g));
    expect(faltando).toEqual([]);
  });
});
