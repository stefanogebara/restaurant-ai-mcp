import { describe, it, expect } from 'vitest';
import { getSentimentLabelKey, formatDate, formatConfiguredDate } from '../callTrackingTypes';

describe('getSentimentLabelKey', () => {
  it('maps known sentiments to their callTracking.* key', () => {
    expect(getSentimentLabelKey('positive')).toBe('callTracking.sentimentPositive');
    expect(getSentimentLabelKey('neutral')).toBe('callTracking.sentimentNeutral');
    expect(getSentimentLabelKey('negative')).toBe('callTracking.sentimentNegative');
  });

  it('falls back to the unknown key for missing/unrecognised values', () => {
    expect(getSentimentLabelKey(undefined)).toBe('callTracking.sentimentUnknown');
    expect(getSentimentLabelKey('')).toBe('callTracking.sentimentUnknown');
    expect(getSentimentLabelKey('frustrated')).toBe('callTracking.sentimentUnknown');
  });
});

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    expect(formatDate('2026-05-14T19:30:00Z')).not.toBe('');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('returns an empty string for an unparseable date (not "Invalid Date")', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

describe('formatConfiguredDate', () => {
  it('returns N/A for null input', () => {
    expect(formatConfiguredDate(null)).toBe('N/A');
  });

  it('returns N/A for an unparseable date (not "Invalid Date")', () => {
    expect(formatConfiguredDate('garbage')).toBe('N/A');
  });

  it('formats a valid date string', () => {
    expect(formatConfiguredDate('2026-05-14T19:30:00Z')).not.toBe('N/A');
  });
});
