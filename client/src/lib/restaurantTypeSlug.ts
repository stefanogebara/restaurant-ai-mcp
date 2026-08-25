/**
 * Normalizador ÚNICO de tipo de restaurante para o vocabulário do wizard.
 *
 * Três vocabulários chegavam ao Passo 1 e nenhum batia com os tiles:
 *  - enum do demo (`casual_dining`, `fine_dining`… — underscore)
 *  - tiles do Step1Welcome (`casual-dining`, `pizzeria`… — hífen)
 *  - texto livre do Google Places (`"Brazilian"`, `"Italian restaurant"`)
 *
 * Resultado em produção: nenhum tile acendia, a validação passava porque a
 * string não era vazia, e o typeMapping do complete.js errava o lookup —
 * a cozinha REAL do restaurante virava `'other'` no banco (auditoria 24/ago).
 *
 * Regra: o wizard fala SEMPRE em tile-slug (hífen) + os três valores de
 * cozinha que o enum do banco suporta (`italian`, `japanese`, `mexican`) —
 * estes não têm tile próprio, mas preservam a verdade no banco em vez de
 * degradar para 'other'.
 */

const TILE_SLUGS = new Set([
  'fine-dining', 'casual-dining', 'fast-casual', 'cafe', 'bar',
  'bistro', 'pizzeria', 'steakhouse', 'seafood', 'other',
  // Cozinha no enum do banco — sem tile, mas válidos de ponta a ponta.
  'italian', 'japanese', 'mexican',
]);

const UNDERSCORE_TO_TILE: Record<string, string> = {
  fine_dining: 'fine-dining',
  casual_dining: 'casual-dining',
  fast_casual: 'fast-casual',
};

export function toTileType(input: string | null | undefined): string {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (TILE_SLUGS.has(raw)) return raw;
  if (UNDERSCORE_TO_TILE[raw]) return UNDERSCORE_TO_TILE[raw];

  // Texto livre do Google — mesmas heurísticas do normalizeRestaurantType do
  // backend do demo, com saída no vocabulário do wizard.
  if (raw.includes('italian')) return 'italian';
  if (raw.includes('japan') || raw.includes('sushi') || raw.includes('ramen')) return 'japanese';
  if (raw.includes('mexic') || raw.includes('taco') || raw.includes('burrito')) return 'mexican';
  if (raw.includes('pizza')) return 'pizzeria';
  if (raw.includes('steak') || raw.includes('grill') || raw.includes('bbq') || raw.includes('churrasc')) return 'steakhouse';
  if (raw.includes('seafood') || raw.includes('fish') || raw.includes('frutos do mar')) return 'seafood';
  if (raw.includes('cafe') || raw.includes('café') || raw.includes('coffee') || raw.includes('bakery') || raw.includes('padaria')) return 'cafe';
  if (raw.includes('bar') || raw.includes('pub') || raw.includes('tavern')) return 'bar';
  if (raw.includes('bistro')) return 'bistro';
  if (raw.includes('fine') || raw.includes('gourmet') || raw.includes('upscale')) return 'fine-dining';
  if (raw.includes('fast') || raw.includes('quick')) return 'fast-casual';
  // "Brazilian restaurant", "Restaurant" e afins: casa casual genérica.
  return 'casual-dining';
}
