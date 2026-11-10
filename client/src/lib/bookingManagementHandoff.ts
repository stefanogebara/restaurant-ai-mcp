import type { ReservationData } from '../hooks/useBooking';

interface BookingManagementHandoff {
  receiptId: string;
  reservation: ReservationData;
  customerPhone: string;
}

/** This only prefills a form. The server must still verify the submitted pair. */
export function readBookingManagementHandoff(state: unknown, displayedReceiptId?: string | null): BookingManagementHandoff | undefined {
  if (!state || typeof state !== 'object') return;
  const { receiptId, reservation, customerPhone } = state as Partial<BookingManagementHandoff>;
  if (typeof receiptId !== 'string' || !receiptId || !reservation || typeof reservation !== 'object') return;
  if (reservation.id !== receiptId || (displayedReceiptId !== undefined && receiptId !== displayedReceiptId)) return;
  if (typeof customerPhone !== 'string' || !/^\+?[\d ()-]+$/.test(customerPhone)) return;
  const digits = customerPhone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15 || /^(\d)\1+$/.test(digits)) return;
  // Keep the complete receipt and the phone exactly as entered, including formatting.
  return { receiptId, reservation, customerPhone };
}
