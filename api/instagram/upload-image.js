/**
 * POST /api/instagram/upload-image
 *
 * Accepts a base64-encoded image, validates it, writes it to Supabase
 * Storage at instagram-uploads/{restaurant_id}/{uuid}.{ext}, and returns
 * the public URL. The drafter UI then auto-fills the image_url field on
 * the publish form with this URL, so the user can post without having
 * to host their own image.
 *
 * Request: { filename, content_type, data_b64 }
 *   - filename: original filename — used only for the extension
 *   - content_type: must be image/jpeg, image/png, or image/webp
 *   - data_b64: base64-encoded body
 *
 * Response (success): { ok: true, url, path }
 * Response (failure): { ok: false, error }
 *
 * Why base64 in JSON instead of multipart: Vercel's serverless body parser
 * handles JSON natively; multipart requires either a heavy parser dep or
 * disabling the body parser + manual stream handling (the same dance we
 * did for the Stripe Connect webhook). Base64 inflates 33% but our
 * 4 MB limit + Vercel's ~4.5 MB JSON body limit still works for typical
 * camera photos (1-3 MB).
 *
 * Tenancy: the per-restaurant folder is taken FROM THE JWT, never from
 * client input. A compromised UI can't make a user upload into another
 * restaurant's folder.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');

const logger = createSecureLogger('instagram-upload-image');

const BUCKET = 'instagram-uploads';

// Slightly under Vercel's hard JSON body limit so we fail FAST with a
// useful error instead of letting Vercel return its generic 413.
const MAX_BYTES = 4 * 1024 * 1024;            // 4 MB
const MAX_B64_LEN = Math.ceil(MAX_BYTES * 4 / 3) + 16;

const ALLOWED_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
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

  // 20 uploads/hour/user — generous enough for normal posting cadence,
  // tight enough that a malicious or buggy client can't fill storage.
  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-upload-image:${user.id}`,
    limit: 20,
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
    return res.status(400).json({ ok: false, error: `image is too large (max ${MAX_BYTES / 1024 / 1024} MB)` });
  }

  let buf;
  try {
    buf = Buffer.from(dataB64, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'data_b64 is not valid base64' });
  }
  if (buf.length === 0) {
    return res.status(400).json({ ok: false, error: 'decoded image is empty' });
  }
  if (buf.length > MAX_BYTES) {
    return res.status(400).json({ ok: false, error: `image is too large (max ${MAX_BYTES / 1024 / 1024} MB)` });
  }

  // Verify the actual bytes match the claimed content_type. Stops a
  // client from uploading a script.js with content_type: 'image/png'.
  const detected = sniffImageType(buf);
  if (detected !== ext) {
    return res.status(400).json({
      ok: false,
      error: `content_type does not match file contents (claimed ${contentType}, detected ${detected || 'unknown'})`,
    });
  }

  // Path: restaurant_id from JWT (never client), random UUID, correct ext.
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
    logger.error('getPublicUrl returned no url', { path });
    return res.status(500).json({ ok: false, error: 'Could not resolve public URL' });
  }

  logger.info('image uploaded', { restaurantId: user.restaurant_id, path, bytes: buf.length });
  return res.status(200).json({ ok: true, url: pub.publicUrl, path });
};

module.exports.config = {
  // 5 MB body limit — slightly over our 4 MB image limit so the JSON
  // envelope (filename + content_type fields) fits without a 413.
  api: { bodyParser: { sizeLimit: '5mb' } },
};

/**
 * Detects the actual image format by inspecting the first few bytes.
 * Defends against an attacker setting content_type: image/png but
 * actually uploading executable JS / HTML. Meta would presumably reject
 * a malformed image too, but we shouldn't be storing it in the first
 * place.
 *
 * Returns the same extension keys as ALLOWED_CONTENT_TYPES, or null
 * when the magic bytes don't match any known image format.
 */
function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png';
  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp';
  return null;
}

// Exposed for unit tests
module.exports.__test__ = { sniffImageType, ALLOWED_CONTENT_TYPES };
