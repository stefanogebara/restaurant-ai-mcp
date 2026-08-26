import { describe, it, expect } from 'vitest';
import { medirDesvios, totalPorDesvio, type Desvio } from '../paletaQuente.guard';
import divida from '../paletaQuente.divida.json';

/**
 * A catraca da paleta quente.
 *
 * O DESIGN.md abre dizendo que quatro desvios reapareceram em TODA superfície
 * da reforma. Já havia um guarda para eles — `booking/__tests__/warmPalette` —
 * e ele é bom, mas vigia um allowlist de dez arquivos. Foi por isso que o resto
 * do app derivou com o guarda aceso: ele olhava dez enquanto o desvio
 * acontecia em cento e trinta e sete.
 *
 * Aqui a varredura é total e o que já existe está CONGELADO em
 * `paletaQuente.divida.json`. A regra é simples: a dívida só pode cair.
 *
 * EM 26/AGO/2026 ELA CHEGOU A ZERO — o arquivo de dívida é `{}`. A catraca
 * deixou de ser catraca e virou guarda simples: qualquer violação nova, em
 * qualquer arquivo, reprova. Foram 492 correções (252 classes frias, 150 hex,
 * 62 pesos no serif, 28 emoji) em nove PRs, cada um pequeno o bastante para
 * ser revisado de verdade. Era isso que a catraca existia para permitir.
 *
 * Por que catraca e não um mutirão: corrigir 492 lugares num commit só produz
 * um diff que ninguém revisa de verdade, e uma regressão visual no meio dele é
 * invisível. A catraca para o sangramento HOJE, deixa a dívida explícita, e
 * transforma cada correção num passo pequeno e revisável.
 */

type Medida = Partial<Record<Desvio, number>>;
const congelado = divida as Record<string, Medida>;

const ROTULO: Record<Desvio, string> = {
  cinzaFrio: 'hex de cinza AZULADO (use soft-gray #F5F5F4, border-gray #E7E5E4, warm-stone, deep-charcoal)',
  classeFria: 'classe de cor fria (o sistema é quente; para ESTADO use emerald/amber/red)',
  serifComPeso: 'peso em font-serif (Instrument Serif só tem 400 — não renderiza, só mente)',
  emojiComoIcone: 'emoji fazendo trabalho de ícone (use ThiingsIcon; emoji só como ilustração)',
};

const atual = medirDesvios();

describe('paleta quente — catraca dos quatro desvios do DESIGN.md', () => {
  it('nenhum arquivo NOVO passa a violar', () => {
    const novos = Object.keys(atual).filter((f) => !(f in congelado));
    expect(
      novos,
      novos.length
        ? `Arquivos novos violando o DESIGN.md:\n${novos
            .map((f) => `  ${f} → ${Object.entries(atual[f]).map(([k, n]) => `${n}× ${ROTULO[k as Desvio]}`).join('; ')}`)
            .join('\n')}\n\nCorrija antes de mergear. A catraca não aceita dívida nova.`
        : undefined,
    ).toEqual([]);
  });

  it('nenhum arquivo conhecido PIORA', () => {
    const pioraram: string[] = [];
    for (const [arquivo, medida] of Object.entries(atual)) {
      const antes = congelado[arquivo];
      if (!antes) continue;
      for (const [desvio, n] of Object.entries(medida) as [Desvio, number][]) {
        const base = antes[desvio] ?? 0;
        if (n > base) pioraram.push(`  ${arquivo}: ${desvio} ${base} → ${n} (${ROTULO[desvio]})`);
      }
    }
    expect(pioraram, pioraram.length ? `Dívida AUMENTOU:\n${pioraram.join('\n')}` : undefined).toEqual([]);
  });

  // Sem isto a linha de base apodrece para cima: alguém conserta dez, o teste
  // fica verde, e o próximo tem dez de folga para regredir sem ninguém notar.
  it('a linha de base acompanha as correções', () => {
    const melhoraram: string[] = [];
    for (const [arquivo, antes] of Object.entries(congelado)) {
      const agora = atual[arquivo];
      for (const [desvio, base] of Object.entries(antes) as [Desvio, number][]) {
        const n = agora?.[desvio] ?? 0;
        if (n < base) melhoraram.push(`  ${arquivo}: ${desvio} ${base} → ${n}`);
      }
    }
    expect(
      melhoraram,
      melhoraram.length
        ? `A dívida caiu — obrigado. Agora baixe a linha de base para travar o ganho:\n${melhoraram.join('\n')}\n\n  cd client && npx vite-node src/test/atualizaDivida.mts`
        : undefined,
    ).toEqual([]);
  });

  it('os totais batem com a linha de base congelada', () => {
    // Um resumo legível: é este número que a gente quer ver encolher.
    expect(totalPorDesvio(atual)).toEqual(totalPorDesvio(congelado));
  });
});
