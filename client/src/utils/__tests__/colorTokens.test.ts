import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { colors } from '../colors';

/**
 * `colors.ts` existe porque SVG, Recharts e inline-style não aceitam classe
 * Tailwind — então os mesmos tokens vivem em dois arquivos. Já divergiram uma
 * vez em silêncio: `mutedStone` era '#A8A29E' aqui e '#706A65' no
 * tailwind.config, e o eixo de um gráfico saía mais claro (e fora do WCAG)
 * que o rótulo ao lado. Este teste lê o config de verdade e compara.
 */
const CONFIG = readFileSync(resolve(__dirname, '../../../tailwind.config.js'), 'utf-8');

function tailwindToken(name: string): string {
  const m = CONFIG.match(new RegExp(`'${name}':\\s*'(#[0-9A-Fa-f]{6})'`));
  if (!m) throw new Error(`token '${name}' não existe no tailwind.config.js`);
  return m[1].toUpperCase();
}

describe('colors.ts não pode divergir do tailwind.config', () => {
  const shared: Array<[keyof typeof colors, string]> = [
    ['burgundy', 'burgundy'],
    ['burgundyDark', 'burgundy-dark'],
    ['deepCharcoal', 'deep-charcoal'],
    ['charcoalDark', 'charcoal-dark'],
    ['borderGray', 'border-gray'],
    ['stoneGray', 'stone-gray'],
    ['softGray', 'soft-gray'],
    ['warmStone', 'warm-stone'],
    ['warmWhite', 'warm-white'],
    ['mutedStone', 'muted-stone'],
  ];

  it.each(shared)('%s casa com o token Tailwind %s', (js, tw) => {
    expect(colors[js].toUpperCase()).toBe(tailwindToken(tw));
  });

  it('mantém os semânticos fora do neon cru', () => {
    // Os gráficos usavam #22c55e / #ef4444 / #f97316 — cores que não existem
    // em nenhum outro lugar do sistema.
    expect(colors.emerald).toBe('#059669');
    expect(colors.amber).toBe('#D97706');
    expect(colors.red).toBe('#B91C1C');
    expect(colors.burgundy).not.toBe(colors.emerald);
  });
});
