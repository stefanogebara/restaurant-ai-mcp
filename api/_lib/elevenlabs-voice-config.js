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
  // Preserve provider spelling and regional choices unless the owner explicitly
  // selects another region or language. In particular, do not rewrite pt_BR.
  if (current && current.split('-')[0] === base && (!region || current === requested)) {
    return currentSummary;
  }
  if (base === 'pt') {
    if (region) return region === 'br' ? 'pt_BR' : 'pt';
    const country = String(restaurant.country || '').trim().toLowerCase();
    const brazilian = ['br', 'brazil', 'brasil'].includes(country)
      || (!country && normalizedLanguage(restaurant.ai_config?.language) === 'pt-br');
    return brazilian ? 'pt_BR' : 'pt';
  }
  return base;
}

module.exports = { compatibleTtsModel, summaryLanguageFor };
