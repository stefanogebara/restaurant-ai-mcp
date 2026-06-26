'use strict';

/**
 * BR-aware phone helpers for prospect matching.
 *
 * Meta delivers the inbound `from` as bare digits (e.g. "5511999999999"), while
 * stored whatsapp_phone is E.164 ("+5511999999999"). Brazilian mobiles also have
 * the "9th-digit" ambiguity: the same line may be reachable with or without the
 * leading 9 after the area code. To match an inbound reply to a stored lead we
 * compare a set of normalized candidates rather than an exact string.
 *
 * (This is the minimal subset needed for Phase 0 inbound matching; the full
 * phoneBr port — discovery-side normalization/validation — lands in Phase 1.)
 */

/** Strip everything except digits. */
function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Generate the set of digit-strings a BR number might be stored as, covering the
 * 9th-digit ambiguity. Returns a Set of plain-digit strings (country code 55
 * included when present).
 *
 * @param {string} value - raw phone (E.164 or bare digits)
 * @returns {Set<string>}
 */
function brCandidates(value) {
  const digits = onlyDigits(value);
  const out = new Set();
  if (!digits) return out;
  out.add(digits);

  // Normalize to a 55 + DDD + local form when it looks Brazilian.
  let national = digits;
  if (national.startsWith('55') && national.length >= 12) {
    national = national.slice(2); // drop country code -> DDD + local
  }
  // national = DDD(2) + local(8 or 9)
  if (national.length === 11 && national[2] === '9') {
    // has 9th digit -> also offer the 8-digit form
    const without9 = national.slice(0, 2) + national.slice(3);
    out.add('55' + without9);
    out.add(without9);
    out.add('55' + national);
    out.add(national);
  } else if (national.length === 10) {
    // no 9th digit -> also offer the 9-prefixed form
    const with9 = national.slice(0, 2) + '9' + national.slice(2);
    out.add('55' + with9);
    out.add(with9);
    out.add('55' + national);
    out.add(national);
  }
  return out;
}

/**
 * True when two phone values plausibly refer to the same BR line (handles the
 * country-code and 9th-digit variations).
 */
function samePhone(a, b) {
  const ca = brCandidates(a);
  const cb = brCandidates(b);
  for (const x of ca) {
    if (cb.has(x)) return true;
    // also compare on the last-8 suffix as a final fallback (local number)
    const sa = x.slice(-8);
    for (const y of cb) {
      if (sa.length === 8 && y.slice(-8) === sa) return true;
    }
  }
  return false;
}

/** Best-effort E.164 for a BR inbound `from` (adds + ; assumes 55 already present). */
function toE164(value) {
  const digits = onlyDigits(value);
  if (!digits) return null;
  return '+' + digits;
}

module.exports = { onlyDigits, brCandidates, samePhone, toE164 };
