/**
 * Shared Instagram publish flow used by:
 *   - api/instagram/publish-post.js     (manual / "Post now")
 *   - api/cron/process-scheduled-ig-posts.js  (C.15 scheduled posts)
 *
 * Implements Meta's container flow for both single-image and carousel
 * posts and resolves the permalink. Returns a structured result so the
 * caller can decide how to surface success/failure (HTTP response for
 * manual, DB row update for cron).
 */

const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('instagram-publish-flow');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const PUBLISH_TIMEOUT_MS = 20_000;
const CAROUSEL_MIN = 2;
const CAROUSEL_MAX = 10;

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

/**
 * Runs the full publish flow for a given IG connection + content.
 * Throws MetaError on any Graph failure (caller decides how to react —
 * surface to user, mark scheduled row failed, etc.). Returns
 * { mediaId, permalink (nullable), postKind, imageCount } on success.
 *
 * tokenInvalidCallback is invoked (without throwing) when Meta returns
 * an auth error so the caller can flip connection.status='expired' even
 * before re-throwing the MetaError.
 */
async function runPublish({ igBusinessAccountId, accessToken, caption, imageUrls, tokenInvalidCallback }) {
  if (!igBusinessAccountId || !accessToken) {
    throw new Error('runPublish: igBusinessAccountId + accessToken required');
  }
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error('runPublish: imageUrls must be a non-empty array');
  }
  if (imageUrls.length > CAROUSEL_MAX) {
    throw new Error(`runPublish: too many images (max ${CAROUSEL_MAX})`);
  }
  const postKind = imageUrls.length >= CAROUSEL_MIN ? 'carousel' : 'single';

  const handleMetaErr = async (err) => {
    if (err instanceof MetaError && (err.code === 190 || err.status === 401) && typeof tokenInvalidCallback === 'function') {
      try { await tokenInvalidCallback(err); } catch (cbErr) {
        logger.warn('tokenInvalidCallback threw', { err: cbErr.message });
      }
    }
  };

  let containerId;
  try {
    if (postKind === 'single') {
      containerId = await createMediaContainer({
        igId: igBusinessAccountId, token: accessToken, imageUrl: imageUrls[0], caption,
      });
    } else {
      const childIds = await Promise.all(
        imageUrls.map((imageUrl) =>
          createMediaContainer({ igId: igBusinessAccountId, token: accessToken, imageUrl, isCarouselItem: true }),
        ),
      );
      containerId = await createCarouselContainer({
        igId: igBusinessAccountId, token: accessToken, childIds, caption,
      });
    }
  } catch (err) {
    await handleMetaErr(err);
    err.stage = 'container_create';
    throw err;
  }

  let mediaId;
  try {
    mediaId = await publishMediaContainer({ igId: igBusinessAccountId, token: accessToken, containerId });
  } catch (err) {
    await handleMetaErr(err);
    err.stage = 'publish';
    throw err;
  }

  let permalink = null;
  try {
    permalink = await fetchPermalink({ mediaId, token: accessToken });
  } catch (err) {
    logger.warn('permalink fetch failed (non-fatal)', { err: err.message });
  }

  return { mediaId, permalink, postKind, imageCount: imageUrls.length };
}

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
  if (!resp.ok || !body?.id) throw normalizeMetaError(body, resp.status);
  return body.id;
}

