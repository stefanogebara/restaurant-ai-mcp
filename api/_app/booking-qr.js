/**
 * Booking QR Code Generator
 *
 * GET /api/booking-qr?slug=cantina-bella-vista
 * Returns a PNG QR code for https://seatable.one/book/{slug}
 *
 * Public endpoint. Rate-limited. Cached 24 hours.
 */

const QRCode = require('qrcode');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('booking-qr');

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;
const BASE_URL = process.env.PUBLIC_URL || 'https://seatable.one';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: tight limit on public enumeration endpoint (20 req/min per IP)
  if (await checkAndApplyRateLimit(req, res, 'public_enumeration')) return;

  const { slug } = req.query || {};

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing required query parameter: slug' });
  }

  if (!SLUG_PATTERN.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  try {
    const bookingUrl = `${BASE_URL}/book/${encodeURIComponent(slug)}`;

    const buffer = await QRCode.toBuffer(bookingUrl, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#1C1917',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Content-Disposition', `inline; filename="booking-qr-${slug}.png"`);
    return res.send(buffer);
  } catch (err) {
    logger.error('QR code generation failed', { slug, error: err.message });
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }
};
