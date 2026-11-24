/**
 * POST /api/instagram/publish-reel
 *
 * Publishes a Reel to the connected IG Business Account. Reels are
 * separate from feed posts:
 *   - one video (no carousel)
 *   - shares to the Reels tab AND the feed (share_to_feed=true)
 *   - Meta processes the video async → we poll status_code before publish
 *
 * Request: { caption, video_url }
 * Response (success): { ok: true, media_id, permalink, post_kind: 'reel' }
 * Response (failure): { ok: false, error, code?, stage?, container_id? }
 *
 * The container_id is exposed on status_polling timeouts so a future
 * "finalize" endpoint can resume publishing without re-uploading.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { runPublishReel, MetaError } = require('./_lib/publish-flow');

const logger = createSecureLogger('instagram-publish-reel');

const MAX_CAPTION_LEN = 2200;
const MAX_HASHTAGS = 30;

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

  // Reels are heavy (video processing + permalink fetch) — keep this
  // tighter than the image publish (5/hr) since each call can hold a
  // function for 60s.
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-publish-reel:${user.id}`,
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  const body = (typeof req.body === 'object' && req.body) || {};
  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  const videoUrl = typeof body.video_url === 'string' ? body.video_url.trim() : '';

  if (!caption) return res.status(400).json({ ok: false, error: 'caption is required' });
  if (caption.length > MAX_CAPTION_LEN) {
    return res.status(400).json({ ok: false, error: `caption is too long (max ${MAX_CAPTION_LEN} chars)` });
  }
  const hashtagCount = (caption.match(/#\w+/g) || []).length;
  if (hashtagCount > MAX_HASHTAGS) {
    return res.status(400).json({ ok: false, error: `too many hashtags (max ${MAX_HASHTAGS}, you have ${hashtagCount})` });
  }
  if (!/^https?:\/\//i.test(videoUrl)) {
    return res.status(400).json({ ok: false, error: 'video_url must be http(s)://' });
  }
  try { new URL(videoUrl); } catch {
    return res.status(400).json({ ok: false, error: 'video_url is not a valid URL' });
  }

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
    return res.status(409).json({ ok: false, error: 'No active Instagram connection. Connect first.' });
  }

  let result;
  try {
    result = await runPublishReel({
      igBusinessAccountId: conn.ig_business_account_id,
      accessToken: conn.access_token,
      caption,
      videoUrl,
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

  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .update({ last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq('id', conn.id);

  logger.info('reel published', { restaurantId: user.restaurant_id, mediaId: result.mediaId });
  return res.status(200).json({
    ok: true,
    media_id: result.mediaId,
    permalink: result.permalink,
    post_kind: result.postKind,
  });
};

module.exports.config = { api: { bodyParser: { sizeLimit: '16kb' } } };

async function surfaceMetaError(res, stage, err, connId) {
  const isTokenInvalid = err instanceof MetaError && (err.code === 190 || err.status === 401);
  if (isTokenInvalid) {
    return res.status(401).json({ ok: false, error: 'Instagram token expired. Reconnect required.' });
  }

  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .update({
      last_error: `reel/${stage}: ${err.message}`.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connId);

  const errStatus = (err instanceof MetaError && err.status) || 502;
  logger.error('reel publish failed', { stage, code: err.code, msg: err.message });
  const payload = {
    ok: false,
    error: err.message,
    code: err.code ?? null,
    stage,
  };
  // status_polling timeouts expose the container_id so a future
  // /api/instagram/finalize-reel endpoint can resume from where we left off.
  if (stage === 'status_polling' && err.containerId) {
    payload.container_id = err.containerId;
  }
  return res.status(errStatus).json(payload);
}
