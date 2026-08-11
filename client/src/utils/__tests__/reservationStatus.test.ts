import { describe, it, expect } from 'vitest';
import { normalizeStatus, isCancelled, isConfirmed } from '../reservationStatus';

/**
 * Reservation statuses are stored lowercase by the API. A handful of legacy
 * rows carry capitalised values ('Cancelled') written by an older customer
 * portal path, so every comparison in the UI has to be case-insensitive —
 * comparing against 'Cancelled' alone made cancelled reservations render as
 * "pending" and kept the cancel button live on an already-cancelled booking.
 */
describe('normalizeStatus', () => {
  it('lowercases the stored value', () => {
    expect(normalizeStatus('Confirmed')).toBe('confirmed');
    expect(normalizeStatus('CANCELLED')).toBe('cancelled');
    expect(normalizeStatus('completed')).toBe('completed');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeStatus('  seated  ')).toBe('seated');
  });

  it('returns an empty string for missing values', () => {
    expect(normalizeStatus(undefined)).toBe('');
    expect(normalizeStatus(null)).toBe('');
    expect(normalizeStatus('')).toBe('');
  });

  it('leaves hyphenated statuses intact', () => {
    expect(normalizeStatus('No-Show')).toBe('no-show');
  });
});

describe('isCancelled', () => {
  it('matches both the current and the legacy casing', () => {
    expect(isCancelled('cancelled')).toBe(true);
    expect(isCancelled('Cancelled')).toBe(true);
  });

  it('does not match other statuses', () => {
    expect(isCancelled('confirmed')).toBe(false);
    expect(isCancelled('completed')).toBe(false);
    expect(isCancelled(undefined)).toBe(false);
  });
});

describe('isConfirmed', () => {
  it('matches both the current and the legacy casing', () => {
    expect(isConfirmed('confirmed')).toBe(true);
    expect(isConfirmed('Confirmed')).toBe(true);
  });

  it('does not treat pending or cancelled as confirmed', () => {
    expect(isConfirmed('pending')).toBe(false);
    expect(isConfirmed('cancelled')).toBe(false);
    expect(isConfirmed(null)).toBe(false);
  });
});
