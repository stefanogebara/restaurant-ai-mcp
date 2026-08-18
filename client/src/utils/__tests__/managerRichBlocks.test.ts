/**
 * Divisor de blocos ricos do Manager AI.
 *
 * Contratos:
 *  1. Fence ```chart fechado com JSON válido vira {kind:'chart'} — e o texto
 *     ao redor continua markdown.
 *  2. Fence ABERTO no fim (streaming no meio do bloco) vira {kind:'pending'}
 *     — é o que faz o esqueleto "montando gráfico…" aparecer ao vivo.
 *  3. JSON inválido ou spec fora do contrato degrada pra markdown — nunca
 *     explode a conversa.
 *  4. ```mermaid fechado vira {kind:'mermaid'}.
 *  5. Specs são normalizados (limites de pontos e tamanhos de string).
 */

import { describe, it, expect } from 'vitest';
import { splitRichBlocks, parseChartSpec } from '../managerRichBlocks';

const CHART = '```chart\n{"type":"bar","title":"Covers","unit":"covers","data":[{"label":"Seg","value":31},{"label":"Ter","value":42}]}\n```';

describe('splitRichBlocks', () => {
  it('texto puro vira um único bloco md', () => {
    expect(splitRichBlocks('Hoje temos 14 reservas.')).toEqual([
      { kind: 'md', text: 'Hoje temos 14 reservas.' },
    ]);
  });

  it('chart fechado vira bloco chart, com o md ao redor preservado', () => {
    const blocks = splitRichBlocks(`Resumo do dia.\n${CHART}\nQualquer dúvida, só chamar.`);
    expect(blocks.map((b) => b.kind)).toEqual(['md', 'chart', 'md']);
    const chart = blocks[1] as Extract<typeof blocks[number], { kind: 'chart' }>;
    expect(chart.spec.type).toBe('bar');
    expect(chart.spec.data).toHaveLength(2);
    expect(chart.spec.data[1]).toEqual({ label: 'Ter', value: 42 });
  });

  it('fence aberto no fim (streaming) vira pending — o esqueleto ao vivo', () => {
    const blocks = splitRichBlocks('Segue o gráfico:\n```chart\n{"type":"bar","da');
    expect(blocks).toEqual([
      { kind: 'md', text: 'Segue o gráfico:\n' },
      { kind: 'pending', fence: 'chart' },
    ]);
  });

  it('JSON inválido degrada pra markdown, nunca explode', () => {
    const blocks = splitRichBlocks('```chart\n{isso não é json}\n```');
    expect(blocks).toEqual([{ kind: 'md', text: '{isso não é json}' }]);
  });

  it('mermaid fechado vira bloco mermaid', () => {
    const blocks = splitRichBlocks('```mermaid\nflowchart LR\nA-->B\n```');
    expect(blocks).toEqual([{ kind: 'mermaid', code: 'flowchart LR\nA-->B' }]);
  });
});

describe('parseChartSpec — o contrato do spec', () => {
  it('recusa type desconhecido, data vazia e value não-numérico', () => {
    expect(parseChartSpec('{"type":"pie","data":[{"label":"a","value":1}]}')).toBeNull();
    expect(parseChartSpec('{"type":"bar","data":[]}')).toBeNull();
    expect(parseChartSpec('{"type":"bar","data":[{"label":"a","value":"31"}]}')).toBeNull();
  });

  it('trunca séries longas e strings compridas', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ label: `d${i}`, value: i }));
    const spec = parseChartSpec(JSON.stringify({ type: 'line', title: 'x'.repeat(200), data }));
    expect(spec?.data).toHaveLength(24);
    expect(spec?.title).toHaveLength(80);
  });
});
