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
  mutedStone:  '#A8A29E',
} as const;

export type ColorToken = keyof typeof colors;
