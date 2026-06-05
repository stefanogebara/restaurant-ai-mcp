/**
 * Re-fetches IG profile fields (bio, website, name, follower count, picture)
 * via Graph API on every tone recompute. The OAuth callback grabs these on
 * first connect; this keeps them fresh as the user edits their IG bio.
 *
 * Returns the parsed body or throws TokenInvalidError on 401/190 so the
 * caller can flip the connection status to 'expired'.
 */

const { createSecureLogger } = require('../../_lib/secure-logger');
const { TokenInvalidError } = require('./fetch-recent-media');

const logger = createSecureLogger('instagram-fetch-profile');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

const PROFILE_FIELDS = [
  'id', 'username', 'name', 'biography', 'website',
  'profile_picture_url', 'followers_count',
].join(',');

async function fetchProfile({ igBusinessAccountId, accessToken }) {
  if (!igBusinessAccountId || !accessToken) {
    throw new Error('fetchProfile: igBusinessAccountId + accessToken required');
  }
  const url = `${GRAPH_BASE}/${igBusinessAccountId}?fields=${PROFILE_FIELDS}&access_token=${encodeURIComponent(accessToken)}`;
  const resp = await fetch(url);
  const body = await resp.json().catch(() => null);

  if (!resp.ok) {
    const errCode = body?.error?.code;
    const errMsg = body?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 401 || errCode === 190) throw new TokenInvalidError(errMsg);
    logger.warn('profile fetch non-OK', { status: resp.status, code: errCode });
    throw new Error(errMsg);
  }

  return body || {};
}

module.exports = { fetchProfile };
