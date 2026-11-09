'use strict';

const MULTILINGUAL_REPLACEMENTS = {
  eleven_flash_v2: 'eleven_flash_v2_5',
  eleven_turbo_v2: 'eleven_turbo_v2_5',
};

function normalizedLanguage(language) {
  return String(language || '').trim().toLowerCase().replace(/_/g, '-');
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

module.exports = { compatibleTtsModel, summaryLanguageFor };
