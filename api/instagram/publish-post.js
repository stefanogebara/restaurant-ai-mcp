/**
 * POST /api/instagram/publish-post
 *
 * Publishes a single-image OR carousel post (2-10 images) to the connected
 * Instagram Business account using Meta's container flow:
 *
 *   Single image (1 url):
 *     1. POST /{ig-user-id}/media       → container_id
 *     2. POST /{ig-user-id}/media_publish → media_id
 *
 *   Carousel (2-10 urls):
 *     1. POST /{ig-user-id}/media (is_carousel_item=true, image_url=...) per child
 *        → child_container_ids[N]
 *     2. POST /{ig-user-id}/media (media_type=CAROUSEL, children=...,
 *        caption=...) → parent_container_id
 *     3. POST /{ig-user-id}/media_publish (creation_id=parent_container_id)
 *        → media_id
 *
 * After publish we fetch the permalink and return it.
 *
 * Request: { caption, image_url?, image_urls? }
 *   - Either image_url (back-compat for single) or image_urls (array of 1-10)
 *     must be present. Both accepted; image_urls wins.
 *
 * Response (success): { ok: true, media_id, permalink, post_kind }
 *   post_kind is 'single' or 'carousel' for client telemetry.
 * Response (failure): { ok: false, error, code?, stage? }
 *
 * The image_urls must be publicly fetchable by Meta's IG ingest. Use
 * /api/instagram/upload-image to get one when the user uploads a file.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');

const logger = createSecureLogger('instagram-publish-post');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

const MAX_CAPTION_LEN = 2200;   // Instagram's per-post caption limit
const MAX_HASHTAGS = 30;        // Instagram's per-post hashtag limit
const PUBLISH_TIMEOUT_MS = 20_000;
const CAROUSEL_MIN = 2;         // Meta requires ≥2 children to be a carousel
const CAROUSEL_MAX = 10;        // Meta's per-carousel cap (was 10 in v21)

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // 5 posts/hour/user — IG's own limit is 25/24h but we want to bound the
  // damage from a UI bug long before Meta does.
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-publish-post:${user.id}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  const body = (typeof req.body === 'object' && req.body) || {};
  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';

  if (!caption || caption.length < 1) {
    return res.status(400).json({ ok: false, error: 'caption is required' });
  }
  if (caption.length > MAX_CAPTION_LEN) {
    return res.status(400).json({ ok: false, error: `caption is too long (max ${MAX_CAPTION_LEN} chars)` });
  }
  const hashtagCount = (caption.match(/#\w+/g) || []).length;
  if (hashtagCount > MAX_HASHTAGS) {
    return res.status(400).json({ ok: false, error: `too many hashtags (max ${MAX_HASHTAGS}, you have ${hashtagCount})` });
  }

  // Accept either image_url (single, back-compat) or image_urls (array).
  // image_urls wins when both are present.
  const rawUrls = Array.isArray(body.image_urls)
    ? body.image_urls
    : (typeof body.image_url === 'string' ? [body.image_url] : []);
  const imageUrls = rawUrls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.length > 0);

  if (imageUrls.length === 0) {
    return res.status(400).json({ ok: false, error: 'image_url or image_urls is required' });
  }
  if (imageUrls.length > CAROUSEL_MAX) {
    return res.status(400).json({ ok: false, error: `too many images (max ${CAROUSEL_MAX})` });
  }

  // Each URL must be http(s) and parseable. Fail fast here with a useful
  // error rather than letting Meta reject the whole publish with a less
  // helpful upstream message.
  for (let i = 0; i < imageUrls.length; i++) {
    const u = imageUrls[i];
    if (!/^https?:\/\//i.test(u)) {
      return res.status(400).json({ ok: false, error: `image url #${i + 1} must be http(s)://` });
    }
    try {
      new URL(u);
    } catch {
      return res.status(400).json({ ok: false, error: `image url #${i + 1} is not a valid URL` });
    }
  }

  // Look up the active connection. status='active' guarantees we have an
  // unrestricted token. Restricted/expired connections shouldn't be able
  // to publish.
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
    return res.status(409).json({
      ok: false,
      error: 'No active Instagram connection. Connect first.',
    });
  }

  const { ig_business_account_id: igId, access_token: token } = conn;
  const postKind = imageUrls.length >= CAROUSEL_MIN ? 'carousel' : 'single';

  // Step 1: create the container(s). For single image, one container with
  // the caption; for carousel, N child containers (no caption) + one
  // parent CAROUSEL container that carries the caption + children list.
  let containerId;
  try {
    if (postKind === 'single') {
      containerId = await createMediaContainer({ igId, token, imageUrl: imageUrls[0], caption });
    } else {
      // Children are created in parallel — independent Graph calls. Order
      // is preserved by index, so IG's swipe-through order matches the
      // user's upload order.
      const childIds = await Promise.all(
        imageUrls.map((imageUrl) =>
          createMediaContainer({ igId, token, imageUrl, isCarouselItem: true }),
        ),
      );
      containerId = await createCarouselContainer({ igId, token, childIds, caption });
    }
  } catch (err) {
    return surfaceMetaError(res, 'container_create', err, conn.id);
  }

  // Step 2: publish the container. Single-image and carousel both publish
  // synchronously when the children are images (video carousels would need
  // status polling — deferred to reels work).
  let mediaId;
  try {
    mediaId = await publishMediaContainer({ igId, token, containerId });
  } catch (err) {
    return surfaceMetaError(res, 'publish', err, conn.id);
  }

  // Step 3: fetch the permalink so we can show the user where their post
  // landed. Non-fatal — if this fails we still return success.
  let permalink = null;
  try {
    permalink = await fetchPermalink({ mediaId, token });
  } catch (err) {
    logger.warn('permalink fetch failed (non-fatal)', { err: err.message });
  }

  // Bump last_sync_at + clear last_error since the connection just
  // successfully published.
  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .update({ last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq('id', conn.id);

  logger.info('post published', { restaurantId: user.restaurant_id, mediaId, postKind, imageCount: imageUrls.length });
  return res.status(200).json({ ok: true, media_id: mediaId, permalink, post_kind: postKind });
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '16kb' } },
};

// ─── Graph API helpers ──────────────────────────────────────────────────

/**
 * Creates an image media container. For single posts this is the only
 * container needed (caption included). For carousel children, pass
 * isCarouselItem=true and omit caption — Meta requires children to be
 * created with `is_carousel_item=true` and the caption to live on the
 * parent carousel container.
 */
