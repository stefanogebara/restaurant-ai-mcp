/**
 * Secure ID Generator
 *
 * Generates cryptographically secure, unpredictable IDs
 * to prevent enumeration attacks
 */

const crypto = require('crypto');

/**
 * Generate a cryptographically secure random string
 * @param {number} length - Length of random string (default: 12)
 * @returns {string} Random alphanumeric string
 */
function generateSecureRandomString(length = 12) {
  // Use URL-safe base64 characters
  const bytes = crypto.randomBytes(Math.ceil(length * 0.75));
  return bytes.toString('base64url').substring(0, length);
}

/**
 * Generate a secure reservation ID
 * Format: RES-YYYYMMDD-XXXXXXXXXXXX (12 random chars)
 * @returns {string} Secure reservation ID
 */
function generateSecureReservationId() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomPart = generateSecureRandomString(12);
  return `RES-${dateStr}-${randomPart}`;
}

/**
 * Generate a secure service ID
 * Format: SRV-YYYYMMDD-XXXXXXXXXXXX (12 random chars)
 * @returns {string} Secure service ID
 */
function generateSecureServiceId() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomPart = generateSecureRandomString(12);
  return `SRV-${dateStr}-${randomPart}`;
}

/**
 * Generate a secure waitlist ID
 * Format: WL-YYYYMMDD-XXXXXXXXXXXX (12 random chars)
 * @returns {string} Secure waitlist ID
 */
function generateSecureWaitlistId() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomPart = generateSecureRandomString(12);
  return `WL-${dateStr}-${randomPart}`;
}

/**
 * Generate a secure session token
 * @param {number} length - Token length (default: 32)
 * @returns {string} Secure token
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a UUID v4 (RFC 4122 compliant)
 * @returns {string} UUID v4 string
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Hash a value for comparison (e.g., for confirmation codes)
 * @param {string} value - Value to hash
 * @returns {string} SHA-256 hash
 */
function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Verify a value against a hash
 * @param {string} value - Value to verify
 * @param {string} hash - Hash to compare against
 * @returns {boolean} Whether value matches hash
 */
function verifyHash(value, hash) {
  const valueHash = hashValue(value);
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(valueHash, 'hex'),
      Buffer.from(hash, 'hex')
    );
  } catch {
    return false;
  }
}

module.exports = {
  generateSecureRandomString,
  generateSecureReservationId,
  generateSecureServiceId,
  generateSecureWaitlistId,
  generateSecureToken,
  generateUUID,
  hashValue,
  verifyHash,
};
