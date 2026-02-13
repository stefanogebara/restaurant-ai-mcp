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

  // US cities to timezone mapping
  if (countryCode === 'US') {
    const cityLower = city.toLowerCase();
    if (cityLower.includes('los angeles') || cityLower.includes('san francisco') || cityLower.includes('seattle') || cityLower.includes('portland')) return 'America/Los_Angeles';
    if (cityLower.includes('denver') || cityLower.includes('phoenix') || cityLower.includes('salt lake')) return 'America/Denver';
    if (cityLower.includes('chicago') || cityLower.includes('houston') || cityLower.includes('dallas') || cityLower.includes('austin')) return 'America/Chicago';
    if (cityLower.includes('honolulu')) return 'Pacific/Honolulu';
    if (cityLower.includes('anchorage')) return 'America/Anchorage';
    return 'America/New_York'; // Default for US
  }

  return COUNTRY_TIMEZONES[countryCode] || 'UTC';
}

module.exports = {
  getLocalDate,
  getLocalTime,
  utcToLocalDate,
  utcToLocalTime,
  localToUtcDate,
  suggestTimezone,
};
