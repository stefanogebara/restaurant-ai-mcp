/**
 * POST /api/cron/warm-seo-cache
 *
 * Nightly cron (2 AM UTC) that pre-warms seo_page_cache for all active (city, cuisine)
 * pairs that don't yet have a cached entry. Prevents first-visitor cold starts.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { slugify } = require('../_lib/seo-html');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');
const cityHandler = require('../seo/city-cuisine');

const logger = createSecureLogger('warm-seo-cache');

module.exports = async (req, res) => {
  if (!bearerEquals(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch — ops can disable via cron_config table.
  if (!(await isCronEnabled('warm-seo-cache'))) {
    logger.warn('warm-seo-cache cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
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

  // Budget: stop at 45s to stay well under Vercel's 60s limit
  const DEADLINE_MS = 45_000;
  const startedAt = Date.now();
  const CONCURRENCY = 3;

  const warmOne = ({ city, cuisine }) =>
    new Promise((resolve) => {
      if (Date.now() - startedAt > DEADLINE_MS) { resolve('skipped'); return; }
      const fakeReq = { method: 'GET', query: { city, cuisine } };
      const fakeRes = {
        status: (code) => ({ send: () => { if (code >= 400) { failed++; } else { warmed++; } resolve('done'); } }),
        setHeader: () => {},
        send: () => { warmed++; resolve('done'); },
      };
      cityHandler(fakeReq, fakeRes).catch((err) => {
        logger.error('Failed to warm page', { city, cuisine, err: err.message });
        failed++;
        resolve('error');
      });
    });

  // Process in batches of CONCURRENCY
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > DEADLINE_MS) break;
    const batch = missing.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(warmOne));
  }

  await logCronRun('warm-seo-cache', { warmed, failed });

  return res.status(200).json({
    warmed,
    failed,
    alreadyCached: pairs.length - missing.length,
  });
};
