'use strict';

// Every city the onboarding offers must get the zone it really runs on.
// The expected zones below are written by hand (the oracle), not computed
// by the code under test. Before 2026-11-12, suggestTimezone mapped only a
// few US cities: Las Vegas, Nashville, Vancouver, Perth, Cancún and others
// got their country's capital zone, 1 to 3 hours off — and the booking
// rules (past slot, minimum notice, business hours) ran on that clock.

const fs = require('fs');
const path = require('path');
const { suggestTimezone } = require('../_lib/timezone');

const SINGLE_ZONE = {
  ES: 'Europe/Madrid', AR: 'America/Argentina/Buenos_Aires', CO: 'America/Bogota', PE: 'America/Lima',
  BR: 'America/Sao_Paulo', FR: 'Europe/Paris', BE: 'Europe/Brussels', CH: 'Europe/Zurich', DE: 'Europe/Berlin',
  AT: 'Europe/Vienna', GB: 'Europe/London', IT: 'Europe/Rome', JP: 'Asia/Tokyo',
};
const BY_CITY = {
  US: {
    'New York': 'America/New_York', 'Los Angeles': 'America/Los_Angeles', Chicago: 'America/Chicago',
    'San Francisco': 'America/Los_Angeles', Miami: 'America/New_York', 'Las Vegas': 'America/Los_Angeles',
    Seattle: 'America/Los_Angeles', Boston: 'America/New_York', Austin: 'America/Chicago', Denver: 'America/Denver',
    Portland: 'America/Los_Angeles', Nashville: 'America/Chicago', 'New Orleans': 'America/Chicago',
    'San Diego': 'America/Los_Angeles',
  },
  CA: {
    Toronto: 'America/Toronto', Vancouver: 'America/Vancouver', Montreal: 'America/Toronto', Calgary: 'America/Edmonton',
    Ottawa: 'America/Toronto', Edmonton: 'America/Edmonton', 'Quebec City': 'America/Toronto', Winnipeg: 'America/Winnipeg',
    Victoria: 'America/Vancouver', Halifax: 'America/Halifax',
  },
  AU: {
    Sydney: 'Australia/Sydney', Melbourne: 'Australia/Melbourne', Brisbane: 'Australia/Brisbane', Perth: 'Australia/Perth',
    Adelaide: 'Australia/Adelaide', 'Gold Coast': 'Australia/Brisbane', Canberra: 'Australia/Sydney',
    Hobart: 'Australia/Hobart', Cairns: 'Australia/Brisbane', Darwin: 'Australia/Darwin',
  },
  MX: {
    'Mexico City': 'America/Mexico_City', Guadalajara: 'America/Mexico_City', Monterrey: 'America/Mexico_City',
    Puebla: 'America/Mexico_City', Tijuana: 'America/Tijuana', 'Cancún': 'America/Cancun', 'Mérida': 'America/Mexico_City',
    'Querétaro': 'America/Mexico_City', 'Playa del Carmen': 'America/Cancun', 'San Miguel de Allende': 'America/Mexico_City',
    Oaxaca: 'America/Mexico_City', 'Puerto Vallarta': 'America/Mexico_City',
  },
  CL: { 'Punta Arenas': 'America/Punta_Arenas', '*': 'America/Santiago' },
  PT: { Funchal: 'Atlantic/Madeira', '*': 'Europe/Lisbon' },
};

// Parse the offered list straight from the client source the onboarding uses.
const source = fs.readFileSync(path.join(__dirname, '../../client/src/data/countries.ts'), 'utf8');
const offered = [...source.matchAll(/code:\s*'([A-Z]{2})',\s*name:\s*'[^']+'[\s\S]*?cities:\s*\[([\s\S]*?)\]/g)]
  .flatMap(([, code, cities]) => [...cities.matchAll(/name:\s*'([^']+)'/g)].map(([, city]) => [code, city]));

test('the offered list was read', () => {
  expect(offered.length).toBeGreaterThan(150);
});

test.each(offered)('%s / %s gets its real zone', (code, city) => {
  const byCity = BY_CITY[code];
  const expected = byCity ? (byCity[city] || byCity['*']) : SINGLE_ZONE[code];
  expect(expected).toBeDefined(); // a new offered city or country must be added to this oracle
  expect(suggestTimezone(code, city)).toBe(expected);
});

test.each(offered)('%s / %s is a valid IANA zone and never the UTC sentinel', (code, city) => {
  const zone = suggestTimezone(code, city);
  expect(zone).not.toBe('UTC');
  expect(() => new Intl.DateTimeFormat('en', { timeZone: zone })).not.toThrow();
});

test('city matching ignores case, accents and extra text', () => {
  expect(suggestTimezone('MX', 'CANCUN, Quintana Roo')).toBe('America/Cancun');
  expect(suggestTimezone('CA', 'vancouver bc')).toBe('America/Vancouver');
  expect(suggestTimezone('US', 'Las Vegas, NV')).toBe('America/Los_Angeles');
});
