/**
 * POST /api/instagram/generate-image
 *
 * Generates an image from a text prompt using one of the supported
 * providers, uploads the result to Supabase Storage (same bucket as
 * user uploads — public read so Meta's ingest can fetch it), and
 * returns the URL. The drafter's post form auto-fills the image_urls
 * list on success.
 *
 * Request: { prompt, model?, size? }
 *   model: 'gpt-image-1' (default — OpenAI) | 'nano-banana' (Google Gemini
 *          2.5 Flash Image — codename nano-banana)
 *   size:  '1024x1024' (default, square) — note: Gemini ignores size
 *          (it always returns ~1024x1024)
 *
 * Response: { ok: true, url, model, cost_cents }
 *           { ok: false, error }
 *
 * Rate limits: 10 generations/hr/user. These calls cost real money
 * (~4¢ each), so we keep the rate well below "someone scripts an
 * abuse attempt" while still allowing creative experimentation.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { logGenEvent } = require('./_lib/log-gen-event');

const logger = createSecureLogger('instagram-generate-image');

const BUCKET = 'instagram-uploads';
const MAX_PROMPT_LEN = 1000;
const MIN_PROMPT_LEN = 3;
const GENERATION_TIMEOUT_MS = 60_000;  // image gen is async + can take 20-40s

const MODELS = {
  // OpenAI gpt-image-1 — standard image model
  'gpt-image-1': {
    provider: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    costCents: 4,
    label: 'GPT Image',
  },
  // Google Gemini 2.5 Flash Image, codename "nano-banana"
  'nano-banana': {
    provider: 'gemini',
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    costCents: 4,
    label: 'Nano Banana (Gemini)',
  },
};

const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);
const DEFAULT_SIZE = '1024x1024';

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

  // 10/hr/user — each call costs ~$0.04 so a runaway script costs $0.40/hr
  // before this rate limit clamps it.
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-generate-image:${user.id}`,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  const body = (typeof req.body === 'object' && req.body) || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const modelKey = typeof body.model === 'string' && body.model in MODELS ? body.model : 'gpt-image-1';
  const sizeRaw = typeof body.size === 'string' ? body.size : DEFAULT_SIZE;
  const size = ALLOWED_SIZES.has(sizeRaw) ? sizeRaw : DEFAULT_SIZE;

  if (prompt.length < MIN_PROMPT_LEN) {
    return res.status(400).json({ ok: false, error: `prompt must be at least ${MIN_PROMPT_LEN} characters` });
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    return res.status(400).json({ ok: false, error: `prompt is too long (max ${MAX_PROMPT_LEN} chars)` });
  }

  const modelCfg = MODELS[modelKey];
  const apiKey = process.env[modelCfg.apiKeyEnv];
  if (!apiKey) {
    logger.error('missing API key for model', { model: modelKey, envVar: modelCfg.apiKeyEnv });
    return res.status(503).json({
      ok: false,
      error: `${modelCfg.label} is not configured on this server. Try another model.`,
    });
  }

  let buf;
  let detectedExt = 'png';
  try {
    if (modelCfg.provider === 'openai') {
      ({ buf, ext: detectedExt } = await generateOpenAI({ apiKey, prompt, size }));
    } else if (modelCfg.provider === 'gemini') {
      ({ buf, ext: detectedExt } = await generateGemini({ apiKey, prompt }));
    } else {
      throw new Error(`unknown provider ${modelCfg.provider}`);
    }
  } catch (err) {
    logger.error('generation failed', { model: modelKey, err: err.message });
    return res.status(502).json({ ok: false, error: `Generation failed: ${err.message}` });
  }

  if (!buf || buf.length === 0) {
    return res.status(502).json({ ok: false, error: 'Provider returned an empty image' });
  }

  // Upload to the same bucket as user uploads. Path scoped by restaurant_id
  // from the JWT (not the client) so a compromised UI can't cross-tenant write.
  const path = `${user.restaurant_id}/${crypto.randomUUID()}.${detectedExt}`;
  const contentType = detectedExt === 'webp' ? 'image/webp'
                    : detectedExt === 'jpg'  ? 'image/jpeg'
                    : 'image/png';

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buf, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });
  if (uploadErr) {
    logger.error('storage upload failed', { err: uploadErr.message, path });
    return res.status(500).json({ ok: false, error: 'Upload of generated image failed' });
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    return res.status(500).json({ ok: false, error: 'Could not resolve public URL' });
  }

  logger.info('image generated', {
    restaurantId: user.restaurant_id,
    model: modelKey,
    promptLen: prompt.length,
    bytes: buf.length,
  });

  // Fire-and-forget cost ledger (C.22). Don't await — a logging failure
  // shouldn't block the user's gen response.
  void logGenEvent({
    restaurantId: user.restaurant_id,
    kind: 'image',
    provider: modelCfg.provider,
    model: modelKey,
    costCents: modelCfg.costCents,
    promptChars: prompt.length,
    assetUrl: pub.publicUrl,
  });

  return res.status(200).json({
    ok: true,
    url: pub.publicUrl,
    model: modelKey,
    cost_cents: modelCfg.costCents,
  });
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '16kb' } },
};

// ─── Providers ──────────────────────────────────────────────────────────

async function generateOpenAI({ apiKey, prompt, size }) {
  const resp = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size,
      n: 1,
      quality: 'low',  // low = ~$0.011, medium ~$0.04, high ~$0.17. Low is plenty for IG previews.
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => null);
    const message = errBody?.error?.message || `OpenAI HTTP ${resp.status}`;
    throw new Error(message);
  }
  const body = await resp.json();
  const item = body?.data?.[0];
  if (!item) throw new Error('OpenAI returned no image');
  // gpt-image-1 returns b64_json by default (NOT a URL). Decode it.
  if (item.b64_json) {
    return { buf: Buffer.from(item.b64_json, 'base64'), ext: 'png' };
  }
  // Fallback if API returns a URL (older response_format)
  if (item.url) {
    const imgResp = await fetchWithTimeout(item.url);
    if (!imgResp.ok) throw new Error(`Fetch image URL: HTTP ${imgResp.status}`);
    const ab = await imgResp.arrayBuffer();
    return { buf: Buffer.from(ab), ext: 'png' };
  }
  throw new Error('OpenAI response had neither b64_json nor url');
}

async function generateGemini({ apiKey, prompt }) {
  // Gemini 2.5 Flash Image ("nano-banana") via Generative Language API.
  // The model returns inlineData parts with mimeType + base64 data.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => null);
    const message = errBody?.error?.message || `Gemini HTTP ${resp.status}`;
    throw new Error(message);
  }
  const body = await resp.json();
  const parts = body?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/png';
      const ext = mime.includes('webp') ? 'webp' : mime.includes('jpeg') ? 'jpg' : 'png';
      return { buf: Buffer.from(part.inlineData.data, 'base64'), ext };
    }
  }
  // If the model produced only text (e.g. safety refusal) surface it.
  const textParts = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join(' ').trim();
  if (textParts) throw new Error(`Gemini returned text instead of an image: ${textParts.slice(0, 200)}`);
  throw new Error('Gemini returned no image data');
}

async function fetchWithTimeout(url, opts) {
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), GENERATION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: aborter.signal });
  } finally {
    clearTimeout(timer);
  }
}

module.exports.__test__ = { MODELS, ALLOWED_SIZES };
