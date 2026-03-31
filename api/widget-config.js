/**
 * Widget Config Endpoint
 *
 * GET /api/widget-config?slug=cantina-bella-vista
 * Returns restaurant name, slug, and primary color.
 * Public endpoint, cached 1 hour.
 * Used by the widget to auto-configure when only slug is provided.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('widget-config');

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const { slug } = req.query || {};

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing required query parameter: slug' });
  }

  if (!SLUG_PATTERN.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, slug, language')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.json({
      success: true,
      data: {
        restaurant_name: data.restaurant_name,
        slug: data.slug,
        language: data.language || 'pt-BR',
        primary_color: '#9F1239',
      },
    });
  } catch (err) {
    logger.error('widget-config error', { slug, error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