async function createCarouselContainer({ igId, token, childIds, caption }) {
  const url = new URL(`${GRAPH_BASE}/${igId}/media`);
  url.searchParams.set('media_type', 'CAROUSEL');
  url.searchParams.set('children', childIds.join(','));
  if (caption) url.searchParams.set('caption', caption);
  url.searchParams.set('access_token', token);

  const resp = await fetchWithTimeout(url.toString(), { method: 'POST' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.id) throw normalizeMetaError(body, resp.status);
  return body.id;
}

async function publishMediaContainer({ igId, token, containerId }) {
  const url = new URL(`${GRAPH_BASE}/${igId}/media_publish`);
  url.searchParams.set('creation_id', containerId);
  url.searchParams.set('access_token', token);

  const resp = await fetchWithTimeout(url.toString(), { method: 'POST' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.id) throw normalizeMetaError(body, resp.status);
  return body.id;
}

async function fetchPermalink({ mediaId, token }) {
  const url = `${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`;
  const resp = await fetchWithTimeout(url, { method: 'GET' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.permalink) throw new Error(body?.error?.message || `HTTP ${resp.status}`);
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

function normalizeMetaError(body, httpStatus) {
  const e = body?.error || {};
  return new MetaError(e.message || `HTTP ${httpStatus}`, {
    code: e.code,
    subcode: e.error_subcode,
    fbtraceId: e.fbtrace_id,
    status: httpStatus,
  });
}

/**
 * Reels-specific publish flow. Reels differ from feed posts in two ways:
 *   1. Container creation takes media_type=REELS + video_url (no
 *      is_carousel_item, no image_url).
 *   2. Meta processes the video asynchronously — status_code goes
 *      IN_PROGRESS → FINISHED (success) or ERROR (failure). We MUST
 *      poll until FINISHED before calling media_publish, otherwise
 *      Meta rejects with a confusing error.
 *
 * Returns { mediaId, permalink, postKind: 'reel' } on success.
 *
 * Throws MetaError on Graph failures (with .stage set:
 * 'container_create' | 'status_polling' | 'publish'). Caller decides
 * whether to retry or surface to user.
 *
 * Note on timeout: this CAN take up to 90s for a typical 30s reel.
 * Vercel's serverless functions cap at 60s. If you hit the
 * REELS_POLL_TIMEOUT_MS (50s leaving 10s buffer for publish + permalink),
 * we throw 'video processing taking longer than expected' and the caller
 * surfaces it. Future work: split into queue + worker so we don't block
 * the request.
 */
async function runPublishReel({ igBusinessAccountId, accessToken, caption, videoUrl, tokenInvalidCallback }) {
  if (!igBusinessAccountId || !accessToken) {
    throw new Error('runPublishReel: igBusinessAccountId + accessToken required');
  }
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new Error('runPublishReel: videoUrl required');
  }

  const handleMetaErr = async (err) => {
    if (err instanceof MetaError && (err.code === 190 || err.status === 401) && typeof tokenInvalidCallback === 'function') {
      try { await tokenInvalidCallback(err); } catch { /* swallow */ }
    }
  };

  // Step 1: create the REELS container
  let containerId;
  try {
    containerId = await createReelContainer({
      igId: igBusinessAccountId, token: accessToken, videoUrl, caption,
    });
  } catch (err) {
    await handleMetaErr(err);
    err.stage = 'container_create';
    throw err;
  }

  // Step 2: poll status_code until FINISHED. Meta typically takes
  // 20-60s for a 30s reel; we cap at 50s here so we leave headroom
  // for the publish + permalink calls inside Vercel's 60s function cap.
  try {
    await waitForContainerReady({
      containerId,
      token: accessToken,
      timeoutMs: REELS_POLL_TIMEOUT_MS,
      pollIntervalMs: REELS_POLL_INTERVAL_MS,
    });
  } catch (err) {
    await handleMetaErr(err);
    err.stage = 'status_polling';
    err.containerId = containerId;  // expose so caller can retry just the publish later
    throw err;
  }

  // Step 3: publish the container
  let mediaId;
  try {
    mediaId = await publishMediaContainer({ igId: igBusinessAccountId, token: accessToken, containerId });
  } catch (err) {
    await handleMetaErr(err);
    err.stage = 'publish';
    throw err;
  }

  let permalink = null;
  try {
    permalink = await fetchPermalink({ mediaId, token: accessToken });
  } catch (err) {
    logger.warn('reel permalink fetch failed (non-fatal)', { err: err.message });
  }

  return { mediaId, permalink, postKind: 'reel' };
}

async function createReelContainer({ igId, token, videoUrl, caption }) {
  const url = new URL(`${GRAPH_BASE}/${igId}/media`);
  url.searchParams.set('media_type', 'REELS');
  url.searchParams.set('video_url', videoUrl);
  // share_to_feed=true makes the reel also appear in the feed (the
  // default behavior most users expect when they think "post a reel").
  url.searchParams.set('share_to_feed', 'true');
  if (caption) url.searchParams.set('caption', caption);
  url.searchParams.set('access_token', token);

  const resp = await fetchWithTimeout(url.toString(), { method: 'POST' });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.id) throw normalizeMetaError(body, resp.status);
  return body.id;
}

/**
 * Polls Meta's container status_code until it reaches FINISHED (success)
 * or ERROR/EXPIRED (terminal failure). Times out with a MetaError if
 * processing exceeds timeoutMs.
 *
 * status_code values:
 *   IN_PROGRESS — still processing (keep polling)
 *   FINISHED    — ready to publish
 *   ERROR       — terminal failure (Meta gives a reason in status field)
 *   EXPIRED     — container was too old (24h cap on Meta's end)
 */
async function waitForContainerReady({ containerId, token, timeoutMs, pollIntervalMs }) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const url = `${GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
    const resp = await fetchWithTimeout(url, { method: 'GET' });
    const body = await resp.json().catch(() => null);
    if (!resp.ok) throw normalizeMetaError(body, resp.status);
    const code = body?.status_code;
    lastStatus = body?.status || null;
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new MetaError(`Reel processing ${code}: ${lastStatus || 'no detail'}`, { status: 502 });
    }
    // IN_PROGRESS or anything else → wait and retry
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new MetaError(
    `Reel still processing after ${Math.round(timeoutMs / 1000)}s. Meta status: ${lastStatus || 'unknown'}. Try again in a minute.`,
    { status: 504 },
  );
}

const REELS_POLL_TIMEOUT_MS = 50_000;   // leave 10s for publish + permalink inside the 60s function cap
const REELS_POLL_INTERVAL_MS = 4_000;   // 4s between polls — ~12 polls total in the timeout window

module.exports = { runPublish, runPublishReel, MetaError, CAROUSEL_MIN, CAROUSEL_MAX };
