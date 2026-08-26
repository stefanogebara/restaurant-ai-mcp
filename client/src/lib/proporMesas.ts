import type { RestaurantArea, TableConfiguration } from '../types/onboarding.types';

/**
 * De "quantos lugares" para "quais mesas".
 *
 * `estimarPerfilPeloPorte` já converte avaliações + faixa de preço num número
 * de lugares. Faltava o passo seguinte: um salão plausível. Sem ele, o passo de
 * mesas oferecia sempre o MESMO layout fixo (9 mesas, 34 lugares) — para uma
 * cantina de 30 lugares e para uma casa de 120 igualmente. Quem tem 120 lugares
 * olha aquilo e entende que o sistema não faz ideia de quem ele é.
 *
 * A distribuição não é chute: em salão de restaurante a maior parte dos
 * assentos vive em mesas de 2 e 4, com poucas de 6 para grupos. Mesa de 8 só
 * aparece em casa grande — abaixo disso ela fica ocupando espaço e sendo usada
 * por três pessoas.
 *
 * REGRA DE HONESTIDADE, a mesma do resto da folha: sem estimativa, devolve
 * null. Quem chama mostra um padrão declarado como padrão, em vez de uma
 * proposta que finge conhecer o salão.
 */

/**
 * Proporção das MESAS, não dos lugares — e a diferença não é cosmética.
 *
 * A primeira versão distribuía por lugares: 35% dos assentos em mesas de dois.
 * Matematicamente consistente, fisicamente absurdo — dava 21 mesas de dois num
 * salão de 120 lugares, que é refeitório, não restaurante. Os testes passaram
 * porque só conferiam o total de lugares; o erro só apareceu imprimindo a
 * proposta e olhando.
 *
 * Salão se pensa em mesas: metade delas é de quatro, cerca de um terço é de
 * dois, o resto é para grupo.
 */
const MISTURA = [
  { capacity: 2, fracaoDeMesas: 0.30 },
  { capacity: 4, fracaoDeMesas: 0.52 },
  { capacity: 6, fracaoDeMesas: 0.18 },
] as const;

/** Capacidade média implícita da mistura — converte lugares em nº de mesas. */
const CAPACIDADE_MEDIA = MISTURA.reduce((s, m) => s + m.capacity * m.fracaoDeMesas, 0);

/** Abaixo disto, uma mesa de 8 é móvel parada esperando um grupo que não vem. */
const LUGARES_PARA_MESA_DE_8 = 90;

function mesa(capacity: number, count: number): TableConfiguration {
  return {
    capacity,
    count,
    // TableShape só tem 'round' | 'square'. Mesa de grupo redonda é o padrão
    // real de salão — todo mundo se enxerga.
    shape: capacity >= 6 ? 'round' : 'square',
    is_fixed_seating: false,
    // Juntar mesas é como todo salão real atende um grupo de 10 sem ter uma
    // mesa de 10. Deixar false por padrão esconderia disponibilidade que existe.
    is_joinable: true,
  };
}

export interface PropostaDeMesas {
  areas: RestaurantArea[];
  totalMesas: number;
  totalLugares: number;
  /** Os lugares que a estimativa pediu — para a folha poder dizer de onde veio. */
  lugaresEstimados: number;
}

/**
 * @param seatCount lugares estimados (de `estimarPerfilPeloPorte`)
 * @returns null quando não há estimativa — nunca um salão inventado.
 */
export function proporMesas(seatCount: number | null | undefined): PropostaDeMesas | null {
  if (typeof seatCount !== 'number' || !Number.isFinite(seatCount) || seatCount < 8) return null;

  const tables: TableConfiguration[] = [];

  // Quantas mesas cabem nesses lugares, dada a mistura.
  const totalDeMesas = Math.max(1, Math.round(seatCount / CAPACIDADE_MEDIA));

  // As faixas menores saem da fração; o RESTO vai todo para a mesa de quatro.
  //
  // Arredondar as três faixas independentemente perde (ou ganha) uma mesa: com
  // 30 lugares dava 8 mesas na conta e 7 na soma, e o salão saía com 26 lugares
  // em vez de 30. Dar o resto à faixa dominante fecha a conta por construção,
  // e a mesa de quatro é justamente a que absorve isso sem estranhar.
  const deDois = Math.round(totalDeMesas * MISTURA[0].fracaoDeMesas);
  const deSeis = Math.round(totalDeMesas * MISTURA[2].fracaoDeMesas);
  const deQuatro = Math.max(0, totalDeMesas - deDois - deSeis);

  for (const [capacity, count] of [[2, deDois], [4, deQuatro], [6, deSeis]] as const) {
    if (count > 0) tables.push(mesa(capacity, count));
  }

  // Casa grande ganha uma de 8 — e ela SAI de uma mesa de 6, para o total não
  // inflar além da estimativa.
  if (seatCount >= LUGARES_PARA_MESA_DE_8) {
    const seis = tables.find((t) => t.capacity === 6);
    if (seis && seis.count >= 2) {
      seis.count -= 1;
      tables.push(mesa(8, 1));
    }
  }

  // Salão pequeno demais para a mistura toda ainda precisa de alguma mesa.
  if (!tables.length) tables.push(mesa(2, Math.max(1, Math.round(seatCount / 2))));

  const totalMesas = tables.reduce((s, t) => s + t.count, 0);
  const totalLugares = tables.reduce((s, t) => s + t.count * t.capacity, 0);

  return {
    areas: [{ name: 'Salão', is_active: true, tables }],
    totalMesas,
    totalLugares,
    lugaresEstimados: seatCount,
  };
}

/**
 * Uma frase que o dono entende, sem jargão de configuração.
 * "9 mesas · 34 lugares" diz mais que uma tabela de capacidades.
 */
export function resumirMesas(areas: RestaurantArea[] | undefined): { mesas: number; lugares: number } {
  const tables = (areas ?? []).flatMap((a) => a.tables ?? []);
  return {
    mesas: tables.reduce((s, t) => s + (t.count || 0), 0),
    lugares: tables.reduce((s, t) => s + (t.count || 0) * (t.capacity || 0), 0),
  };
}
