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
function secureEquals(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
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
