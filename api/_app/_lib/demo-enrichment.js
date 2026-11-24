/**
 * Demo enrichment helper — wraps the LLM enrichment + persona derivation
 * pass that runs against scraped Google Places data when a demo restaurant
 * is created with scrape information attached.
 *
 * Why this exists:
 * The exact same code lived INLINE in api/demo.js's handleCreate. With
 * the inline shape, Vercel's per-function NFT silently dropped api/demo
 * from the deploy manifest with no build error — the audit (full-platform
 * E2E) caught a 404 from /api/demo and bisecting handleCreate's body
 * isolated this block as the trigger. Lifting it into its own _lib file
 * lets NFT trace it as a normal dependency and the function deploys.
 *
 * Behavior preserved exactly:
 *   - enrichRestaurant runs in a Promise.race with a 20s hard ceiling.
 *     Fire-and-forget is unsafe on Vercel (the lambda dies after the
 *     response is sent), so we await with a cap. Typical 5-15s.
 *   - Failure of enrichment is non-fatal — the demo still gets the raw
 *     scraped_data, just without menu / insights.
 *   - derivePersonalityFromScrape skips silently below its confidence
 *     floor (returns null) so we never surprise the user with a wrong
 *     auto-pick they have to override.
 *
 * Immutable — returns a NEW { scraped_data, ai_personality? } object
 * rather than mutating the caller's insertPayload. Caller spreads it in.
 */

const { enrichRestaurant } = require('./enrich-restaurant');
const { derivePersonalityFromScrape } = require('./vibe-to-persona-preset');

const ENRICHMENT_TIMEOUT_MS = 20_000;

/**
 * @param {object} ctx
 * @param {object} ctx.scrapedData       — raw scraped_data from Google Places
 * @param {string} ctx.restaurantName    — for the enrichment prompt
 * @param {string|null} ctx.website      — pre-validated public URL or null
 * @param {string} ctx.cuisineType       — used by enrichRestaurant
 * @param {(msg: string, meta?: object) => void} [ctx.warn] — logger.warn,
 *        optional. Called with non-fatal enrichment failures.
 * @returns {Promise<{ scraped_data: object, ai_personality?: object }>}
 *          Always returns an object — scraped_data is never null.
 */
async function buildDemoEnrichmentPayload({ scrapedData, restaurantName, website, cuisineType, warn }) {
  let enrichment = null;
  try {
    enrichment = await Promise.race([
      enrichRestaurant({
        website,
        reviews: scrapedData?.top_reviews,
        restaurant_name: restaurantName,
        cuisine_type: cuisineType,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), ENRICHMENT_TIMEOUT_MS)),
    ]);
  } catch (err) {
    if (typeof warn === 'function') {
      warn('Enrichment threw — proceeding without it', { error: err?.message });
    }
  }

  // Spread base scrape + enrichment metadata on top.
  const merged = {
    ...scrapedData,
    ...(enrichment?.menu ? { menu: enrichment.menu } : {}),
    ...(enrichment?.insights ? { insights: enrichment.insights } : {}),
    ...(enrichment ? { enriched_at: new Date().toISOString() } : {}),
  };

  const out = { scraped_data: merged };
  const autoPersonality = derivePersonalityFromScrape(merged);
  if (autoPersonality) {
    out.ai_personality = autoPersonality;
  }
  return out;
}

module.exports = { buildDemoEnrichmentPayload };
