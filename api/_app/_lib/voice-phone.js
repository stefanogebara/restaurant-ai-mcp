/**
 * Phone numbers spoken on a call, made E.164. Shared by the ElevenLabs
 * webhook and the Fly voice server, so a booking saves the same number
 * whichever engine took the call.
 */

/**
 * Normalize a phone number to E.164 format.
 * Handles Brazilian numbers, international numbers, and various input formats.
 * Returns null if it can't be reliably normalized — caller_phone fallback is used.
 *
 * Examples:
 *   "+5511999002121"  → "+5511999002121"  (already E.164)
 *   "5511999002121"   → "+5511999002121"  (BR with country code, no +)
 *   "11999002121"     → "+5511999002121"  (BR with DDD, no country code)
 *   "+14155552671"    → "+14155552671"    (US number)
 *   "0014155552671"   → "+14155552671"    (US with 00 prefix)
 *   "+447911123456"   → "+447911123456"   (UK number)
 *   "999002121"       → null              (local only — needs fallback)
 *   "34612345678"     → null (intl caller) → falls back to +34612345678 from caller_phone
 *   "507XXXXXXXX"     → null (intl caller) → falls back to +507XXXXXXXX from caller_phone
 */
function normalizePhone(raw, callerPhone = null) {
  if (!raw) return null;
  // Strip everything except digits and leading +
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length >= 7) return `+${digits}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00') && digits.length >= 9) return `+${digits.slice(2)}`;  // 00-prefix intl
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;          // BR with country code
  // Only apply the BR DDD heuristic when the caller is also Brazilian (or unknown).
  // International callers (Spain +34, Panama +507, etc.) giving their number without
  // a + prefix should not have +55 prepended — they fall through to use caller_phone.
  const callerIsBrazilian = !callerPhone || callerPhone.startsWith('+55');
  if (callerIsBrazilian) {
    // Brazilian DDDs are 2 digits, second digit is never 0 (e.g. 11, 21, 31…99).
    const looksLikeBrDdd = digits.length >= 2 && digits[1] !== '0';
    if (digits.length === 11 && looksLikeBrDdd) return `+55${digits}`;               // BR DDD + 9-digit mobile
    if (digits.length === 10 && looksLikeBrDdd) return `+55${digits}`;               // BR DDD + 8-digit landline
  }
  // Foreign number without country code — can't safely assume country.
  // Return null so caller_phone (Twilio E.164) is used as fallback.
  return null;
}

module.exports = { normalizePhone };
