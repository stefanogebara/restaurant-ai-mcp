'use strict';

const MULTILINGUAL_REPLACEMENTS = {
  eleven_flash_v2: 'eleven_flash_v2_5',
  eleven_turbo_v2: 'eleven_turbo_v2_5',
};

function normalizedLanguage(language) {
  return String(language || '').trim().toLowerCase().replace(/_/g, '-');
}

// The voice model every restaurant agent uses (Stefano, 2026-11-16, after the
// first browser test call: "I need a real voice, use v4 turbo"). ElevenLabs
// lists eleven_v4_turbo as an agent TTS model, "the most expressive delivery",
// ~100 ms median latency like Flash v2.5, 90+ languages including pt, es, en
// and it: https://elevenlabs.io/docs/overview/models and the agent create API.
const AGENT_TTS_MODEL = 'eleven_v4_turbo';

// The models this code chose before. No screen lets an owner pick a model and
// the database does not store one, so an agent on one of these simply has our
// old default; the sync moves it to AGENT_TTS_MODEL. Any other model was set on
// purpose (in ElevenLabs or by a script) and is kept.
const OLD_DEFAULT_MODELS = new Set(['eleven_flash_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2', 'eleven_turbo_v2_5']);

function agentTtsModel(model) {
  return OLD_DEFAULT_MODELS.has(model) ? AGENT_TTS_MODEL : model;
}

/** Only replace the two documented English-only models; retain other selections. */
function compatibleTtsModel(language, model) {
  return normalizedLanguage(language).split('-')[0] !== 'en'
    ? MULTILINGUAL_REPLACEMENTS[model] || model : model;
}

function summaryLanguageFor(language, currentSummary, restaurant) {
  const requested = normalizedLanguage(language);
  const [base, region] = requested.split('-');
  const current = normalizedLanguage(currentSummary);
  // ElevenLabs conversation languages use canonical BCP-47 spelling.
  // Preserve an existing Portuguese variant, but normalize legacy underscores.
  // https://github.com/elevenlabs/packages/blob/main/packages/convai-widget-core/src/types/languages.ts
  if (base === 'pt') {
    if (region) return region === 'br' ? 'pt-br' : 'pt';
    if (current === 'pt-br') return 'pt-br';
    if (current === 'pt' || current === 'pt-pt') return 'pt';
    const country = String(restaurant.country || '').trim().toLowerCase();
    const brazilian = ['br', 'brazil', 'brasil'].includes(country)
      || (!country && normalizedLanguage(restaurant.ai_config?.language) === 'pt-br');
    return brazilian ? 'pt-br' : 'pt';
  }
  return base;
}

module.exports = { AGENT_TTS_MODEL, agentTtsModel, compatibleTtsModel, summaryLanguageFor };