async function createMediaContainer({ igId, token, imageUrl, caption, isCarouselItem = false }) {
  const url = new URL(`${GRAPH_BASE}/${igId}/media`);
  url.searchParams.set('image_url', imageUrl);
  if (isCarouselItem) {
    url.searchParams.set('is_carousel_item', 'true');
  } else if (caption) {
    url.searchParams.set('caption', caption);
  }
  url.searchParams.set('access_token', token);

  const resp = await fetchWithTimeout(url.toString(), { method: 'POST' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.id) {
    throw normalizeMetaError(body, resp.status);
  }
  return body.id;
}

/**
 * Creates a carousel parent container that ties N child image containers
 * together. The caption lives on the carousel container, not the children.
 */
async function createCarouselContainer({ igId, token, childIds, caption }) {
  const url = new URL(`${GRAPH_BASE}/${igId}/media`);
  url.searchParams.set('media_type', 'CAROUSEL');
  url.searchParams.set('children', childIds.join(','));
  if (caption) url.searchParams.set('caption', caption);
  url.searchParams.set('access_token', token);

  const resp = await fetchWithTimeout(url.toString(), { method: 'POST' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.id) {
    throw normalizeMetaError(body, resp.status);
  }
  return body.id;
}

async function publishMediaContainer({ igId, token, containerId }) {
  const url = new URL(`${GRAPH_BASE}/${igId}/media_publish`);
  url.searchParams.set('creation_id', containerId);
  url.searchParams.set('access_token', token);

  const resp = await fetchWithTimeout(url.toString(), { method: 'POST' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.id) {
    throw normalizeMetaError(body, resp.status);
  }
  return body.id;
}

async function fetchPermalink({ mediaId, token }) {
  const url = `${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`;
  const resp = await fetchWithTimeout(url, { method: 'GET' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.permalink) {
    throw new Error(body?.error?.message || `HTTP ${resp.status}`);
  }
  return body.permalink;
}

async function fetchWithTimeout(url, opts) {
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), PUBLISH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: aborter.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps a Meta Graph API error to a structured Error subclass that the
 * caller can inspect. We preserve the upstream code so we can give
 * specific guidance for known classes:
 *   - 190        → token expired/revoked (flip connection status)
 *   - 36003      → Instagram processing error (transient)
 *   - 25 (subtype) → captioning issue (caption too long, hashtags etc.)
 *   - 9          → app rate limit hit
 */
class MetaError extends Error {
  constructor(message, { code, subcode, fbtraceId, status } = {}) {
    super(message);
    this.name = 'MetaError';
    this.code = code;
    this.subcode = subcode;
    this.fbtraceId = fbtraceId;
    this.status = status;
  }
}

function normalizeMetaError(body, httpStatus) {
  const e = body?.error || {};
  return new MetaError(e.message || `HTTP ${httpStatus}`, {
    code: e.code,
    subcode: e.error_subcode,
    fbtraceId: e.fbtrace_id,
    status: httpStatus,
  });
}

async function surfaceMetaError(res, stage, err, connId) {
  const isTokenInvalid = err instanceof MetaError && (err.code === 190 || err.status === 401);

  if (isTokenInvalid) {
    await supabaseAdmin
      .schema('restaurant')
      .from('instagram_connections')
      .update({
        status: 'expired',
        last_error: err.message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connId);
    logger.warn('IG token invalid on publish — marked expired', { stage });
    return res.status(401).json({ ok: false, error: 'Instagram token expired. Reconnect required.' });
  }

  // Stamp last_error on the connection so we can show context next time
  // the dashboard polls /api/instagram/status.
  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .update({
      last_error: `${stage}: ${err.message}`.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connId);

  const errStatus = (err instanceof MetaError && err.status) || 502;
  logger.error('publish failed', { stage, code: err.code, msg: err.message });
  return res.status(errStatus).json({
    ok: false,
    error: err.message,
    code: err.code ?? null,
    stage,
  });
}
