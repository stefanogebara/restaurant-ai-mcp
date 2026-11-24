/**
 * Server-side mirror of client/src/utils/vibeToPersonaPreset.ts.
 *
 * Mapped 1:1 — keep both in sync. Server-side use is for auto-seeding
 * ai_personality at demo creation; client-side use is for the personality
 * panel's "we picked this for you" affordance.
 */

const PERSONA_PRESETS = {
  neighborhood: {
    humor_type: 'warm',
    communication_style: 'casual',
    language_tone: 'warm',
    personality_traits: ['friendly', 'welcoming', 'caring'],
  },
  fine_dining: {
    humor_type: 'none',
    communication_style: 'formal',
    language_tone: 'calm',
    personality_traits: ['professional', 'sophisticated', 'knowledgeable'],
  },
  fast_efficient: {
    humor_type: 'light',
    communication_style: 'friendly_professional',
    language_tone: 'neutral',
    personality_traits: ['attentive', 'professional', 'patient'],
  },
  family_friendly: {
    humor_type: 'playful',
    communication_style: 'casual',
    language_tone: 'enthusiastic',
    personality_traits: ['caring', 'cheerful', 'welcoming'],
  },
};

const TAG_WEIGHTS = {
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

const MIN_CONFIDENCE = 2;
const PRIORITY = ['family_friendly', 'fine_dining', 'fast_efficient', 'neighborhood'];

function deriveBestPresetFromVibes(vibeTags) {
  if (!Array.isArray(vibeTags) || vibeTags.length === 0) return null;
  const scores = { neighborhood: 0, fine_dining: 0, fast_efficient: 0, family_friendly: 0 };
  for (const tagRaw of vibeTags) {
    if (typeof tagRaw !== 'string') continue;
    const weights = TAG_WEIGHTS[tagRaw.toLowerCase().trim()];
    if (!weights) continue;
    for (const [preset, weight] of Object.entries(weights)) {
      scores[preset] += weight;
    }
  }
  let best = null;
  let bestScore = -1;
  for (const preset of PRIORITY) {
    if (scores[preset] > bestScore) {
      bestScore = scores[preset];
      best = preset;
    }
  }
  if (!best || bestScore < MIN_CONFIDENCE) return null;
  return best;
}

/**
 * Given the enriched scraped_data, return the ai_personality blob to seed.
 * Returns null if there are no vibe tags or no preset hits confidence.
 */
function derivePersonalityFromScrape(scrapedData) {
  const vibes = scrapedData?.insights?.vibe_tags;
  const preset = deriveBestPresetFromVibes(vibes);
  if (!preset) return null;
  return { ...PERSONA_PRESETS[preset], _derived_from_preset: preset };
}

module.exports = {
  PERSONA_PRESETS,
  // Exportado para o `persona-proposta` poder dizer QUAIS tags pesaram na
  // sugestão. Sem isto ele explicaria a escolha por dedução própria, e
  // explicação deduzida é explicação inventada.
  TAG_WEIGHTS,
  deriveBestPresetFromVibes,
  derivePersonalityFromScrape,
};
