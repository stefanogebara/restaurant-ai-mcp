/**
 * POST /api/instagram/publish-post
 *
 * Publishes a single-image post to the connected Instagram Business
 * account using Meta's two-step container flow:
 *
 *   1. POST /{ig-user-id}/media       → returns creation_id (the container)
 *   2. POST /{ig-user-id}/media_publish → publishes the container, returns
 *                                        the IG media id (we then fetch the
 *                                        permalink to surface back to the user)
 *
 * Request: { caption: string, image_url: string }
 * Response (success): { ok: true, media_id, permalink }
 * Response (failure): { ok: false, error, code? }
 *
 * v1 scope: single-image feed posts only. Carousels, reels, and stories
 * require different container types and different polling — deferred.
 *
 * Why we accept image_url instead of a file upload: keeps this endpoint
 * stateless. The user is expected to host their image somewhere (their
 * own site, a Cloudinary/ImgBB upload, etc.) and paste the URL. That's
 * also the only way Meta's Graph API works — it requires a publicly
 * fetchable URL, not a binary upload.
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
  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';

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

  // image_url must be http(s) and publicly resolvable (Meta enforces this
  // server-side anyway, but failing fast here gives a better error to
  // the user than a generic Meta rejection).
  if (!/^https?:\/\//i.test(imageUrl)) {
    return res.status(400).json({ ok: false, error: 'image_url must be http(s)://' });
  }
  try {
    new URL(imageUrl);
  } catch {
    return res.status(400).json({ ok: false, error: 'image_url is not a valid URL' });
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

  // Step 1: create the media container
  let containerId;
  try {
    containerId = await createMediaContainer({ igId, token, imageUrl, caption });
  } catch (err) {
    return surfaceMetaError(res, 'container_create', err, conn.id);
  }

  // Step 2: publish the container. For images this is usually instant;
  // for video/carousel containers Meta requires polling status_code first.
  // Single-image containers don't need polling.
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

  logger.info('post published', { restaurantId: user.restaurant_id, mediaId });
  return res.status(200).json({ ok: true, media_id: mediaId, permalink });
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '16kb' } },
};

// ─── Graph API helpers ──────────────────────────────────────────────────

async function createMediaContainer({ igId, token, imageUrl, caption }) {
  const url = new URL(`${GRAPH_BASE}/${igId}/media`);
  url.searchParams.set('image_url', imageUrl);
  url.searchParams.set('caption', caption);
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
