/**
 * Restaurant cover photo — upload / remove.
 *
 * POST   { image: <base64 data-url or raw base64>, content_type? }
 *        → validates type + size, uploads to restaurant-photos/{rid}/cover.<ext>,
 *          saves the public URL to restaurant_config.cover_image_url.
 * DELETE → removes the storage object + nulls the column.
 *
 * Server-side upload (vs direct client→storage) keeps the bucket write path
 * behind the service role: no storage RLS policies to maintain, and the
 * 5 MB / mime-type caps are enforced both here AND on the bucket itself.
 *
 * The cover_image_url column ships in supabase/migrations/20260609_cover_image_url.sql.
 * Until that migration is applied, the column-update step returns a clear
 * 503 "migration pending" instead of a generic 500 — the storage upload
 * still succeeds, so re-running after the migration just overwrites.
 */

const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors } = require('./_lib/cors');
const { applySecurityHeaders } = require('./_lib/security-headers');

const logger = createSecureLogger('restaurant-photo');

const BUCKET = 'restaurant-photos';
const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket-level fileSizeLimit
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

module.exports = async (req, res) => {
  setInternalCors(req, res);
  applySecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (await checkAndApplyRateLimit(req, res, 'api')) return;
  if (req.method === 'POST') return handleUpload(req, res);
  if (req.method === 'DELETE') return handleRemove(req, res);
  return res.status(405).json({ success: false, error: 'Method not allowed' });
};

async function handleUpload(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const restaurantId = user.restaurant_id;

    const { image, content_type: bodyContentType } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'image (base64) is required' });
    }

    // Accept both data-URLs ("data:image/jpeg;base64,...") and raw base64.
    let contentType = bodyContentType;
    let b64 = image;
    const dataUrlMatch = image.match(/^data:([a-z/+.-]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      contentType = dataUrlMatch[1].toLowerCase();
      b64 = dataUrlMatch[2];
    }

    const ext = ALLOWED_TYPES[contentType];
    if (!ext) {
      return res.status(400).json({
        success: false,
        error: `Unsupported image type "${contentType || 'unknown'}". Use JPEG, PNG or WebP.`,
      });
    }

    let buffer;
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid base64 payload' });
    }
    if (buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Empty image payload' });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Image too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
      });
    }

    // Fixed object key per restaurant — a new upload replaces the old photo,
    // no orphan cleanup needed. Cache-bust via updated_at query param on read.
    const objectPath = `${restaurantId}/cover.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (uploadError) {
      logger.error('storage upload failed', { restaurantId, error: uploadError.message });
      return res.status(500).json({ success: false, error: 'Upload failed. Please try again.' });
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);
    // Append a timestamp so the booking page's <img> busts any CDN/browser
    // cache when the owner replaces the photo (the object path is constant).
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ cover_image_url: publicUrl })
      .eq('id', restaurantId);
    if (updateError) {
      // Column not migrated yet — distinguishable, actionable message.
      if (/cover_image_url.*does not exist|column .* does not exist/i.test(updateError.message)) {
        logger.error('cover_image_url column missing — migration pending', { restaurantId });
        return res.status(503).json({
          success: false,
          error: 'Photo storage is being upgraded. Try again in a few minutes.',
          migration_pending: true,
        });
      }
      logger.error('cover_image_url update failed', { restaurantId, error: updateError.message });
      return res.status(500).json({ success: false, error: 'Failed to save photo URL' });
    }

    return res.json({ success: true, cover_image_url: publicUrl });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    logger.error('restaurant-photo upload error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}

async function handleRemove(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const restaurantId = user.restaurant_id;

    // Remove all known extensions — the owner may have re-uploaded with a
    // different type over time and we only track the latest URL.
    const paths = Object.values(ALLOWED_TYPES).map((ext) => `${restaurantId}/cover.${ext}`);
    const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
    if (removeError) {
      // Non-fatal: object may simply not exist. Still null the column.
      logger.warn?.('storage remove warning', { restaurantId, error: removeError.message });
    }

    const { error: updateError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ cover_image_url: null })
      .eq('id', restaurantId);
    if (updateError && !/does not exist/i.test(updateError.message)) {
      logger.error('cover_image_url clear failed', { restaurantId, error: updateError.message });
      return res.status(500).json({ success: false, error: 'Failed to remove photo' });
    }

    return res.json({ success: true });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    logger.error('restaurant-photo remove error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
