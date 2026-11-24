/**
 * POST /api/instagram/generate-video        — start a video-gen job
 * GET  /api/instagram/generate-video?job_id  — poll job status
 *
 * Video generation is genuinely slow (60-120s for a 5s clip on
 * Higgsfield). That exceeds Vercel's 60s function cap, so we can't
 * just block the request like we do for image gen (C.16). Instead:
 *
 *   POST → kick off the job, return { job_id } immediately
 *   GET  → poll provider's job_status; when COMPLETED, download the
 *          video, upload to Supabase Storage, return { url }
 *   GET while in progress → return { status: 'processing', progress }
 *   GET on failure → return { status: 'failed', error }
 *
 * UI handles the polling loop (every 5s) and renders progress.
 *
 * Provider selection
 *   higgsfield  (default) — needs HIGGSFIELD_API_KEY
 *   Future: runway, kling, etc. Same job_id contract works for any
 *   async provider.
 *
 * Rate limit: 3 generations/hr/user — each costs ~$0.50-$1.00 of
 * compute, so the cap protects against a runaway client.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { logGenEvent } = require('./_lib/log-gen-event');

const logger = createSecureLogger('instagram-generate-video');

const BUCKET = 'instagram-uploads';
const MAX_PROMPT_LEN = 1000;
const MIN_PROMPT_LEN = 3;
const HIGGSFIELD_API = 'https://api.higgsfield.ai/v1';

const PROVIDERS = {
  higgsfield: {
    apiKeyEnv: 'HIGGSFIELD_API_KEY',
    label: 'Higgsfield',
    // Higgsfield's text-to-video endpoint. Their default model is
    // "video-2.5" — fast + cheap, good enough for Reels previews.
    defaultModel: 'video-2.5',
    // Cost snapshot at write time for the cost ledger (C.22). Higgsfield
    // video-2.5 5s clip ≈ $0.50. Stored in cents — update if pricing
    // shifts (historical rows preserve their snapshot cost).
    costCents: 50,
  },
};

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

  if (req.method === 'POST') return handleStart(req, res, user);
  if (req.method === 'GET') return handlePoll(req, res, user);
  res.setHeader('Allow', 'POST, GET, OPTIONS');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};

module.exports.config = { api: { bodyParser: { sizeLimit: '16kb' } } };

// ─── POST: kick off a job ───────────────────────────────────────────────

async function handleStart(req, res, user) {
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-generate-video:${user.id}`,
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  const body = (typeof req.body === 'object' && req.body) || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const providerKey = typeof body.provider === 'string' && body.provider in PROVIDERS ? body.provider : 'higgsfield';

  if (prompt.length < MIN_PROMPT_LEN) {
    return res.status(400).json({ ok: false, error: `prompt must be at least ${MIN_PROMPT_LEN} characters` });
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    return res.status(400).json({ ok: false, error: `prompt is too long (max ${MAX_PROMPT_LEN} chars)` });
  }

  const provider = PROVIDERS[providerKey];
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: `${provider.label} is not configured on this server. Try another provider.`,
    });
  }

  let job;
  try {
    if (providerKey === 'higgsfield') {
      job = await startHiggsfieldJob({ apiKey, prompt });
    } else {
      throw new Error(`unknown provider ${providerKey}`);
    }
  } catch (err) {
    logger.error('start failed', { provider: providerKey, err: err.message });
    return res.status(502).json({ ok: false, error: `Could not start job: ${err.message}` });
  }

  // Persist (provider, provider_job_id, restaurant_id) so GET can look
  // it up + enforce tenant scoping later.
  const localJobId = crypto.randomUUID();
  const { error: insertErr } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_video_jobs')
    .insert({
      id: localJobId,
      restaurant_id: user.restaurant_id,
      provider: providerKey,
      provider_job_id: job.id,
      prompt,
      status: 'processing',
    });
  if (insertErr) {
    logger.error('job persist failed', { err: insertErr.message });
    return res.status(500).json({ ok: false, error: 'Could not record job' });
  }

  return res.status(200).json({ ok: true, job_id: localJobId });
}

// ─── GET: poll a job ────────────────────────────────────────────────────

async function handlePoll(req, res, user) {
  const jobId = typeof req.query?.job_id === 'string' ? req.query.job_id : null;
  if (!jobId) return res.status(400).json({ ok: false, error: 'job_id is required' });
  // UUID guard — same lesson as schedule-post cancel (commit 100cd65c).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return res.status(404).json({ ok: false, error: 'Job not found' });
  }

  const { data: row, error: fetchErr } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_video_jobs')
    .select('id, restaurant_id, provider, provider_job_id, prompt, status, video_url, error, created_at')
    .eq('id', jobId)
    .eq('restaurant_id', user.restaurant_id)
    .maybeSingle();
  if (fetchErr || !row) {
    return res.status(404).json({ ok: false, error: 'Job not found' });
  }

  // If we already finalized, return cached result.
  if (row.status === 'completed') {
    return res.status(200).json({ ok: true, status: 'completed', url: row.video_url });
  }
  if (row.status === 'failed') {
    return res.status(200).json({ ok: true, status: 'failed', error: row.error || 'unknown failure' });
  }

  // Still processing — poll the provider
  const apiKey = process.env[PROVIDERS[row.provider].apiKeyEnv];
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: 'Provider not configured' });
  }

  let pollResult;
  try {
    if (row.provider === 'higgsfield') {
      pollResult = await pollHiggsfieldJob({ apiKey, providerJobId: row.provider_job_id });
    } else {
      throw new Error(`unknown provider ${row.provider}`);
    }
  } catch (err) {
    logger.error('poll failed', { jobId, err: err.message });
    return res.status(502).json({ ok: false, error: `Poll failed: ${err.message}` });
  }

  if (pollResult.status === 'processing') {
    return res.status(200).json({ ok: true, status: 'processing', progress: pollResult.progress ?? null });
  }
  if (pollResult.status === 'failed') {
    await supabaseAdmin
      .schema('restaurant')
      .from('instagram_video_jobs')
      .update({ status: 'failed', error: (pollResult.error || 'failed').slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return res.status(200).json({ ok: true, status: 'failed', error: pollResult.error });
  }

  // COMPLETED — download the video from provider, upload to our Storage,
  // record the public URL, return it.
  let publicUrl;
  try {
    publicUrl = await downloadAndStash({
      sourceUrl: pollResult.videoUrl,
      restaurantId: user.restaurant_id,
    });
  } catch (err) {
    logger.error('stash failed', { jobId, err: err.message });
    await supabaseAdmin
      .schema('restaurant')
      .from('instagram_video_jobs')
      .update({ status: 'failed', error: `stash: ${err.message}`.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return res.status(502).json({ ok: false, error: `Could not stash video: ${err.message}` });
  }

  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_video_jobs')
    .update({ status: 'completed', video_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  logger.info('video job completed', { jobId, restaurantId: user.restaurant_id });

  // Cost ledger (C.22). Fire-and-forget — never block the user.
  const providerCfg = PROVIDERS[row.provider] || {};
  void logGenEvent({
    restaurantId: user.restaurant_id,
    kind: 'video',
    provider: row.provider,
    model: providerCfg.defaultModel || row.provider,
    costCents: providerCfg.costCents || 0,
    promptChars: typeof row.prompt === 'string' ? row.prompt.length : 0,
    assetUrl: publicUrl,
  });

  return res.status(200).json({ ok: true, status: 'completed', url: publicUrl });
}

// ─── Higgsfield REST ────────────────────────────────────────────────────

async function startHiggsfieldJob({ apiKey, prompt }) {
  const resp = await fetch(`${HIGGSFIELD_API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      type: 'text_to_video',
      model: PROVIDERS.higgsfield.defaultModel,
      prompt,
      duration: 5,        // seconds — cheapest tier, good for Reels intros
      aspect_ratio: '9:16', // vertical for Reels
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => null);
    throw new Error(errBody?.error?.message || errBody?.message || `Higgsfield HTTP ${resp.status}`);
  }
  const body = await resp.json();
  const id = body?.id || body?.job_id;
  if (!id) throw new Error('Higgsfield response had no job id');
  return { id };
}

async function pollHiggsfieldJob({ apiKey, providerJobId }) {
  const resp = await fetch(`${HIGGSFIELD_API}/jobs/${providerJobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => null);
    throw new Error(errBody?.error?.message || `Higgsfield HTTP ${resp.status}`);
  }
  const body = await resp.json();
  const upstreamStatus = String(body?.status || '').toUpperCase();
  if (upstreamStatus === 'COMPLETED' || upstreamStatus === 'SUCCESS' || upstreamStatus === 'FINISHED') {
    const url = body?.output?.video_url || body?.result?.video_url || body?.video_url;
    if (!url) throw new Error('Higgsfield completed but returned no video_url');
    return { status: 'completed', videoUrl: url };
  }
  if (upstreamStatus === 'FAILED' || upstreamStatus === 'ERROR' || upstreamStatus === 'CANCELED') {
    return { status: 'failed', error: body?.error?.message || body?.error || 'Higgsfield job failed' };
  }
  // PROCESSING / QUEUED / IN_PROGRESS / etc.
  return { status: 'processing', progress: typeof body?.progress === 'number' ? body.progress : null };
}

// ─── Stash to Supabase Storage ──────────────────────────────────────────

async function downloadAndStash({ sourceUrl, restaurantId }) {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
  const ab = await resp.arrayBuffer();
  const buf = Buffer.from(ab);

  // Trust the provider's content-type; default to mp4
  let ext = 'mp4';
  let contentType = resp.headers.get('content-type') || 'video/mp4';
  if (contentType.includes('quicktime')) ext = 'mov';

  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType, upsert: false, cacheControl: '3600' });
  if (error) throw new Error(error.message);

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error('no public URL');
  return pub.publicUrl;
}

module.exports.__test__ = { PROVIDERS };
