import { describe, it, expect } from 'vitest';
import { getOutcomeColor, getOutcomePillColor, getSentimentLabelKey, formatDate, formatCallTime, formatCallExportDate, formatConfiguredDate, isValidTimeZone } from '../callTrackingTypes';

describe('completed booking status', () => {
  it('uses the same success tone in the call list and its detail', () => {
    expect(getOutcomePillColor('reservation_created')).toContain('text-emerald');
    expect(getOutcomeColor('reservation_created')).toContain('text-emerald');
    expect(getOutcomeColor('error')).toContain('text-red');
    expect(getOutcomeColor('abandoned')).toContain('text-amber');
  });
});

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

  it('uses restaurant time in São Paulo even when the browser is in Madrid', () => {
    const timestamp = '2026-11-07T18:10:17Z';
    expect(formatDate(timestamp, 'pt-BR', 'America/Sao_Paulo')).toContain('15:10');
    expect(formatCallTime(timestamp, 'pt-BR', 'America/Sao_Paulo')).toBe('15:10');
    expect(formatCallTime(timestamp, 'pt-BR', 'Europe/Madrid')).toBe('19:10');
    expect(formatCallExportDate(timestamp, 'pt-BR', 'America/Sao_Paulo')).toContain('2026');
    expect(formatCallExportDate(timestamp, 'pt-BR', 'America/Sao_Paulo')).toContain('15:10');
  });

  it('handles invalid timestamps and time zones without a broken date', () => {
    expect(formatCallTime('garbage', 'pt-BR', 'America/Sao_Paulo')).toBe('');
    expect(formatCallTime('2026-11-07T18:10:17Z', 'pt-BR', 'invalid-zone')).not.toBe('');
    expect(isValidTimeZone('invalid-zone')).toBe(false);
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
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
