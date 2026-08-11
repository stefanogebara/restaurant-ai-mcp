/**
 * Reservation status comparison.
 *
 * The API stores statuses lowercase ('confirmed', 'cancelled', 'seated',
 * 'completed', 'no-show', 'pending'). A small number of legacy rows carry
 * capitalised values written by an older customer-portal cancel path, so UI
 * comparisons must be case-insensitive: comparing against 'Cancelled' alone
 * rendered cancelled reservations as "pending" and left the cancel button
 * active on a booking that was already cancelled.
 */

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no-show';

/** Lowercase + trim a status for comparison. Empty string when absent. */
export function normalizeStatus(status?: string | null): string {
  return (status ?? '').trim().toLowerCase();
}

export function isCancelled(status?: string | null): boolean {
  return normalizeStatus(status) === 'cancelled';
}

export function isConfirmed(status?: string | null): boolean {
  return normalizeStatus(status) === 'confirmed';
}
