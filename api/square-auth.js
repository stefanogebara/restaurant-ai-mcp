/**
 * Square OAuth URL Generator
 * GET /api/square/auth
 *
 * Returns the Square OAuth URL for the authenticated restaurant.
 * The frontend fetches this URL and navigates to it.
 * Encodes restaurant_id + nonce in the state param for CSRF protection.
 */

const { verifyJWT } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const crypto = require('crypto');

const logger = createSecureLogger('square-auth');

const SQUARE_APP_ID = process.env.SQUARE_APP_ID;
const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'production';
const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';

const SQUARE_OAUTH_BASE =
  SQUARE_ENV === 'sandbox'
    ? 'https://connect.squareupsandbox.com/oauth2/authorize'
    : 'https://connect.squareup.com/oauth2/authorize';

const SQUARE_SCOPES = [
  'ITEMS_READ',
  'MERCHANT_PROFILE_READ',
  'INVENTORY_READ',
  'ORDERS_READ',
].join('+');

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SQUARE_APP_ID) {
    logger.error('SQUARE_APP_ID not configured');
    return res.status(503).json({
      success: false,
      error: 'Square integration not yet configured. Contact hello@seatable.one to request early access.',
    });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // State = base64url(restaurant_id:nonce) for CSRF protection
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = Buffer.from(`${user.restaurant_id}:${nonce}`).toString('base64url');

  const callbackUrl = `${CLIENT_URL}/api/square/callback`;
  const url =
    `${SQUARE_OAUTH_BASE}` +
    `?client_id=${encodeURIComponent(SQUARE_APP_ID)}` +
    `&scope=${SQUARE_SCOPES}` +
    `&session=false` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}`;

  logger.info('Generated Square OAuth URL', { restaurantId: user.restaurant_id });
  return res.json({ success: true, url });
};
