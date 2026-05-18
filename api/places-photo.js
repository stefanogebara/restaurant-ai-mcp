/**
 * Google Places Photo Redirect
 *
 * GET /api/places-photo?ref=<photo_resource_name>&maxWidth=<px>
 *
 * The scrape-restaurant endpoint captures `photo_ref` (= place.photos[0].name,
 * shaped like "places/PLACE_ID/photos/PHOTO_RESOURCE_ID") but never used it
 * because Google Places v1 requires the API key on the photo media call —
 * we can't expose that key in the browser.
 *
 * This endpoint:
 *   1. Validates the ref against a strict regex (no SSRF, no key leak).
 *   2. Hits Google's media endpoint with `skipHttpRedirect=true`, which
 *      returns JSON `{ photoUri: "https://..." }` instead of the binary.
 *   3. Returns a 302 redirect to that photoUri so the browser fetches the
 *      bytes directly from Google's CDN — no bandwidth through Vercel,
 *      no GB-hours billed for streaming images.
 *   4. Sets a long cache header on the 302 so Vercel's edge cache absorbs
 *      repeat requests (the photoUri itself is short-lived, but a 302 to a
 *      fresh photoUri every 24h is fine).
 *
 * Public endpoint, rate-limited.
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('PlacesPhoto');

// Google Places v1 photo resource names look like:
//   places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/AUjq9jnZ...
// Validate strictly so we can't be coerced into hitting an attacker URL.
const PHOTO_REF_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const DEFAULT_MAX_WIDTH = 1200;
const ABSOLUTE_MAX_WIDTH = 1600;

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: standard api tier (60/min) — these are CDN-cached at the
  // 302 layer and Google's CDN serves the bytes, so 60/min/IP is generous.
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const ref = typeof req.query?.ref === 'string' ? req.query.ref.trim() : '';
  if (!ref) {
    return res.status(400).json({ error: 'Missing required query param: ref' });
  }
  if (!PHOTO_REF_PATTERN.test(ref)) {
    // Don't echo the bad value — that's a SSRF vector if logged unsafely.
    logger.warn('Invalid photo ref pattern rejected');
    return res.status(400).json({ error: 'Invalid photo ref format' });
  }

  // Clamp maxWidth so a malicious caller can't burn quota requesting 8K images.
  const requested = Number.parseInt(req.query?.maxWidth ?? '', 10);
  const maxWidth = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, ABSOLUTE_MAX_WIDTH)
    : DEFAULT_MAX_WIDTH;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    logger.error('GOOGLE_PLACES_API_KEY not configured');
    return res.status(503).json({ error: 'Photo service temporarily unavailable' });
  }

  try {
    // skipHttpRedirect=true returns { photoUri } so we can stamp our own
    // cache headers on the 302 instead of inheriting Google's. Without this
    // flag the endpoint returns the binary directly, which routes the
    // bandwidth through Vercel.
    //
    // API key is sent via X-Goog-Api-Key header (NOT ?key= query param) so
    // it never lands in:
    //   - Vercel access logs (URLs are logged; headers are not)
    //   - CDN edge caches keyed on URL
    //   - browser network panels of any future server-rendered redirect
    // This is also the pattern api/scrape-restaurant.js uses for the
    // searchText call against the same Google Places API.
    const url = `https://places.googleapis.com/v1/${ref}/media`
      + `?maxWidthPx=${maxWidth}`
      + `&skipHttpRedirect=true`;

    const googleRes = await fetch(url, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': apiKey },
    });
    if (!googleRes.ok) {
      const text = await googleRes.text().catch(() => '');
      logger.warn('Google Places photo media failed', { status: googleRes.status, body: text.slice(0, 200) });
      return res.status(502).json({ error: 'Photo unavailable' });
    }

    const data = await googleRes.json();
    const photoUri = data?.photoUri;
    if (typeof photoUri !== 'string' || !/^https:\/\//.test(photoUri)) {
      logger.warn('Google Places photo media returned no photoUri');
      return res.status(502).json({ error: 'Photo unavailable' });
    }

    // Cache the redirect aggressively at the edge. The underlying photoUri
    // is short-lived (hours), but the redirect itself is safe to cache —
    // worst case the browser follows a stale photoUri and gets a 404, at
    // which point our <img onError> in the UI hides the broken hero.
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.setHeader('Location', photoUri);
    return res.status(302).end();
  } catch (err) {
    logger.error('Photo redirect failed', { error: err?.message });
    return res.status(502).json({ error: 'Photo unavailable' });
  }
};
