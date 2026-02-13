import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatTimeAgo,
  formatTimeRemaining,
  formatWaitTime,
  formatAbsoluteTime,
  getTimeAgoWithFrequency,
} from '../timeFormatting';

describe('formatTimeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "0m ago" for a date equal to now', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z') });
    expect(formatTimeAgo(new Date('2026-01-15T12:00:00Z'))).toBe('0m ago');
  });

  it('returns minutes for durations under 1 hour', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:30:00Z') });
    expect(formatTimeAgo(new Date('2026-01-15T12:25:00Z'))).toBe('5m ago');
    expect(formatTimeAgo(new Date('2026-01-15T11:31:00Z'))).toBe('59m ago');
  });

  it('returns hours and minutes for durations under 24 hours', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T14:30:00Z') });
    expect(formatTimeAgo(new Date('2026-01-15T12:30:00Z'))).toBe('2h ago');
    expect(formatTimeAgo(new Date('2026-01-15T12:15:00Z'))).toBe('2h 15m ago');
  });

  it('returns days and hours for durations over 24 hours', () => {
    vi.useFakeTimers({ now: new Date('2026-01-17T15:00:00Z') });
    expect(formatTimeAgo(new Date('2026-01-15T15:00:00Z'))).toBe('2d ago');
    expect(formatTimeAgo(new Date('2026-01-15T12:00:00Z'))).toBe('2d 3h ago');
  });

  it('returns "Just now" for future dates', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z') });
    expect(formatTimeAgo(new Date('2026-01-15T13:00:00Z'))).toBe('Just now');
  });

  it('returns "Invalid date" for invalid input', () => {
    expect(formatTimeAgo('not-a-date')).toBe('Invalid date');
    expect(formatTimeAgo(new Date('invalid'))).toBe('Invalid date');
  });

  it('accepts string dates', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:10:00Z') });
    expect(formatTimeAgo('2026-01-15T12:00:00Z')).toBe('10m ago');
  });
});

describe('formatTimeRemaining', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns minutes left when under 1 hour remains', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z') });
    const result = formatTimeRemaining(
      new Date('2026-01-15T12:45:00Z'),
      new Date('2026-01-15T11:00:00Z')
    );
    expect(result).toBe('45m left');
  });

  it('returns hours and minutes when over 1 hour remains', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z') });
    const result = formatTimeRemaining(
      new Date('2026-01-15T13:30:00Z'),
      new Date('2026-01-15T11:00:00Z')
    );
    expect(result).toBe('1h 30m left');
  });

  it('returns overdue message when past departure time', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T13:30:00Z') });
    const result = formatTimeRemaining(
      new Date('2026-01-15T13:00:00Z'),
      new Date('2026-01-15T11:00:00Z')
    );
    expect(result).toContain('OVERDUE');
    expect(result).toContain('30m');
  });

  it('returns overdue with hours for long overdue', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T15:30:00Z') });
    const result = formatTimeRemaining(
      new Date('2026-01-15T13:00:00Z'),
      new Date('2026-01-15T11:00:00Z')
    );
    expect(result).toContain('2h');
    expect(result).toContain('OVERDUE');
  });

  it('returns null for invalid dates', () => {
    expect(formatTimeRemaining('invalid', '2026-01-15T11:00:00Z')).toBeNull();
    expect(formatTimeRemaining('2026-01-15T13:00:00Z', 'invalid')).toBeNull();
  });
});

describe('formatWaitTime', () => {
  it('returns formatted minutes for short waits', () => {
    expect(formatWaitTime(15)).toBe('~15 min wait');
    expect(formatWaitTime(45)).toBe('~45 min wait');
  });

  it('returns hours and minutes for long waits', () => {
    expect(formatWaitTime(90)).toBe('~1h 30m wait');
    expect(formatWaitTime(120)).toBe('~2h wait');
  });

  it('handles null/undefined/NaN', () => {
    expect(formatWaitTime(null)).toBe('~? min wait');
    expect(formatWaitTime(undefined)).toBe('~? min wait');
    expect(formatWaitTime(NaN)).toBe('~? min wait');
  });

  it('handles zero', () => {
    expect(formatWaitTime(0)).toBe('~0 min wait');
  });
});

describe('formatAbsoluteTime', () => {
  it('returns time only by default', () => {
    const result = formatAbsoluteTime(new Date('2026-01-15T19:30:00'));
    expect(result).toMatch(/7:30\s*PM/i);
  });

  it('returns "Invalid time" for bad dates', () => {
    expect(formatAbsoluteTime('not-a-date')).toBe('Invalid time');
  });

  it('includes "Today at" when includeDate is true and date is today', () => {
    const now = new Date();
    now.setHours(14, 0, 0, 0);
    const result = formatAbsoluteTime(now, true);
    expect(result).toContain('Today at');
  });

  it('includes "Tomorrow at" for tomorrow dates', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    const result = formatAbsoluteTime(tomorrow, true);
    expect(result).toContain('Tomorrow at');
  });

  it('includes month and day for other dates', () => {
    const farDate = new Date('2026-06-15T19:30:00');
    const result = formatAbsoluteTime(farDate, true);
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('at');
  });

  it('accepts string dates', () => {
    const result = formatAbsoluteTime('2026-01-15T07:00:00');
    expect(result).toMatch(/7:00\s*AM/i);
  });
});

describe('getTimeAgoWithFrequency', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns shouldUpdateFrequently=true for recent dates', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:10:00Z') });
    const result = getTimeAgoWithFrequency(new Date('2026-01-15T12:00:00Z'));
    expect(result.text).toBe('10m ago');
    expect(result.shouldUpdateFrequently).toBe(true);
  });

  it('returns shouldUpdateFrequently=false for old dates', () => {
    vi.useFakeTimers({ now: new Date('2026-01-15T14:00:00Z') });
    const result = getTimeAgoWithFrequency(new Date('2026-01-15T12:00:00Z'));
    expect(result.text).toBe('2h ago');
    expect(result.shouldUpdateFrequently).toBe(false);
  });
});
