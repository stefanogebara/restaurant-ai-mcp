'use strict';

// One country map for every restaurant-creation path (api/_lib/country-locale.js).
// The oracle is the client's own list (client/src/data/countries.ts): each
// offered country carries a voice locale ("es-ES", "fr-BE"...), and the agent
// language must be its prefix. A new offered country must be added to the map.

const fs = require('fs');
const path = require('path');
const { COUNTRY_LANGUAGE_MAP, resolveCountryIso, languageForCountry, countryFromPhone } = require('../_lib/country-locale');

const source = fs.readFileSync(path.join(__dirname, '../../client/src/data/countries.ts'), 'utf8');
const offered = [...source.matchAll(/code:\s*'([A-Z]{2})',\s*name:\s*'([^']+)',\s*language:\s*'([^']+)'/g)]
  .map(([, code, name, locale]) => [code, name, locale]);

test('the offered list was read', () => {
  expect(offered.length).toBeGreaterThanOrEqual(18);
});

test.each(offered)('%s (%s) resolves by code and name and speaks %s', (code, name, locale) => {
  expect(resolveCountryIso(code)).toBe(code);
  expect(resolveCountryIso(code.toLowerCase())).toBe(code);
  expect(resolveCountryIso(name)).toBe(code);
  expect(COUNTRY_LANGUAGE_MAP[code]).toBe(locale.split('-')[0]);
  expect(languageForCountry(name)).toBe(locale.split('-')[0]);
});

test.each([[''], ['Unknown'], ['Atlantis'], [null], [undefined], [42]])('%p is not a supported country', value => {
  expect(resolveCountryIso(value)).toBeNull();
  expect(languageForCountry(value)).toBeNull();
});

test.each([
  ['+55 11 99999-0000', 'BR'], ['+351 21 000 0000', 'PT'], ['+34 914 000 000', 'ES'], ['+32 2 555 0100', 'BE'],
  ['+41 22 000 0000', 'CH'], ['+43 1 000 0000', 'AT'], ['+1 212 555 0100', 'US'], ['+44 20 0000 0000', 'GB'],
  ['11 99999-0000', null], ['', null], [null, null],
])('phone %p points to %p', (phone, iso) => {
  expect(countryFromPhone(phone)).toBe(iso);
});

test('the onboarding and the demo use this same module, not a copy', () => {
  for (const file of ['../onboarding/complete.js', '../demo/index.js']) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    expect(code).toMatch(/require\('\.\.\/_lib\/country-locale'\)/);
    expect(code).not.toMatch(/const COUNTRY_LANGUAGE_MAP\s*=\s*\{/);
  }
});
