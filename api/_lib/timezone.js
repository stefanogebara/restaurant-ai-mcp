/**
 * Timezone Utilities
 *
 * Converts between UTC and restaurant-local time.
 * Uses built-in Intl.DateTimeFormat (no external dependencies).
 *
 * Reservations store dates as DATE (YYYY-MM-DD) and times as TEXT (HH:MM)
 * in the restaurant's local timezone. This module provides helpers to:
 * - Get "today" in a restaurant's timezone
 * - Get the current local time in a restaurant's timezone
 * - Convert UTC timestamps to restaurant-local date/time
 */

/**
 * Get today's date string (YYYY-MM-DD) in the restaurant's timezone.
 * @param {string} timezone - IANA timezone identifier (e.g., 'Europe/Madrid')
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getLocalDate(timezone = 'UTC') {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

/**
 * Get the current time string (HH:MM) in the restaurant's timezone.
 * @param {string} timezone - IANA timezone identifier
 * @returns {string} Time string in HH:MM format
 */
function getLocalTime(timezone = 'UTC') {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  return `${hour}:${minute}`;
}

/**
 * Convert a UTC Date object to a local date string in the restaurant's timezone.
 * @param {Date} utcDate - A Date object (in UTC)
 * @param {string} timezone - IANA timezone identifier
 * @returns {string} Date string in YYYY-MM-DD format
 */
function utcToLocalDate(utcDate, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utcDate);

  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

/**
 * Convert a UTC Date object to a local time string in the restaurant's timezone.
 * @param {Date} utcDate - A Date object (in UTC)
 * @param {string} timezone - IANA timezone identifier
 * @returns {string} Time string in HH:MM format
 */
function utcToLocalTime(utcDate, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  return `${hour}:${minute}`;
}

/**
 * Get a Date object for a local date+time in a given timezone.
 * Useful for comparing/sorting reservation times.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} timeStr - Time in HH:MM format
 * @param {string} timezone - IANA timezone identifier
 * @returns {Date} Date object representing that local moment in UTC
 */
function localToUtcDate(dateStr, timeStr, timezone = 'UTC') {
  // Build an ISO-like string and use Intl to find offset
  const isoStr = `${dateStr}T${timeStr}:00`;
  // Create formatter that shows full UTC offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  // Parse through a known date to get the offset
  const testDate = new Date(isoStr + 'Z'); // treat as UTC first
  const formatted = formatter.format(testDate);
  // Extract offset like "GMT+02:00" from the formatted string
  const match = formatted.match(/GMT([+-]\d{1,2}):?(\d{2})?/);
  if (match) {
    const offsetHours = parseInt(match[1]);
    const offsetMinutes = parseInt(match[2] || '0');
    const totalOffsetMs = (offsetHours * 60 + (offsetHours < 0 ? -offsetMinutes : offsetMinutes)) * 60 * 1000;
    // Subtract the offset to get UTC
    return new Date(new Date(isoStr + 'Z').getTime() - totalOffsetMs);
  }
  // Fallback: treat as UTC
  return new Date(isoStr + 'Z');
}

/**
 * The UTC instant of a wall-clock date and time in a restaurant's time zone.
 * Returns null when the input is malformed, the zone is unknown, or the local
 * time does not exist that day (a daylight-saving gap). Two passes find the
 * offset that applies at the local moment itself, not at the same digits in UTC.
 * Validators must use this instead of `new Date(\`${date}T${time}\`)`, which
 * reads the slot in the server's zone — UTC in production (audit 2026-11-11, F3).
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:MM (or HH:MM:SS)
 * @param {string} timezone - IANA timezone identifier
 * @returns {Date|null}
 */
function localSlotToInstant(dateStr, timeStr, timezone) {
  const time = typeof timeStr === 'string' ? timeStr.match(/^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/) : null;
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !time) return null;
  const wall = Date.parse(`${dateStr}T${time[1]}:${time[2]}:00Z`);
  if (!Number.isFinite(wall)) return null;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
  const wallOf = instant => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(x => [x.type, x.value]));
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  };
  let instant = wall;
  for (let i = 0; i < 2; i++) instant = wall - (wallOf(instant) - instant);
  return wallOf(instant) === wall ? new Date(instant) : null;
}

