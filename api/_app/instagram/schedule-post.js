/**
 * POST   /api/instagram/schedule-post     — queue a post for a future time
 * GET    /api/instagram/schedule-post     — list this restaurant's queued posts
 * DELETE /api/instagram/schedule-post     — cancel a pending post by id
 *
 * The cron job (/api/cron/process-scheduled-ig-posts) picks up rows where
 * status='pending' AND scheduled_at <= now() and runs the standard publish
 * flow. Cron runs every 15 min so the actual post fires within 0-15 min of
 * scheduled_at — acceptable for the "post around lunchtime" use case.
 *
 * POST request:  { caption, image_urls: string[], scheduled_at: ISO string }
 * POST response: { ok: true, id, scheduled_at }
 *
 * GET response:  { ok: true, posts: [{ id, caption, image_urls, scheduled_at, status, ig_permalink, error }] }
 *
 * DELETE request: { id }
 * DELETE response: { ok: true, canceled: bool } — canceled=false if the row
 *                  had already moved past 'pending' (cron picked it up while
 *                  the user was clicking Cancel).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { CAROUSEL_MAX } = require('./_lib/publish-flow');

const logger = createSecureLogger('instagram-schedule-post');

const MAX_CAPTION_LEN = 2200;
const MAX_HASHTAGS = 30;
const MIN_LEAD_MS = 60 * 1000;            // can't schedule for less than 1 min from now
const MAX_LEAD_DAYS = 90;                 // 90 days max into the future
const MAX_LEAD_MS = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'POST') return handleCreate(req, res, user);
  if (req.method === 'GET')  return handleList(req, res, user);
  if (req.method === 'DELETE') return handleCancel(req, res, user);

  res.setHeader('Allow', 'POST, GET, DELETE, OPTIONS');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '32kb' } },
};

// ─── POST: queue a new scheduled post ───────────────────────────────────

async function handleCreate(req, res, user) {
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-schedule-post:${user.id}`,
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  const body = (typeof req.body === 'object' && req.body) || {};
  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  const scheduledAtRaw = typeof body.scheduled_at === 'string' ? body.scheduled_at : '';
  // media_type discriminates the cron worker's publish branch:
  //   'feed' (default — single image or carousel) uses image_urls[]
  //   'reel' uses video_url
  // We treat missing media_type as 'feed' for back-compat with old clients.
  const mediaTypeRaw = typeof body.media_type === 'string' ? body.media_type.toLowerCase() : 'feed';
  if (mediaTypeRaw !== 'feed' && mediaTypeRaw !== 'reel') {
    return res.status(400).json({ ok: false, error: "media_type must be 'feed' or 'reel'" });
  }
  const mediaType = mediaTypeRaw;
  const videoUrl = typeof body.video_url === 'string' ? body.video_url.trim() : '';
  const rawUrls = Array.isArray(body.image_urls) ? body.image_urls : [];
  const imageUrls = rawUrls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.length > 0);

  // Caption rules — same shape for feed AND reel (Meta enforces 2200 / 30 tags on both).
  if (!caption) return res.status(400).json({ ok: false, error: 'caption is required' });
  if (caption.length > MAX_CAPTION_LEN) {
    return res.status(400).json({ ok: false, error: `caption is too long (max ${MAX_CAPTION_LEN} chars)` });
  }
  const hashtagCount = (caption.match(/#\w+/g) || []).length;
  if (hashtagCount > MAX_HASHTAGS) {
    return res.status(400).json({ ok: false, error: `too many hashtags (max ${MAX_HASHTAGS}, you have ${hashtagCount})` });
  }

  if (mediaType === 'feed') {
    if (imageUrls.length === 0) return res.status(400).json({ ok: false, error: 'image_urls is required' });
    if (imageUrls.length > CAROUSEL_MAX) {
      return res.status(400).json({ ok: false, error: `too many images (max ${CAROUSEL_MAX})` });
    }
    for (let i = 0; i < imageUrls.length; i++) {
      const u = imageUrls[i];
      if (!/^https?:\/\//i.test(u)) {
        return res.status(400).json({ ok: false, error: `image url #${i + 1} must be http(s)://` });
      }
      try { new URL(u); } catch {
        return res.status(400).json({ ok: false, error: `image url #${i + 1} is not a valid URL` });
      }
    }
  } else {
    // reel
    if (!videoUrl) return res.status(400).json({ ok: false, error: 'video_url is required for reels' });
    if (!/^https?:\/\//i.test(videoUrl)) {
      return res.status(400).json({ ok: false, error: 'video_url must be http(s)://' });
    }
    try { new URL(videoUrl); } catch {
      return res.status(400).json({ ok: false, error: 'video_url is not a valid URL' });
    }
  }

  // scheduled_at: must parse, must be ≥1 min from now, ≤90d out.
  const scheduledAt = new Date(scheduledAtRaw);
  if (isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ ok: false, error: 'scheduled_at must be an ISO date string' });
  }
  const nowMs = Date.now();
  const leadMs = scheduledAt.getTime() - nowMs;
  if (leadMs < MIN_LEAD_MS) {
    return res.status(400).json({ ok: false, error: 'scheduled_at must be at least 1 minute in the future' });
  }
  if (leadMs > MAX_LEAD_MS) {
    return res.status(400).json({ ok: false, error: `scheduled_at can't be more than ${MAX_LEAD_DAYS} days from now` });
  }

  // Confirm there's an active IG connection — fail fast if not, so we
  // don't queue a post that'll definitely fail on the cron pass.
  const { data: conn, error: connErr } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .select('id, status')
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

  const { data: row, error: insertErr } = await supabaseAdmin
    .schema('restaurant')
    .from('scheduled_instagram_posts')
    .insert({
      restaurant_id: user.restaurant_id,
      caption,
      media_type: mediaType,
      // Feed posts populate image_urls (1-10), reels populate video_url.
      // The other column stays null per the C.21 migration that dropped
      // image_urls NOT NULL.
      image_urls: mediaType === 'feed' ? imageUrls : null,
      video_url: mediaType === 'reel' ? videoUrl : null,
      scheduled_at: scheduledAt.toISOString(),
      status: 'pending',
    })
    .select('id, scheduled_at')
    .single();
  if (insertErr) {
    logger.error('insert failed', { err: insertErr.message });
    return res.status(500).json({ ok: false, error: 'Could not schedule the post' });
  }

  logger.info('post scheduled', {
    restaurantId: user.restaurant_id, id: row.id, scheduledAt: row.scheduled_at,
    mediaType, imageCount: mediaType === 'feed' ? imageUrls.length : 0,
  });
  return res.status(200).json({ ok: true, id: row.id, scheduled_at: row.scheduled_at });
}

// ─── GET: list this restaurant's scheduled posts ────────────────────────

async function handleList(req, res, user) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('scheduled_instagram_posts')
    .select('id, caption, media_type, image_urls, video_url, scheduled_at, status, ig_permalink, error, attempts, created_at, completed_at')
    .eq('restaurant_id', user.restaurant_id)
    .order('scheduled_at', { ascending: true })
    .limit(50);

  if (error) {
    logger.error('list failed', { err: error.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
  return res.status(200).json({ ok: true, posts: data || [] });
}

// ─── DELETE: cancel a pending post (tenant-scoped + status-guarded) ────

// Bare RFC 4122 UUID shape — used to reject garbage ids before the
// Supabase UPDATE so a non-UUID can't cause a postgres cast error
// that surfaces to the UI as the cryptic "Database error".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleCancel(req, res, user) {
  // id arrives either in query string (RESTful) or body
  const idFromQuery = typeof req.query?.id === 'string' ? req.query.id : null;
  const idFromBody = req.body && typeof req.body === 'object' && typeof req.body.id === 'string' ? req.body.id : null;
  const id = idFromQuery || idFromBody;
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
  if (!UUID_RE.test(id)) {
    // Not a UUID — bail out with 404 so the UI's "already published"
    // info-toast path fires (canceled:false handling) instead of the
    // generic 500 "Database error" that postgres would otherwise emit.
    return res.status(200).json({ ok: true, canceled: false });
  }

  // Tenant scoping + status guard in one statement: only flip rows that
  // (a) belong to this restaurant and (b) are still 'pending'. If the
  // cron has already grabbed it, status is 'processing' and the UPDATE
  // matches zero rows — return canceled:false.
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('scheduled_instagram_posts')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', user.restaurant_id)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    logger.error('cancel failed', { err: error.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }

  const canceled = Array.isArray(data) && data.length > 0;
  return res.status(200).json({ ok: true, canceled });
}
