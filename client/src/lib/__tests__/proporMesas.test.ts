import { describe, test, expect } from 'vitest';
import { proporMesas, resumirMesas } from '../proporMesas';

/**
 * O passo de mesas oferecia sempre o MESMO layout fixo — 9 mesas, 34 lugares —
 * para uma cantina de 30 lugares e para uma casa de 120 igualmente. Quem tem
 * 120 lugares olha aquilo e entende que o sistema não faz ideia de quem ele é.
 */

describe('proporMesas', () => {
  test('a proposta chega perto dos lugares estimados', () => {
    for (const lugares of [30, 50, 70, 90, 120]) {
      const p = proporMesas(lugares)!;
      const erro = Math.abs(p.totalLugares - lugares) / lugares;
      expect(erro, `${lugares} lugares → ${p.totalLugares}`).toBeLessThan(0.12);
    }
  });

  test('salão maior ganha mais mesas — não o mesmo layout de sempre', () => {
    const pequeno = proporMesas(30)!;
    const grande = proporMesas(120)!;
    expect(grande.totalMesas).toBeGreaterThan(pequeno.totalMesas);
    expect(grande.totalLugares).toBeGreaterThan(pequeno.totalLugares);
  });

  // A primeira versão distribuía por LUGARES e dava 21 mesas de dois num salão
  // de 120 — refeitório, não restaurante. Os testes de então passaram porque só
  // olhavam o total de lugares; o erro só apareceu imprimindo a proposta. Este
  // teste existe para aquela versão não voltar.
  test('mesa de dois não domina o salão', () => {
    for (const lugares of [30, 50, 70, 90, 120]) {
      const t = proporMesas(lugares)!.areas[0].tables;
      const total = t.reduce((s, x) => s + x.count, 0);
      const duplas = t.find((x) => x.capacity === 2)?.count ?? 0;
      expect(duplas / total, `${lugares} lugares: ${duplas} de ${total} mesas`).toBeLessThan(0.4);
    }
  });

  test('a mesa de quatro é a mais comum, como em salão real', () => {
    for (const lugares of [50, 70, 120]) {
      const t = proporMesas(lugares)!.areas[0].tables;
      const maisComum = [...t].sort((a, b) => b.count - a.count)[0];
      expect(maisComum.capacity, `${lugares} lugares`).toBe(4);
    }
  });

  test('a mistura é dominada por mesas de 2 e 4, como salão de verdade', () => {
    const t = proporMesas(70)!.areas[0].tables;
    const de2e4 = t.filter((x) => x.capacity <= 4).reduce((s, x) => s + x.count, 0);
    const total = t.reduce((s, x) => s + x.count, 0);
    expect(de2e4 / total).toBeGreaterThan(0.75);
  });

  describe('mesa de 8', () => {
    // Abaixo de 90 lugares ela fica ocupando espaço e sendo usada por três.
    test('não aparece em casa pequena ou média', () => {
      for (const lugares of [30, 50, 70]) {
        const t = proporMesas(lugares)!.areas[0].tables;
        expect(t.some((x) => x.capacity === 8), `${lugares} lugares`).toBe(false);
      }
    });

    test('aparece em casa grande', () => {
      const t = proporMesas(120)!.areas[0].tables;
      expect(t.some((x) => x.capacity === 8)).toBe(true);
    });

    // Ela sai dos lugares das mesas de 6 — senão o total estouraria a estimativa.
    test('não infla o total: sai de uma mesa de 6', () => {
      const p = proporMesas(120)!;
      expect(p.totalLugares - 120).toBeLessThanOrEqual(12);
    });
  });

  test('mesas são combináveis — é assim que salão real atende um grupo de 10', () => {
    for (const t of proporMesas(70)!.areas[0].tables) {
      expect(t.is_joinable).toBe(true);
    }
  });

  // A mesma regra do resto da folha: sem dado, não invente.
  describe('sem estimativa não propõe', () => {
    test.each([[null], [undefined], [0], [-10], [NaN], ['70' as unknown as number]])(
      '%p devolve null', (v) => {
        expect(proporMesas(v as number)).toBeNull();
      });

    test('salão pequeno demais para uma mesa também devolve null', () => {
      expect(proporMesas(4)).toBeNull();
    });
  });

  test('nunca devolve um salão sem mesa nenhuma', () => {
    for (let lugares = 8; lugares <= 200; lugares += 7) {
      const p = proporMesas(lugares)!;
      expect(p.totalMesas, `${lugares} lugares`).toBeGreaterThan(0);
    }
  });

  test('guarda os lugares estimados, para a folha poder citar a origem', () => {
    expect(proporMesas(70)!.lugaresEstimados).toBe(70);
  });
});

describe('resumirMesas', () => {
  test('conta mesas e lugares para a frase do bloco', () => {
    const { areas } = proporMesas(70)!;
    const r = resumirMesas(areas);
    expect(r.mesas).toBeGreaterThan(0);
    expect(r.lugares).toBeGreaterThan(r.mesas);
  });

  test.each([[undefined], [[]]])('%p vira zero, não quebra', (v) => {
    expect(resumirMesas(v as never)).toEqual({ mesas: 0, lugares: 0 });
  });

  test('área sem tables não derruba', () => {
    expect(resumirMesas([{ name: 'Salão', is_active: true }] as never)).toEqual({ mesas: 0, lugares: 0 });
  });
});
