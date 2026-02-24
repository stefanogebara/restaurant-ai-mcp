/**
 * POST /api/cron/warm-seo-cache
 *
 * Nightly cron (2 AM UTC) that pre-warms seo_page_cache for all active (city, cuisine)
 * pairs that don't yet have a cached entry. Prevents first-visitor cold starts.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { slugify } = require('../_lib/seo-html');
const cityHandler = require('../seo/city-cuisine');

const logger = createSecureLogger('warm-seo-cache');

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch all unique (city, restaurant_type) pairs from active restaurants
  const { data: restaurants, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('city, restaurant_type')
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .not('city', 'is', null)
    .not('restaurant_type', 'is', null);

  if (error) {
    logger.error('Failed to fetch restaurants', { error: error.message });
    return res.status(500).json({ error: 'Failed to fetch restaurants' });
  }

  // Deduplicate pairs
  const pairMap = new Map();
  for (const r of restaurants || []) {
    const citySlug = slugify(r.city);
    const cuisineSlug = slugify(r.restaurant_type);
    if (citySlug && cuisineSlug) {
      pairMap.set(`${citySlug}:${cuisineSlug}`, { city: citySlug, cuisine: cuisineSlug });
    }
  }
  const pairs = [...pairMap.values()];

  // Find which pairs already have a cache entry
  const cacheKeys = pairs.map((p) => `city:${p.city}:${p.cuisine}`);
  const { data: existing } = await supabaseAdmin
    .from('seo_page_cache')
    .select('cache_key')
    .in('cache_key', cacheKeys);

  const existingKeys = new Set((existing || []).map((r) => r.cache_key));
  const missing = pairs.filter((p) => !existingKeys.has(`city:${p.city}:${p.cuisine}`));

  logger.info('Pre-warming SEO cache', { total: pairs.length, missing: missing.length });

  let warmed = 0;
  let failed = 0;

  for (const { city, cuisine } of missing) {
    try {
      const fakeReq = { method: 'GET', query: { city, cuisine } };
      await new Promise((resolve) => {
        const fakeRes = {
          status: (code) => ({ send: () => { if (code >= 400) failed++; resolve(); } }),
          setHeader: () => {},
          send: () => { warmed++; resolve(); },
        };
        cityHandler(fakeReq, fakeRes).catch(() => { failed++; resolve(); });
      });
    } catch (err) {
      logger.error('Failed to warm page', { city, cuisine, err: err.message });
      failed++;
    }
  }

  return res.status(200).json({
    warmed,
    failed,
    alreadyCached: pairs.length - missing.length,
  });
};
