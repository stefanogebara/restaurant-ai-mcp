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
const { runPublish, MetaError, CAROUSEL_MAX: CAROUSEL_MAX_LIB } = require('./_lib/publish-flow');

const logger = createSecureLogger('instagram-publish-post');

const MAX_CAPTION_LEN = 2200;   // Instagram's per-post caption limit
const MAX_HASHTAGS = 30;        // Instagram's per-post hashtag limit
const CAROUSEL_MAX = CAROUSEL_MAX_LIB;  // alias for readability

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

  let result;
  try {
    result = await runPublish({
      igBusinessAccountId: conn.ig_business_account_id,
      accessToken: conn.access_token,
      caption,
      imageUrls,
      tokenInvalidCallback: async (err) => {
        await supabaseAdmin
          .schema('restaurant')
          .from('instagram_connections')
          .update({
            status: 'expired',
            last_error: err.message.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id);
      },
    });
  } catch (err) {
    return surfaceMetaError(res, err.stage || 'publish', err, conn.id);
  }

  // Bump last_sync_at + clear last_error since the connection just
  // successfully published.
  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .update({ last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq('id', conn.id);

  logger.info('post published', {
    restaurantId: user.restaurant_id,
    mediaId: result.mediaId,
    postKind: result.postKind,
    imageCount: result.imageCount,
  });
  return res.status(200).json({
    ok: true,
    media_id: result.mediaId,
    permalink: result.permalink,
    post_kind: result.postKind,
  });
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '16kb' } },
};

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Maps a Meta Graph API error from runPublish() to an HTTP response.
 * Token-invalid errors flip connection.status='expired' (the
 * tokenInvalidCallback passed to runPublish already updates that row,
 * but we still send back 401 here so the UI prompts a reconnect). Other
 * Meta errors stamp last_error on the connection for surfacing on the
 * next status poll.
 */
async function surfaceMetaError(res, stage, err, connId) {
  const isTokenInvalid = err instanceof MetaError && (err.code === 190 || err.status === 401);

  if (isTokenInvalid) {
    logger.warn('IG token invalid on publish', { stage });
    return res.status(401).json({ ok: false, error: 'Instagram token expired. Reconnect required.' });
  }

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
