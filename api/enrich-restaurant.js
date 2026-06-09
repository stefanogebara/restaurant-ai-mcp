/**
 * Restaurant Enrichment API — HTTP handler
 *
 * POST /api/enrich-restaurant
 * Body: { website?, reviews?: [{text,rating,author}], restaurant_name?, cuisine_type? }
 * Returns: { success, menu, insights } — either may be null on best-effort failure.
 *
 * The actual extraction logic lives in api/_lib/enrich-restaurant.js so
 * demo.js (and any future caller) can import the pure functions without
 * cross-importing a sibling handler file, which Vercel's per-function
 * bundler silently drops.
 */

const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const {
  enrichFromWebsite,
  enrichFromReviews,
} = require('./_lib/enrich-restaurant');

const logger = createSecureLogger('EnrichRestaurant');

module.exports = async function httpHandler(req, res) {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'demo-create');
  if (rateLimited) return;

  const { website, reviews, restaurant_name, cuisine_type } = req.body || {};

  // No work to do? bail fast — the caller already has nothing for us to enrich.
  if (!website && !(Array.isArray(reviews) && reviews.length > 0)) {
    return res.status(400).json({ error: 'Need at least website OR reviews to enrich' });
  }

  // Run both passes in parallel — they're independent and the slow path is
  // the website fetch, which we don't want to block the review insights on.
  const [menu, insights] = await Promise.all([
    website && typeof website === 'string'
      ? enrichFromWebsite(website, restaurant_name).catch(err => {
          logger.warn('enrichFromWebsite threw', { err: err?.message });
          return null;
        })
      : Promise.resolve(null),
    reviews
      ? enrichFromReviews(reviews, cuisine_type, restaurant_name).catch(err => {
          logger.warn('enrichFromReviews threw', { err: err?.message });
          return null;
        })
      : Promise.resolve(null),
  ]);

  logger.info('enrichment done', {
    restaurant: restaurant_name,
    menuItems: menu?.menu_items?.length ?? 0,
    insightDishes: insights?.popular_dishes?.length ?? 0,
    vibeTags: insights?.vibe_tags?.length ?? 0,
  });

  return res.status(200).json({
    success: true,
    menu,
    insights,
  });
};
