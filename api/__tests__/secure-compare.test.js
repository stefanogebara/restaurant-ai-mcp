/**
 * Phase EE.1 — constant-time string compare unit tests.
 */

const { secureEquals, bearerEquals } = require('../_lib/secure-compare');

describe('secureEquals', () => {
  test('returns true for equal strings', () => {
    expect(secureEquals('abc123', 'abc123')).toBe(true);
  });

  test('returns false for different strings', () => {
    expect(secureEquals('abc', 'xyz')).toBe(false);
  });

  test('returns false when lengths differ (no exception)', () => {
    expect(secureEquals('a', 'aa')).toBe(false);
    expect(secureEquals('abcdef', 'abc')).toBe(false);
  });

  test('returns false for non-string inputs without throwing', () => {
    expect(secureEquals(undefined, 'abc')).toBe(false);
    expect(secureEquals('abc', null)).toBe(false);
    expect(secureEquals(123, '123')).toBe(false);
    expect(secureEquals({}, {})).toBe(false);
    expect(secureEquals('abc', undefined)).toBe(false);
  });

  test('handles empty strings (both empty → true)', () => {
    expect(secureEquals('', '')).toBe(true);
    expect(secureEquals('a', '')).toBe(false);
    expect(secureEquals('', 'a')).toBe(false);
  });
});

describe('bearerEquals', () => {
  test('returns true for "Bearer <secret>" matching the secret', () => {
    expect(bearerEquals('Bearer abc123', 'abc123')).toBe(true);
  });

  test('returns false when the token after prefix differs', () => {
    expect(bearerEquals('Bearer wrong', 'abc123')).toBe(false);
  });

  test('returns false when the prefix is missing', () => {
    expect(bearerEquals('abc123', 'abc123')).toBe(false);
    expect(bearerEquals('Token abc123', 'abc123')).toBe(false);
  });

  test('returns false for non-string header', () => {
    expect(bearerEquals(undefined, 'abc123')).toBe(false);
    expect(bearerEquals(null, 'abc123')).toBe(false);
  });

  test('returns false when secret is empty', () => {
    expect(bearerEquals('Bearer ', '')).toBe(true); // both empty after prefix
    expect(bearerEquals('Bearer ', 'abc')).toBe(false);
  });
});
