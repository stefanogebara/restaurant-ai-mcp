/**
 * Divisor de blocos ricos das respostas do Manager AI.
 *
 * O modelo emite fences ```chart (JSON de série única) e ```mermaid no meio do
 * markdown; o app renderiza gráfico/diagrama AO VIVO durante o streaming.
 * Este módulo é PURO de propósito: recebe o texto (possivelmente truncado no
 * meio de um fence, porque tokens chegam aos pedaços) e devolve blocos
 * tipados. Um fence ABERTO no fim do texto vira {kind:'pending'} — a UI mostra
 * o esqueleto "montando gráfico…" até o fence fechar.
 *
 * JSON inválido ou spec fora do contrato NUNCA explode: degrada para bloco de
 * markdown com o texto cru, e a conversa segue.
 */

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'area';
  title?: string;
  unit?: string;
  data: ChartPoint[];
}

export type RichBlock =
  | { kind: 'md'; text: string }
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'mermaid'; code: string }
  | { kind: 'pending'; fence: 'chart' | 'mermaid' };

const FENCE_OPEN = /```(chart|mermaid)[ \t]*\n/;
const MAX_POINTS = 24;

/** Valida e normaliza o JSON de um bloco chart. null = fora do contrato. */
export function parseChartSpec(raw: string): ChartSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== 'bar' && o.type !== 'line' && o.type !== 'area') return null;
  if (!Array.isArray(o.data) || o.data.length === 0) return null;
  const data: ChartPoint[] = [];
  for (const p of o.data.slice(0, MAX_POINTS)) {
    if (typeof p !== 'object' || p === null) return null;
    const label = (p as Record<string, unknown>).label;
    const value = (p as Record<string, unknown>).value;
    if (typeof label !== 'string' || label.length === 0) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    data.push({ label: label.slice(0, 24), value });
  }
  return {
    type: o.type,
    title: typeof o.title === 'string' ? o.title.slice(0, 80) : undefined,
    unit: typeof o.unit === 'string' ? o.unit.slice(0, 24) : undefined,
    data,
  };
}

export function splitRichBlocks(content: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let rest = content;

  const pushMd = (text: string) => {
    if (text.trim().length > 0) blocks.push({ kind: 'md', text });
  };

  while (rest.length > 0) {
    const open = rest.match(FENCE_OPEN);
    if (!open || open.index === undefined) {
      pushMd(rest);
      break;
    }
    pushMd(rest.slice(0, open.index));
    const fence = open[1] as 'chart' | 'mermaid';
    const bodyStart = open.index + open[0].length;
    const closeIdx = rest.indexOf('```', bodyStart);
    if (closeIdx === -1) {
      // Fence aberto no fim = streaming em andamento.
      blocks.push({ kind: 'pending', fence });
      break;
    }
    const body = rest.slice(bodyStart, closeIdx).trim();
    if (fence === 'chart') {
      const spec = parseChartSpec(body);
      if (spec) blocks.push({ kind: 'chart', spec });
      else pushMd(body); // JSON quebrado degrada pra texto — nunca explode
    } else {
      if (body.length > 0) blocks.push({ kind: 'mermaid', code: body });
    }
    rest = rest.slice(closeIdx + 3);
  }

  return blocks;
}
