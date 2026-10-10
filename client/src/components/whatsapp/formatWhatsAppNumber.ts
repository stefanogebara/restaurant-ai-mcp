/** Presentation only. The E.164 value remains unchanged for links and copying. */
export function formatWhatsAppNumber(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.startsWith('55') && digits.length === 12) return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  return number;
}
