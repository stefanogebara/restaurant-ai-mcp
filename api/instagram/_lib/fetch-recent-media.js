/**
 * Fetches the most recent media (posts) for a connected Instagram Business
 * Account via the Graph API. Returns up to `limit` items, oldest field
 * preserved so the caller can paginate if needed.
 *
 * Handles the two error modes the caller cares about distinctly:
 *   - 401/190 (token expired/revoked) → throws TokenInvalidError so the
 *     status row can be flipped to 'expired' or 'revoked' instead of
 *     showing a generic "extract failed"
 *   - Anything else → throws a normal Error with the upstream message
 */

const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('instagram-fetch-media');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

class TokenInvalidError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

async function fetchRecentMedia({ igBusinessAccountId, accessToken, limit = 30 }) {
  if (!igBusinessAccountId || !accessToken) {
    throw new Error('fetchRecentMedia: igBusinessAccountId + accessToken required');
  }

  const url = new URL(`${GRAPH_BASE}/${igBusinessAccountId}/media`);
  // Only request the fields we actually use for tone extraction — keeps the
  // response payload small and lets Meta apply field-level rate limits more
  // permissively.
  url.searchParams.set(
    'fields',
    ['id', 'caption', 'media_type', 'timestamp', 'permalink', 'like_count', 'comments_count'].join(','),
  );
  url.searchParams.set('limit', String(Math.min(limit, 50)));
  url.searchParams.set('access_token', accessToken);

  const resp = await fetch(url.toString());
  const body = await resp.json().catch(() => null);

  if (!resp.ok) {
    const errCode = body?.error?.code;
    const errMsg = body?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 401 || errCode === 190) {
      throw new TokenInvalidError(errMsg);
    }
    logger.warn('media fetch non-OK', { status: resp.status, code: errCode });
    throw new Error(errMsg);
  }

  return Array.isArray(body?.data) ? body.data : [];
}

module.exports = { fetchRecentMedia, TokenInvalidError };
