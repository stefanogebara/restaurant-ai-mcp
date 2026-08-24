/** Design system color tokens — single source of truth for JS/SVG contexts.
 *  Tailwind classes use the token names directly (e.g. text-burgundy).
 *  For SVG props, Recharts, inline-styles use these constants instead of raw hex.
 */
export const colors = {
  burgundy:    '#9F1239',
  burgundyDark:'#881337',
  deepCharcoal:'#1C1917',
  charcoalDark:'#292524',
  borderGray:  '#E7E5E4',
  stoneGray:   '#57534E',
  softGray:    '#F5F5F4',
  warmStone:   '#78716C',
  warmWhite:   '#FAFAF9',
  // Era '#A8A29E' aqui e '#706A65' no tailwind.config — o MESMO nome de token
  // com dois valores, então um eixo de gráfico saía mais claro (e fora do
  // WCAG) que o rótulo ao lado dele. Alinhado ao DESIGN.md.
  mutedStone:  '#706A65',

  // Semânticos — para status em SVG/Recharts, onde não dá para usar classe
  // Tailwind. Os gráficos usavam neon cru (#22c55e/#ef4444/#f97316) que não
  // existe em lugar nenhum do sistema.
  emerald:     '#059669',
  emeraldDark: '#047857',
  amber:       '#D97706',
  amberDark:   '#B45309',
  red:         '#B91C1C',
} as const;

export type ColorToken = keyof typeof colors;
