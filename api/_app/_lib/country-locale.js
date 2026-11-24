'use strict';

// One country map for every path that creates a restaurant. Before
// 2026-11-12 the onboarding (api/onboarding/complete.js) and the demo
// (api/demo/index.js) kept separate copies: the demo lacked Belgium,
// Switzerland and Austria, and read a country NAME as a code ("SPAIN"), so
// those demos were born with agent_language 'en'. Ten restaurants created
// before the onboarding resolved the country also stayed in 'en'.
//
// Keep code/name/language support aligned with client/src/data/countries.ts;
// api/__tests__/country-locale.test.js checks every offered country against it.

// The onboarding form submits country as a display name ("Brazil", "Spain"),
// other callers send an ISO code.
const COUNTRY_NAME_TO_ISO = {
  brazil: 'BR', brasil: 'BR',
  spain: 'ES', espana: 'ES', 'españa': 'ES',
  portugal: 'PT',
  france: 'FR', belgium: 'BE', switzerland: 'CH',
  italy: 'IT', italia: 'IT',
  germany: 'DE', deutschland: 'DE', austria: 'AT',
  'united kingdom': 'GB', uk: 'GB',
  'united states': 'US', usa: 'US',
  canada: 'CA',
  mexico: 'MX', 'méxico': 'MX',
  argentina: 'AR', colombia: 'CO', chile: 'CL', peru: 'PE',
  japan: 'JP', australia: 'AU',
};

// Voice-agent language (agent_language) per supported country.
const COUNTRY_LANGUAGE_MAP = {
  BR: 'pt', PT: 'pt', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es',
  FR: 'fr', BE: 'fr', CH: 'fr', IT: 'it', DE: 'de', AT: 'de',
  JP: 'ja', US: 'en', GB: 'en', CA: 'en', AU: 'en',
};

// Country must be explicit and supported. City and phone cannot establish it:
// a wrong default also changes timezone, agent language, and subscription terms.
function resolveCountryIso(countryInput) {
  if (typeof countryInput !== 'string') return null;
  const value = countryInput.trim();
  const name = value.toLowerCase();
  const iso = Object.prototype.hasOwnProperty.call(COUNTRY_NAME_TO_ISO, name)
    ? COUNTRY_NAME_TO_ISO[name]
    : value.toUpperCase();
  return Object.prototype.hasOwnProperty.call(COUNTRY_LANGUAGE_MAP, iso) ? iso : null;
}

// Language for a country name or code, or null when the country is unsupported.
function languageForCountry(countryInput) {
  const iso = resolveCountryIso(countryInput);
  return iso ? COUNTRY_LANGUAGE_MAP[iso] : null;
}

// Country from an international phone prefix, for demos that come from a
// Google listing without a country field. Longer prefixes first.
const PHONE_PREFIXES = [
  ['+351', 'PT'], ['+54', 'AR'], ['+55', 'BR'], ['+56', 'CL'], ['+57', 'CO'],
  ['+52', 'MX'], ['+51', 'PE'], ['+34', 'ES'], ['+33', 'FR'], ['+32', 'BE'],
  ['+41', 'CH'], ['+43', 'AT'], ['+39', 'IT'], ['+49', 'DE'], ['+44', 'GB'],
  ['+81', 'JP'], ['+61', 'AU'], ['+1', 'US'],
];
function countryFromPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return null;
  for (const [prefix, iso] of PHONE_PREFIXES) if (digits.startsWith(prefix)) return iso;
  return null;
}

module.exports = {
  COUNTRY_NAME_TO_ISO, COUNTRY_LANGUAGE_MAP, PHONE_PREFIXES, resolveCountryIso, languageForCountry, countryFromPhone,
};
