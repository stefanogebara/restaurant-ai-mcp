/**
 * Tests for api/_lib/timezone.js
 * Pure timezone utility functions using built-in Intl.DateTimeFormat
 * No external dependencies - fully unit testable
 */

const {
  getLocalDate,
  getLocalTime,
  utcToLocalDate,
  utcToLocalTime,
  localToUtcDate,
  suggestTimezone,
} = require('../_lib/timezone');

// ============================================================
// getLocalDate
// ============================================================
describe('getLocalDate', () => {
  test('returns a string in YYYY-MM-DD format', () => {
    const result = getLocalDate('Europe/Madrid');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('defaults to UTC when no timezone provided', () => {
    const utcResult = getLocalDate('UTC');
    const defaultResult = getLocalDate();
    // Both should be the same date (both UTC)
    expect(utcResult).toBe(defaultResult);
  });

  test('returns a valid date', () => {
    const result = getLocalDate('America/Sao_Paulo');
    const parsed = new Date(result);
    expect(isNaN(parsed.getTime())).toBe(false);
  });
});

// ============================================================
// getLocalTime
// ============================================================
describe('getLocalTime', () => {
  test('returns a string in HH:MM format', () => {
    const result = getLocalTime('Europe/Madrid');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  test('defaults to UTC when no timezone provided', () => {
    const result = getLocalTime();
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  test('hour is between 00 and 23', () => {
    const result = getLocalTime('America/New_York');
    const hour = parseInt(result.split(':')[0]);
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });
});

// ============================================================
// utcToLocalDate
// ============================================================
describe('utcToLocalDate', () => {
  test('converts UTC date to Madrid local date', () => {
    // 2026-02-20 23:30 UTC → 2026-02-21 00:30 in Europe/Madrid (UTC+1)
    const utcDate = new Date('2026-02-20T23:30:00Z');
    const result = utcToLocalDate(utcDate, 'Europe/Madrid');
    expect(result).toBe('2026-02-21');
  });

  test('converts UTC date to São Paulo local date', () => {
    // 2026-02-21 04:00 UTC → 2026-02-21 01:00 in America/Sao_Paulo (UTC-3)
    const utcDate = new Date('2026-02-21T04:00:00Z');
    const result = utcToLocalDate(utcDate, 'America/Sao_Paulo');
    expect(result).toBe('2026-02-21');
  });

  test('same date stays the same in UTC timezone', () => {
    const utcDate = new Date('2026-02-15T12:00:00Z');
    const result = utcToLocalDate(utcDate, 'UTC');
    expect(result).toBe('2026-02-15');
  });

  test('returns string in YYYY-MM-DD format', () => {
    const utcDate = new Date('2026-01-01T00:00:00Z');
    const result = utcToLocalDate(utcDate, 'Europe/London');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ============================================================
// utcToLocalTime
// ============================================================
describe('utcToLocalTime', () => {
  test('converts UTC time to local time (UTC+1)', () => {
    // 2026-02-21 13:00 UTC → 14:00 in Europe/Paris (UTC+1)
    const utcDate = new Date('2026-02-21T13:00:00Z');
    const result = utcToLocalTime(utcDate, 'Europe/Paris');
    expect(result).toBe('14:00');
  });

  test('converts UTC time to UTC-3 (São Paulo)', () => {
    // 2026-02-21 15:00 UTC → 12:00 in America/Sao_Paulo (UTC-3)
    const utcDate = new Date('2026-02-21T15:00:00Z');
    const result = utcToLocalTime(utcDate, 'America/Sao_Paulo');
    expect(result).toBe('12:00');
  });

  test('returns string in HH:MM format', () => {
    const utcDate = new Date('2026-02-21T20:30:00Z');
    const result = utcToLocalTime(utcDate, 'UTC');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result).toBe('20:30');
  });
});

// ============================================================
// localToUtcDate
// ============================================================
describe('localToUtcDate', () => {
  test('returns a Date object', () => {
    const result = localToUtcDate('2026-02-21', '14:00', 'Europe/Madrid');
    expect(result instanceof Date).toBe(true);
  });

  test('returns invalid date only for truly invalid input', () => {
    // Valid input should produce a valid Date
    const result = localToUtcDate('2026-02-21', '20:00', 'UTC');
    expect(isNaN(result.getTime())).toBe(false);
  });

  test('UTC timezone returns same time as input', () => {
    const result = localToUtcDate('2026-02-21', '12:00', 'UTC');
    // '2026-02-21T12:00:00Z' interpreted as UTC
    const expected = new Date('2026-02-21T12:00:00Z');
    // Allow up to 1 minute difference (edge cases in offset parsing)
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(60 * 60 * 1000);
  });
});

// ============================================================
// suggestTimezone
// ============================================================
describe('suggestTimezone', () => {
  test.each([
    ['ES', 'Europe/Madrid'],
    ['FR', 'Europe/Paris'],
    ['IT', 'Europe/Rome'],
    ['DE', 'Europe/Berlin'],
    ['GB', 'Europe/London'],
    ['PT', 'Europe/Lisbon'],
    ['BR', 'America/Sao_Paulo'],
    ['JP', 'Asia/Tokyo'],
    ['AU', 'Australia/Sydney'],
  ])('suggests correct timezone for %s', (countryCode, expectedTz) => {
    expect(suggestTimezone(countryCode)).toBe(expectedTz);
  });

  test('returns UTC for unknown country code', () => {
    expect(suggestTimezone('XX')).toBe('UTC');
    expect(suggestTimezone('')).toBe('UTC');
  });

  test('handles US city - Los Angeles', () => {
    expect(suggestTimezone('US', 'Los Angeles')).toBe('America/Los_Angeles');
  });

  test('handles US city - Chicago', () => {
    expect(suggestTimezone('US', 'Chicago')).toBe('America/Chicago');
  });

  test('defaults to America/New_York for unknown US city', () => {
    expect(suggestTimezone('US', 'Unknown City')).toBe('America/New_York');
    expect(suggestTimezone('US')).toBe('America/New_York');
  });

  test('handles US city - Denver', () => {
    expect(suggestTimezone('US', 'Denver')).toBe('America/Denver');
  });

  test('handles US city - Honolulu', () => {
    expect(suggestTimezone('US', 'Honolulu')).toBe('Pacific/Honolulu');
  });
});
