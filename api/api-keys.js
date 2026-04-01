/**
 * API Keys Management Endpoint
 *
 * POST /api/api-keys?action=create — Generate a new API key (returns plaintext ONCE)
 * GET  /api/api-keys?action=list   — List active keys (prefix only, never full key)
 * POST /api/api-keys?action=revoke — Deactivate a key by ID
 *
 * All actions require JWT authentication (restaurant owner/manager).
 */

const crypto = require('crypto');
const { verifyAuth } = require('./_lib/auth');
const { hashApiKey } = require('./_lib/api-key-auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit, rejectOversizedBody } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { sanitizeStringXSS } = require('./_lib/validation');

const logger = createSecureLogger('APIKeys');

// Valid permission values
const VALID_PERMISSIONS = [
  '*',
  'pos:service_completion',
  'pos:reservations_read',
  'pos:table_status',
  'webhooks:manage',
];

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  if (rejectOversizedBody(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  // Authenticate
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(403).json({ error: 'No restaurant associated with your account' });
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'create':
        return await handleCreate(req, res, restaurantId);
      case 'list':
        return await handleList(req, res, restaurantId);
      case 'revoke':
        return await handleRevoke(req, res, restaurantId);
      default:
        return res.status(400).json({ error: 'Invalid action. Use: create, list, revoke' });
    }
  } catch (err) {
    logger.error('API keys error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function handleCreate(req, res, restaurantId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, permissions = ['*'], expires_in_days } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const sanitizedName = sanitizeStringXSS(name, { maxLength: 100 });

  // Validate permissions
  const invalidPerms = permissions.filter((p) => !VALID_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    return res.status(400).json({
      error: `Invalid permissions: ${invalidPerms.join(', ')}`,
      valid_permissions: VALID_PERMISSIONS,
    });
  }

  // Limit to 10 active keys per restaurant
  const { count } = await supabaseAdmin
    .schema('restaurant')
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

  if (count >= 10) {
    return res.status(400).json({ error: 'Maximum of 10 active API keys per restaurant' });
  }

  // Generate key
  const rawKey = crypto.randomBytes(32).toString('hex');
  const keyPrefix = rawKey.substring(0, 8);
  const keyHash = hashApiKey(rawKey);

  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('api_keys')
    .insert({
      restaurant_id: restaurantId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: sanitizedName,
      permissions,
      expires_at: expiresAt,
    })
    .select('id, key_prefix, name, permissions, created_at, expires_at')
    .single();

  if (error) {
    logger.error('Failed to create API key', error);
    return res.status(500).json({ error: 'Failed to create API key' });
  }

  logger.info('API key created', { id: data.id, prefix: keyPrefix, restaurant: restaurantId });

  return res.status(201).json({
    success: true,
    api_key: rawKey,
    message: 'Save this key now. It will not be shown again.',
    key_info: {
      id: data.id,
      prefix: data.key_prefix,
      name: data.name,
      permissions: data.permissions,
      created_at: data.created_at,
      expires_at: data.expires_at,
    },
  });
}

async function handleList(req, res, restaurantId) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('api_keys')
    .select('id, key_prefix, name, permissions, is_active, last_used_at, created_at, expires_at')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to list API keys', error);
    return res.status(500).json({ error: 'Failed to list API keys' });
  }

  return res.status(200).json({
    success: true,
    api_keys: data || [],
  });
}

async function handleRevoke(req, res, restaurantId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key_id } = req.body || {};

  if (!key_id) {
    return res.status(400).json({ error: 'key_id is required' });
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', key_id)
    .eq('restaurant_id', restaurantId)
    .select('id, name')
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'API key not found' });
  }

  logger.info('API key revoked', { id: data.id, name: data.name });

  return res.status(200).json({
    success: true,
    message: `API key "${data.name}" has been revoked`,
  });
}
