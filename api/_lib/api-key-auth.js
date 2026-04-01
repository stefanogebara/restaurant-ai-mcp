/**
 * API Key Authentication for POS Integration
 *
 * Verifies X-API-Key header against SHA-256 hashes stored in restaurant.api_keys.
 * Returns { restaurant_id, permissions } on success, throws on failure.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('./db/clients');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('APIKeyAuth');

/**
 * Hash an API key with SHA-256
 * @param {string} key - Raw API key
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Verify an API key from the request
 * Extracts X-API-Key header, hashes it, looks up in restaurant.api_keys.
 * Updates last_used_at on successful verification.
 *
 * @param {object} req - HTTP request object
 * @returns {Promise<{restaurant_id: string, permissions: string[]}>}
 * @throws {Error} If key is missing, invalid, expired, or inactive
 */
async function verifyApiKey(req) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    const err = new Error('Missing or invalid X-API-Key header');
    err.status = 401;
    throw err;
  }

  if (!supabaseAdmin) {
    const err = new Error('Database not available');
    err.status = 503;
    throw err;
  }

  const keyHash = hashApiKey(apiKey);

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('api_keys')
    .select('id, restaurant_id, permissions, is_active, expires_at')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    logger.warn('API key lookup failed', { prefix: apiKey.substring(0, 8) });
    const err = new Error('Invalid API key');
    err.status = 401;
    throw err;
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    logger.warn('Expired API key used', { id: data.id });
    const err = new Error('API key has expired');
    err.status = 401;
    throw err;
  }

  // Update last_used_at (fire-and-forget)
  supabaseAdmin
    .schema('restaurant')
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch((updateErr) => {
      logger.warn('Failed to update last_used_at', { error: updateErr.message });
    });

  return {
    restaurant_id: data.restaurant_id,
    permissions: data.permissions || [],
  };
}

/**
 * Check if a permission is granted
 * @param {string[]} permissions - Granted permissions array
 * @param {string} required - Required permission
 * @returns {boolean}
 */
function hasPermission(permissions, required) {
  return permissions.includes('*') || permissions.includes(required);
}

module.exports = {
  verifyApiKey,
  hashApiKey,
  hasPermission,
};