// City -> zone inside countries that span several zones. Matching ignores
// case and accents, and looks for the name anywhere in the city text
// ("Vancouver, BC" still matches). First match wins: list specific names first.
const CITY_ZONES = {
  US: [
    [['los angeles', 'san francisco', 'san diego', 'seattle', 'portland', 'las vegas', 'sacramento', 'san jose'], 'America/Los_Angeles'],
    [['phoenix'], 'America/Phoenix'],
    [['denver', 'salt lake', 'boise', 'albuquerque'], 'America/Denver'],
    [['chicago', 'houston', 'dallas', 'austin', 'san antonio', 'nashville', 'new orleans', 'minneapolis', 'kansas city', 'st. louis', 'saint louis'], 'America/Chicago'],
    [['honolulu'], 'Pacific/Honolulu'],
    [['anchorage'], 'America/Anchorage'],
  ],
  CA: [
    [['vancouver', 'victoria', 'kelowna', 'whistler'], 'America/Vancouver'],
    [['calgary', 'edmonton', 'banff'], 'America/Edmonton'],
    [['regina', 'saskatoon'], 'America/Regina'],
    [['winnipeg'], 'America/Winnipeg'],
    [['halifax', 'moncton', 'charlottetown'], 'America/Halifax'],
    [["st. john's", 'st johns', 'saint john\'s'], 'America/St_Johns'],
  ],
  AU: [
    [['brisbane', 'gold coast', 'cairns', 'sunshine coast', 'townsville'], 'Australia/Brisbane'],
    [['perth'], 'Australia/Perth'],
    [['adelaide'], 'Australia/Adelaide'],
    [['darwin'], 'Australia/Darwin'],
    [['hobart'], 'Australia/Hobart'],
    [['melbourne'], 'Australia/Melbourne'],
  ],
  MX: [
    [['tijuana', 'mexicali', 'ensenada'], 'America/Tijuana'],
    [['cancun', 'playa del carmen', 'tulum', 'cozumel', 'chetumal'], 'America/Cancun'],
    [['hermosillo'], 'America/Hermosillo'],
    [['mazatlan', 'la paz', 'los cabos', 'cabo san lucas'], 'America/Mazatlan'],
  ],
  CL: [
    [['punta arenas'], 'America/Punta_Arenas'],
  ],
  BR: [
    [['manaus'], 'America/Manaus'],
    [['cuiaba', 'campo grande'], 'America/Cuiaba'],
    [['rio branco'], 'America/Rio_Branco'],
    [['fernando de noronha'], 'America/Noronha'],
  ],
  ES: [
    [['las palmas', 'tenerife', 'santa cruz de tenerife', 'lanzarote', 'fuerteventura', 'gran canaria'], 'Atlantic/Canary'],
  ],
  PT: [
    [['funchal', 'madeira'], 'Atlantic/Madeira'],
    [['ponta delgada', 'azores', 'acores'], 'Atlantic/Azores'],
  ],
};

function cityTimezone(countryCode, city) {
  const rules = CITY_ZONES[countryCode];
  if (!rules || typeof city !== 'string' || !city.trim()) return null;
  const text = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [names, zone] of rules) {
    if (names.some(name => text.includes(name))) return zone;
  }
  return null;
}

/**
 * Common timezone mappings by country code for onboarding auto-suggestion.
 * Returns the most common timezone for a given country.
 * @param {string} countryCode - Two-letter country code (e.g., 'ES', 'US')
 * @param {string} city - Optional city name for countries with multiple timezones
 * @returns {string} IANA timezone identifier
 */
function suggestTimezone(countryCode, city = '') {
  const COUNTRY_TIMEZONES = {
    ES: 'Europe/Madrid',
    FR: 'Europe/Paris',
    IT: 'Europe/Rome',
    DE: 'Europe/Berlin',
    GB: 'Europe/London',
    PT: 'Europe/Lisbon',
    NL: 'Europe/Amsterdam',
    BE: 'Europe/Brussels',
    AT: 'Europe/Vienna',
    CH: 'Europe/Zurich',
    GR: 'Europe/Athens',
    SE: 'Europe/Stockholm',
    NO: 'Europe/Oslo',
    DK: 'Europe/Copenhagen',
    FI: 'Europe/Helsinki',
    IE: 'Europe/Dublin',
    PL: 'Europe/Warsaw',
    CZ: 'Europe/Prague',
    HU: 'Europe/Budapest',
    RO: 'Europe/Bucharest',
    JP: 'Asia/Tokyo',
    CN: 'Asia/Shanghai',
    KR: 'Asia/Seoul',
    IN: 'Asia/Kolkata',
    TH: 'Asia/Bangkok',
    SG: 'Asia/Singapore',
    AE: 'Asia/Dubai',
    IL: 'Asia/Jerusalem',
    TR: 'Europe/Istanbul',
    AU: 'Australia/Sydney',
    NZ: 'Pacific/Auckland',
    BR: 'America/Sao_Paulo',
    AR: 'America/Argentina/Buenos_Aires',
    MX: 'America/Mexico_City',
    CO: 'America/Bogota',
    CL: 'America/Santiago',
    PE: 'America/Lima',
    CA: 'America/Toronto',
    ZA: 'Africa/Johannesburg',
    EG: 'Africa/Cairo',
    NG: 'Africa/Lagos',
    MA: 'Africa/Casablanca',
    // US handled specially below
  };

  // Countries with more than one zone: the city decides. Every city the
  // onboarding offers (client/src/data/countries.ts) is pinned to its zone in
  // api/__tests__/timezone.test.js. Before 2026-11-12 only a few US cities
  // were mapped, so Las Vegas, Vancouver, Perth or Cancún got the capital's
  // zone and the booking rules ran 1 to 3 hours off.
  const zone = cityTimezone(countryCode, city);
  if (zone) return zone;
  if (countryCode === 'US') return 'America/New_York'; // Default for US

  return COUNTRY_TIMEZONES[countryCode] || 'UTC';
}

/**
 * Today's date and local time at the restaurant, written for a language model
 * that has to correct a date.
 *
 * Why: on 2026-11-12 a voice agent that never learned today's date sent
 * 2023-11-14 for "tomorrow, Friday the 13th". The refusal only said "in the
 * past", so the agent tried other days of 2023 and the guest left without a
 * booking. A refusal that names today lets the agent fix the year itself.
 *
 * @param {string} timezone IANA zone of the restaurant
 * @param {Date} [now]
 * @returns {string} e.g. "Today at the restaurant is Thursday, 2026-11-12, 16:26 (America/Sao_Paulo). ..."
 */
function restaurantTodayHint(timezone, now = new Date()) {
  let zone = timezone || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'UTC'; }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return `Today at the restaurant is ${weekday}, ${utcToLocalDate(now, zone)}, ${time} (${zone}). `
    + 'A date said without a year is the next such date from today. Always send the full year.';
}

module.exports = {
  restaurantTodayHint,
  getLocalDate,
  getLocalTime,
  utcToLocalDate,
  utcToLocalTime,
  localToUtcDate,
  localSlotToInstant,
  suggestTimezone,
};
