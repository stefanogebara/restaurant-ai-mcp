/**
 * POST /api/cron/warm-seo-cache
 *
 * Nightly cron (2 AM UTC) that pre-warms seo_page_cache for the buyer-intent
 * matrix (/sistema-de-reservas/:cidade/:cozinha — api/_lib/seo-matrix.js)
 * entries that don't yet have a cached entry. Prevents first-visitor cold
 * starts. ~180 pages fill over a few nights within the 45s budget; once full,
 * runs are no-ops. Legacy /restaurants pages still self-cache on visit.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getMatrixEntries } = require('../_lib/seo-matrix');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');
const reservasHandler = require('../seo/reservas');

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

  // The warm list is the curated buyer-intent matrix — page existence never
  // depends on customer rows.
  const pairs = getMatrixEntries().map((e) => ({
    city: e.city.slug,
    cuisine: e.cuisine.slug,
    cacheKey: e.cacheKey,
  }));

  // Find which entries already have a cache entry
  const { data: existing } = await supabaseAdmin
    .from('seo_page_cache')
    .select('cache_key')
    .in('cache_key', pairs.map((p) => p.cacheKey));

  const existingKeys = new Set((existing || []).map((r) => r.cache_key));
  const missing = pairs.filter((p) => !existingKeys.has(p.cacheKey));

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
      reservasHandler(fakeReq, fakeRes).catch((err) => {
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
