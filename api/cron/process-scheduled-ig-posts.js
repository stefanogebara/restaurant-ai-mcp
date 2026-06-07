/**
 * GET /api/cron/process-scheduled-ig-posts
 *
 * Cron worker (every 15 min) that publishes IG posts the user scheduled
 * via /api/instagram/schedule-post. The expected delivery window is
 * scheduled_at + 0-15 min — acceptable for the "lunch promo at 12:30"
 * use case.
 *
 * Locking
 * -------
 * Each candidate row is moved from 'pending' → 'processing' via a
 * tenant-unaware UPDATE...WHERE status='pending' AND id=... that's
 * scoped by claim_token. Postgres won't write the same row twice from
 * concurrent UPDATEs with the same WHERE clause + id, so even if two
 * cron runs overlap (the cadence is 15 min but a slow Meta call could
 * stretch a run), each row is processed exactly once.
 *
 * Per-restaurant fairness: we limit MAX_PER_RUN total but DON'T cap per
 * restaurant. If one restaurant has 30 due posts (unlikely — that'd
 * mean 30 scheduled posts in a 15-min window) they'll all process this
 * run. If we ever see noisy neighbors that's an easy follow-up: order
 * by scheduled_at then row_number per restaurant.
 *
 * Secured with CRON_SECRET, same pattern as the rest of /api/cron/*.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { runPublish, MetaError } = require('../instagram/_lib/publish-flow');

const logger = createSecureLogger('cron-process-scheduled-ig-posts');

const MAX_PER_RUN = 50;
const MAX_ATTEMPTS = 3;        // retry transient failures up to 3 times
const PROCESSING_TIMEOUT_MS = 60_000;  // stale 'processing' rows older than this get re-queued

module.exports = async (req, res) => {
  // Auth: Bearer CRON_SECRET (Vercel cron passes this; the kill switch
  // in cron_config also gates execution).
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // Optional kill switch in cron_config table (best effort — if the
  // table query fails for any reason, we proceed).
  try {
    const { data: cfg } = await supabaseAdmin
      .from('cron_config')
      .select('enabled')
      .eq('cron_name', 'process-scheduled-ig-posts')
      .maybeSingle();
    if (cfg && cfg.enabled === false) {
      return res.status(200).json({ ok: true, skipped: 'disabled-via-cron-config' });
    }
  } catch { /* table optional */ }

  // Re-queue stale 'processing' rows from prior crashed runs.
  const staleCutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS).toISOString();
  await supabaseAdmin
    .schema('restaurant')
    .from('scheduled_instagram_posts')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('processing_started_at', staleCutoff);

  // Fetch due candidates
  const { data: candidates, error: fetchErr } = await supabaseAdmin
    .schema('restaurant')
    .from('scheduled_instagram_posts')
    .select('id, restaurant_id, caption, image_urls, scheduled_at, attempts')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (fetchErr) {
    logger.error('candidate fetch failed', { err: fetchErr.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }

  if (!candidates || candidates.length === 0) {
    return res.status(200).json({ ok: true, processed: 0 });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let alreadyTaken = 0;

  for (const row of candidates) {
    // Try to claim the row — UPDATE pending → processing, guarded by id
    // AND status. If another concurrent run already claimed it, this
    // returns zero rows and we skip.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .schema('restaurant')
      .from('scheduled_instagram_posts')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        attempts: (row.attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id');

    if (claimErr) {
      logger.error('claim failed', { id: row.id, err: claimErr.message });
      failed += 1;
      continue;
    }
    if (!claimed || claimed.length === 0) {
      // Someone else got it first (concurrent cron run, retry, etc.)
      alreadyTaken += 1;
      continue;
    }

    processed += 1;
    const result = await processOne(row);
    if (result.ok) succeeded += 1;
    else failed += 1;
  }

  logger.info('cron run done', { candidates: candidates.length, processed, succeeded, failed, alreadyTaken });
  return res.status(200).json({ ok: true, candidates: candidates.length, processed, succeeded, failed, alreadyTaken });
};

/**
 * Publishes one scheduled row and updates its status. Never throws —
 * marks the row 'failed' on transient errors past MAX_ATTEMPTS, or
 * leaves it back at 'pending' for retry within the attempt budget.
 */
async function processOne(row) {
  // Re-fetch the connection for this restaurant. We don't trust a
  // connection cached from earlier in the loop — token could have
  // expired between rows.
  const { data: conn, error: connErr } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .select('id, ig_business_account_id, access_token, status')
    .eq('restaurant_id', row.restaurant_id)
    .eq('status', 'active')
    .maybeSingle();

  if (connErr || !conn) {
    return failRow(row, 'No active Instagram connection at processing time.', /* terminal */ true);
  }

  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls
    : (typeof row.image_urls === 'string' ? safeJsonArray(row.image_urls) : []);
  if (imageUrls.length === 0) {
    return failRow(row, 'image_urls missing or invalid', /* terminal */ true);
  }

  let result;
  try {
    result = await runPublish({
      igBusinessAccountId: conn.ig_business_account_id,
      accessToken: conn.access_token,
      caption: row.caption,
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
    // Token expired → terminal (no retry helps without a new token).
    const isTokenInvalid = err instanceof MetaError && (err.code === 190 || err.status === 401);
    const isTerminal = isTokenInvalid || row.attempts >= MAX_ATTEMPTS;
    return failRow(row, err.message || 'Publish failed', isTerminal);
  }

  // Success — update row
  const { error: updErr } = await supabaseAdmin
    .schema('restaurant')
    .from('scheduled_instagram_posts')
    .update({
      status: 'completed',
      ig_media_id: result.mediaId,
      ig_permalink: result.permalink,
      post_kind: result.postKind,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', row.id);
  if (updErr) {
    logger.error('success update failed', { id: row.id, err: updErr.message });
  }
  logger.info('scheduled post published', { id: row.id, mediaId: result.mediaId });
  return { ok: true };
}

async function failRow(row, message, terminal) {
  const status = terminal ? 'failed' : 'pending';
  // For non-terminal failures we re-queue the row by flipping status
  // back to 'pending'. The attempt counter has already been bumped at
  // claim time, so this row will only be retried until MAX_ATTEMPTS.
  await supabaseAdmin
    .schema('restaurant')
    .from('scheduled_instagram_posts')
    .update({
      status,
      error: String(message).slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  logger.warn('scheduled post failure', { id: row.id, terminal, msg: message });
  return { ok: false };
}

function safeJsonArray(s) {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
