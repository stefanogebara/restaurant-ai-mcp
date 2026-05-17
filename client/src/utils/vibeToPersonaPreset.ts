/**
 * Vibe → AI Personality preset resolver.
 *
 * The Phase K review-insights extractor classifies a restaurant with 3-4
 * "vibe tags" (romantic / lively / casual / upscale / family-friendly /
 * quiet / trendy / traditional / intimate / bustling). The AiPersonalityPanel
 * exposes 4 hand-crafted presets (neighborhood / fine_dining / fast_efficient
 * / family_friendly). This utility scores each preset against the tags and
 * returns the best match — when scraped vibes exist, the panel can auto-pick
 * a preset instead of leaving the user to configure 4 dimensions by hand.
 *
 * Returns null when there are no vibes or no preset accumulates enough
 * signal to beat the floor (so we don't surprise the user with a wrong
 * auto-pick).
 */

export type PersonaPresetKey = 'neighborhood' | 'fine_dining' | 'fast_efficient' | 'family_friendly';

/**
 * Per-tag score contribution toward each preset. Vibes that don't appear
 * here are ignored (we don't try to map "unknown" tags to anything).
 *
 * Scoring rationale:
 *   - "romantic", "intimate", "upscale", "quiet" → fine_dining is a strong
 *     fit, but "intimate" can also lean neighborhood at small spots, so we
 *     give partial credit.
 *   - "family-friendly", "playful" → family_friendly almost always wins.
 *   - "bustling", "trendy", "lively" → fast_efficient if the volume signal
 *     is strong; otherwise neighborhood (a lively neighbourhood bistro is
 *     not actually a counter-service spot).
 *   - "traditional", "casual" → neighborhood by default.
 */
const TAG_WEIGHTS: Record<string, Partial<Record<PersonaPresetKey, number>>> = {
  romantic:          { fine_dining: 3, neighborhood: 1 },
  intimate:          { fine_dining: 2, neighborhood: 1 },
  upscale:           { fine_dining: 3 },
  quiet:             { fine_dining: 2 },
  traditional:       { neighborhood: 2, fine_dining: 1 },
  casual:            { neighborhood: 2, family_friendly: 1 },
  lively:            { family_friendly: 1, neighborhood: 2, fast_efficient: 1 },
  bustling:          { fast_efficient: 3, family_friendly: 1 },
  trendy:            { fast_efficient: 1, neighborhood: 1 },
  'family-friendly': { family_friendly: 4 },
  'family friendly': { family_friendly: 4 },
  playful:           { family_friendly: 3 },
};

/** Minimum total score required to commit to an auto-pick. */
const MIN_CONFIDENCE = 2;

export function deriveBestPresetFromVibes(vibeTags: string[] | undefined | null): PersonaPresetKey | null {
  if (!Array.isArray(vibeTags) || vibeTags.length === 0) return null;

  const scores: Record<PersonaPresetKey, number> = {
    neighborhood: 0,
    fine_dining: 0,
    fast_efficient: 0,
    family_friendly: 0,
  };

  for (const tagRaw of vibeTags) {
    if (typeof tagRaw !== 'string') continue;
    const tag = tagRaw.toLowerCase().trim();
    const weights = TAG_WEIGHTS[tag];
    if (!weights) continue;
    for (const [preset, weight] of Object.entries(weights) as Array<[PersonaPresetKey, number]>) {
      scores[preset] += weight;
    }
  }

  // Find the winner. Ties resolved by preferring the more specific preset:
  // family_friendly > fine_dining > fast_efficient > neighborhood. This avoids
  // defaulting to "neighborhood" (which is the broadest catch-all) on a tie
  // and instead surfaces a more interesting choice.
  const priority: PersonaPresetKey[] = ['family_friendly', 'fine_dining', 'fast_efficient', 'neighborhood'];
  let best: PersonaPresetKey | null = null;
  let bestScore = -1;
  for (const preset of priority) {
    if (scores[preset] > bestScore) {
      bestScore = scores[preset];
      best = preset;
    }
  }

  if (!best || bestScore < MIN_CONFIDENCE) return null;
  return best;
}
