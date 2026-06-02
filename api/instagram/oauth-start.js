/**
 * GET /api/instagram/oauth-start
 *
 * Returns the Meta OAuth URL the frontend opens in a popup/new tab so the
 * user can authorize Instagram Business access. Mirrors api/square-auth.js
 * patterns for state CSRF and rate limiting so we don't introduce a new
 * OAuth idiom across the codebase.
 *
 * The state param is base64url(restaurant_id:nonce). The callback handler
 * validates the nonce against a server-issued list (stored in
 * instagram_oauth_states, kept TTL'd) and the restaurant_id against the
 * JWT presented at start. This prevents:
 *   - State forgery (nonce mismatch)
 *   - Auth-coupling attacks where user A's restaurant gets bound to user B's
 *     IG token (we re-verify the restaurant_id at callback time)
 *
 * Required env:
 *   META_APP_ID         — public; safe to expose in the redirect URL
 *   META_APP_SECRET     — used only at callback time
 *   CLIENT_URL          — defaults to https://seatable.one
 */

const crypto = require('crypto');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');

const logger = createSecureLogger('instagram-oauth-start');

const META_APP_ID = process.env.META_APP_ID;
const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';

// Meta's current OAuth dialog endpoint (Graph API v21.0; bump when Meta
// retires this version — they typically give 24mo notice).
const META_OAUTH_BASE = 'https://www.facebook.com/v21.0/dialog/oauth';

// Scopes for an Instagram Business Login flow:
//   - instagram_basic            → read profile + media
//   - pages_show_list            → list FB Pages the user manages
//   - pages_read_engagement      → required for IG-via-Page access
//   - instagram_content_publish  → reserved for a future "publish from Seatable"
//                                  flow; harmless to request now and saves the
//                                  user a second auth prompt later
// We do NOT request instagram_manage_messages — caption generation is one-way.
const SCOPES = [
  'instagram_basic',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_content_publish',
].join(',');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!META_APP_ID) {
    logger.error('META_APP_ID not configured');
    return res.status(503).json({
      success: false,
      error: 'Instagram connector not yet configured. Contact hello@seatable.one for early access.',
    });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // State = base64url(restaurant_id:nonce) — opaque to the user but
  // structured enough that we can pluck the restaurant_id back out at
  // callback time and verify it matches the JWT presented THEN.
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = Buffer.from(`${user.restaurant_id}:${nonce}`).toString('base64url');

  const redirectUri = `${CLIENT_URL}/api/instagram/oauth-callback`;
  const url =
    META_OAUTH_BASE +
    `?client_id=${encodeURIComponent(META_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  logger.info('Instagram OAuth start', { restaurantId: user.restaurant_id });
  return res.json({ success: true, url });
};
