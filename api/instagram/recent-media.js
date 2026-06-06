/**
 * GET /api/instagram/recent-media
 *
 * Returns the connected IG Business Account's most recent media so the
 * caption drafter can offer them as one-click image sources. The user
 * doesn't have to upload a new file if they already have a great shot
 * from a past post.
 *
 * Response: { ok: true, media: [{ id, image_url, thumbnail_url, media_type, permalink, timestamp }] }
 *
 * media_url is what Meta needs to re-ingest the image (it's a public
 * scontent.cdninstagram.com URL — works as a publish input). For VIDEO
 * media we return thumbnail_url as image_url because Meta's single-image
 * publish flow can't accept a video URL.
 *
 * Cached for 5 min in-memory per connection to avoid Graph hammering when
 * the user opens the picker multiple times.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { fetchRecentMedia, TokenInvalidError } = require('./_lib/fetch-recent-media');

const logger = createSecureLogger('instagram-recent-media');

// In-memory TTL cache keyed by connection id. Stays warm across requests
// within the same Vercel function instance — different instances will
// re-fetch on first hit, which is fine.
const CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const MEDIA_LIMIT = 12;

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // 30/min/user — the UI hits this on picker-open, so plenty of headroom
  // for normal use without giving up rate-limit defense.
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-recent-media:${user.id}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return;

  const { data: conn, error: connErr } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .select('id, ig_business_account_id, access_token, status')
    .eq('restaurant_id', user.restaurant_id)
    .eq('status', 'active')
    .maybeSingle();

  if (connErr) {
    logger.error('connection lookup failed', { err: connErr.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
  if (!conn) {
    return res.status(404).json({ ok: false, error: 'No active Instagram connection.' });
  }

  // Cache check
  const cached = CACHE.get(conn.id);
  if (cached && cached.expiresAt > Date.now()) {
    return res.status(200).json({ ok: true, media: cached.media, cached: true });
  }

  let media;
  try {
    media = await fetchRecentMedia({
      igBusinessAccountId: conn.ig_business_account_id,
      accessToken: conn.access_token,
      limit: MEDIA_LIMIT,
    });
  } catch (err) {
    if (err instanceof TokenInvalidError) {
      await supabaseAdmin
        .schema('restaurant')
        .from('instagram_connections')
        .update({ status: 'expired', last_error: err.message, updated_at: new Date().toISOString() })
        .eq('id', conn.id);
      return res.status(401).json({ ok: false, error: 'Instagram token expired. Reconnect required.' });
    }
    logger.error('media fetch failed', { err: err.message });
    return res.status(502).json({ ok: false, error: `Instagram API: ${err.message}` });
  }

  // Shape the response — keep it small + drop fields that aren't useful to
  // the client. Per-media-type URL resolution:
  //   IMAGE          → media_url is the image
  //   VIDEO          → media_url is the video URL (not usable for single-
  //                    image publish), so fall back to thumbnail_url
  //   CAROUSEL_ALBUM → media_url is NOT set on the parent; the actual
  //                    image lives on the first child. We take child[0]'s
  //                    media_url (or its thumbnail if it's a VIDEO child).
  const shaped = (media || [])
    .map((m) => ({
      id: m.id,
      image_url: resolveDisplayUrl(m),
      thumbnail_url: m.thumbnail_url || null,
      media_type: m.media_type,
      permalink: m.permalink,
      timestamp: m.timestamp,
    }))
    .filter((m) => !!m.image_url);  // drop anything without a usable URL

  CACHE.set(conn.id, { media: shaped, expiresAt: Date.now() + CACHE_TTL_MS });

  return res.status(200).json({ ok: true, media: shaped, cached: false });
};

/**
 * Picks the URL we surface to the client for a given media item. Returns
 * null when the item has no usable image URL (e.g. a stale carousel with
 * no children — should be unreachable but caller filters defensively).
 *
 * Exposed for unit tests so the per-media-type rules are pinned.
 */
function resolveDisplayUrl(item) {
  if (!item || typeof item !== 'object') return null;
  const type = item.media_type;
  if (type === 'IMAGE') return item.media_url || null;
  if (type === 'VIDEO') return item.thumbnail_url || null;
  if (type === 'CAROUSEL_ALBUM') {
    const children = Array.isArray(item.children?.data)
      ? item.children.data
      : Array.isArray(item.children)
        ? item.children
        : [];
    const first = children[0];
    if (!first) return null;
    if (first.media_type === 'VIDEO') return first.thumbnail_url || null;
    return first.media_url || null;
  }
  return item.media_url || item.thumbnail_url || null;
}

// Exposed for tests — clears the in-memory cache between runs.
module.exports.__test__ = {
  _clearCacheForTests: () => CACHE.clear(),
  resolveDisplayUrl,
};
