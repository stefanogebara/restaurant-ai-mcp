/**
 * POST /api/instagram/upload-video
 *
 * Uploads a video file to Supabase Storage (the instagram-uploads
 * bucket — same place images live). Used by the Reels flow: the
 * returned URL goes straight into /api/instagram/publish-reel as the
 * video_url.
 *
 * Request: { filename, content_type, data_b64 }
 *   - filename: original filename, used only for the extension
 *   - content_type: must be video/mp4 or video/quicktime (.mov)
 *   - data_b64: base64-encoded body
 *
 * Limits (tighter than Meta's because Vercel function bodies are capped):
 *   - 32 MB hard cap on the raw video (~43 MB after b64 encode)
 *   - Meta caps single Reels at 100 MB / 90s / 1080p — anything that
 *     fits in 32 MB will be way under those, so we don't bother with
 *     per-codec / duration checks here.
 *
 * Response (success): { ok: true, url, path }
 * Response (failure): { ok: false, error }
 *
 * Tenancy: per-restaurant folder is taken FROM THE JWT, never client
 * input. Same defense as upload-image.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');

const logger = createSecureLogger('instagram-upload-video');

const BUCKET = 'instagram-uploads';
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_B64_LEN = Math.ceil(MAX_BYTES * 4 / 3) + 16;

const ALLOWED_CONTENT_TYPES = {
  'video/mp4':        'mp4',
  'video/quicktime':  'mov',
};

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

  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-upload-video:${user.id}`,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  const body = (typeof req.body === 'object' && req.body) || {};
  const contentType = typeof body.content_type === 'string' ? body.content_type.toLowerCase() : '';
  const dataB64 = typeof body.data_b64 === 'string' ? body.data_b64 : '';

  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext) {
    return res.status(400).json({
      ok: false,
      error: `content_type must be one of: ${Object.keys(ALLOWED_CONTENT_TYPES).join(', ')}`,
    });
  }
  if (!dataB64 || dataB64.length < 100) {
    return res.status(400).json({ ok: false, error: 'data_b64 is required' });
  }
  if (dataB64.length > MAX_B64_LEN) {
    return res.status(400).json({ ok: false, error: `video is too large (max ${MAX_BYTES / 1024 / 1024} MB)` });
  }

  let buf;
  try {
    buf = Buffer.from(dataB64, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'data_b64 is not valid base64' });
  }
  if (buf.length === 0) {
    return res.status(400).json({ ok: false, error: 'decoded video is empty' });
  }
  if (buf.length > MAX_BYTES) {
    return res.status(400).json({ ok: false, error: `video is too large (max ${MAX_BYTES / 1024 / 1024} MB)` });
  }

  const detected = sniffVideoType(buf);
  if (detected !== ext) {
    return res.status(400).json({
      ok: false,
      error: `content_type does not match file contents (claimed ${contentType}, detected ${detected || 'unknown'})`,
    });
  }

  const path = `${user.restaurant_id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buf, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });
  if (uploadErr) {
    logger.error('storage upload failed', { err: uploadErr.message, path });
    return res.status(500).json({ ok: false, error: 'Upload failed' });
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    return res.status(500).json({ ok: false, error: 'Could not resolve public URL' });
  }

  logger.info('video uploaded', { restaurantId: user.restaurant_id, path, bytes: buf.length });
  return res.status(200).json({ ok: true, url: pub.publicUrl, path });
};

module.exports.config = {
  // Slightly over our 32 MB cap so the JSON envelope fits without a 413.
  api: { bodyParser: { sizeLimit: '40mb' } },
};

/**
 * Detects video container format by reading magic bytes at well-known
 * offsets:
 *   - MP4 + MOV: "ftyp" box at offset 4 (bytes 4-7 spell out 'ftyp').
 *     The brand follows at offset 8: 'isom'/'mp42'/'avc1' for mp4 vs
 *     'qt  ' for QuickTime.
 *
 * Returns 'mp4' | 'mov' | null.
 */
function sniffVideoType(buf) {
  if (!buf || buf.length < 16) return null;
  // bytes 4-7 must be 'ftyp' (0x66 0x74 0x79 0x70)
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) return null;
  const brand = buf.slice(8, 12).toString('ascii');
  // QuickTime brand
  if (brand === 'qt  ' || brand.startsWith('qt')) return 'mov';
  // MP4 brand families — covers isom, mp41, mp42, M4V, avc1, iso2, dash, MSNV, etc.
  if (
    brand.startsWith('iso') ||
    brand.startsWith('mp4') ||
    brand.startsWith('avc') ||
    brand === 'M4V '  ||
    brand === 'msnv'  ||
    brand === 'dash'
  ) return 'mp4';
  // Default any other ftyp box to mp4 (Meta accepts MP4 most reliably,
  // and unknown ftyp brands are usually MP4 dialects).
  return 'mp4';
}

module.exports.__test__ = { sniffVideoType, ALLOWED_CONTENT_TYPES };
