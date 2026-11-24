/**
 * Constant-time string equality for secret comparisons.
 *
 * Phase EE.1 — replaces ad-hoc `===` / `!==` checks on Bearer tokens and
 * webhook verify tokens. JS strict equality short-circuits on the first
 * mismatched byte, leaking the length-of-shared-prefix through response
 * time. With a few thousand network samples that's enough to recover
 * the secret one byte at a time.
 *
 * Usage:
 *   const { secureEquals } = require('./_lib/secure-compare');
 *   if (!secureEquals(provided, expected)) return res.status(401)...;
 *
 * Returns false (never throws) when:
 *   - either input is null / undefined / not a string
 *   - the lengths differ (constant-time compare requires equal lengths;
 *     Node's timingSafeEqual throws on unequal Buffers)
 */

const crypto = require('crypto');

/**
 * @param {unknown} provided
 * @param {unknown} expected
 * @returns {boolean}
 */
// Per-process nonce for HMAC-wrapped comparisons. Re-derived once at module
// load — never reused between processes, never exposed. The point is that
// HMAC(provided) and HMAC(expected) are both fixed-length (32 bytes) regardless
// of the input length, so timingSafeEqual can't leak length information.
const COMPARE_NONCE = crypto.randomBytes(32);

function hmac(input) {
  return crypto.createHmac('sha256', COMPARE_NONCE).update(input).digest();
}

function secureEquals(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  try {
    // Compare HMACs rather than raw strings so unequal-length inputs don't
    // fast-path out and leak the expected length through response time.
    return crypto.timingSafeEqual(hmac(provided), hmac(expected));
  } catch {
    return false;
  }
}

/**
 * Convenience wrapper for the Bearer-prefix pattern that appears on
 * every cron endpoint. Strips the "Bearer " prefix and compares the
 * trailing token in constant time.
 *
 * @param {unknown} authHeader  Raw value of req.headers.authorization
 * @param {unknown} secret      Expected secret (without "Bearer " prefix)
 */
function bearerEquals(authHeader, secret) {
  if (typeof authHeader !== 'string') return false;
  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return false;
  return secureEquals(authHeader.slice(prefix.length), secret);
}

module.exports = { secureEquals, bearerEquals };
