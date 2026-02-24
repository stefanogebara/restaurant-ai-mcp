/**
 * GET /api/seo/city-cuisine?city=:city&cuisine=:cuisine
 *
 * Server-rendered HTML landing page for a city+cuisine combination.
 * Checks seo_page_cache first; on miss, generates via Claude Haiku + restaurant data,
 * upserts to cache, returns HTML.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('../_lib/supabase');
const { renderPage, titleCase, slugify, escapeHtml } = require('../_lib/seo-html');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('seo-city-cuisine');
const BASE_URL = process.env.CLIENT_URL || 'https://restaurant-ai-mcp.vercel.app';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const { city, cuisine } = req.query;
  if (!city || !cuisine) {
    return res.status(400).send('Missing city or cuisine parameter');
  }

  const citySlug = slugify(city);
  const cuisineSlug = slugify(cuisine);
  const cacheKey = `city:${citySlug}:${cuisineSlug}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  // 1. Cache hit?
  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('seo_page_cache')
    .select('html')
    .eq('cache_key', cacheKey)
    .single();

  if (cached && !cacheError) {
    logger.info('Cache hit', { cacheKey });
    return res.send(cached.html);
  }

  // 2. Fetch matching restaurants
  const cityDisplay = titleCase(city);
  const cuisineDisplay = titleCase(cuisine);

  const { data: allRestaurants } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name, slug, city, restaurant_type')
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .not('slug', 'is', null);

  const matching = (allRestaurants || []).filter(
    (r) =>
      slugify(r.city || '') === citySlug &&
      slugify(r.restaurant_type || '') === cuisineSlug,
  );

  if (matching.length === 0) {
    logger.info('No restaurants found', { citySlug, cuisineSlug });
    return res.status(404).send(
      renderPage({
        title: `${cuisineDisplay} Restaurants in ${cityDisplay} | Seatable`,
        meta: `No ${cuisineDisplay.toLowerCase()} restaurants in ${cityDisplay} found on Seatable yet.`,
        body: `<h1>No restaurants found</h1>
          <p>There are currently no ${escapeHtml(cuisineDisplay.toLowerCase())} restaurants in ${escapeHtml(cityDisplay)} using Seatable.
          <a href="/demo/setup">Be the first</a>.</p>`,
      }),
    );
  }

  // 3. Generate copy via Claude Haiku (one call, ~$0.001)
  let generatedCopy = '';
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You write concise, factual marketing copy for a restaurant reservation SaaS called Seatable.
Output exactly 3 HTML paragraphs (wrapped in <p> tags). No headings. No lists. No markdown. No code blocks.
Paragraph 1: What Seatable does for restaurants (AI voice + WhatsApp + text reservations, 24/7, multi-language).
Paragraph 2: Why it suits ${cuisineDisplay} restaurants specifically.
Paragraph 3: Why restaurants in ${cityDisplay} are choosing it (mention 5-minute setup, no per-cover commission).`,
      messages: [
        {
          role: 'user',
          content: `Write copy for the Seatable landing page targeting ${cuisineDisplay} restaurants in ${cityDisplay}.`,
        },
      ],
    });
    generatedCopy = response.content[0].text;
  } catch (err) {
    logger.error('Claude generation failed — using fallback copy', { err: err.message });
    generatedCopy = `<p>Seatable helps restaurants handle reservations automatically, 24/7, via AI voice, WhatsApp, and online chat — so your team never misses a booking.</p>
<p>${escapeHtml(cuisineDisplay)} restaurants trust Seatable to manage their bookings and let their team focus on delivering a great guest experience.</p>
<p>Restaurants in ${escapeHtml(cityDisplay)} love that setup takes under 5 minutes and there are no per-cover commissions — ever.</p>`;
  }

  // 4. Build restaurant list HTML
  const restaurantListItems = matching
    .map(
      (r) =>
        `<li><a href="${BASE_URL}/book/${encodeURIComponent(r.slug)}">${escapeHtml(r.restaurant_name)}</a></li>`,
    )
    .join('\n');

  const body = `
    <h1>AI reservations for ${escapeHtml(cuisineDisplay)} restaurants in ${escapeHtml(cityDisplay)}</h1>
    <p class="lead">${matching.length} ${escapeHtml(cuisineDisplay.toLowerCase())} restaurant${matching.length !== 1 ? 's' : ''} in ${escapeHtml(cityDisplay)} use Seatable's AI host to handle reservations 24/7, in any language, with zero missed calls.</p>
    ${generatedCopy}
    <h2>Restaurants using Seatable in ${escapeHtml(cityDisplay)}</h2>
    <ul class="restaurant-list">${restaurantListItems}</ul>
    <div class="cta-block">
      <h2>Add your restaurant</h2>
      <p>Set up in 5 minutes. No technical knowledge required. No per-cover commission.</p>
      <a href="/demo/setup" class="cta-btn" style="display:inline-block;margin-top:1rem;">Try free demo</a>
    </div>
  `;

  const title = `AI Restaurant Reservations for ${cuisineDisplay} Restaurants in ${cityDisplay} | Seatable`;
  const metaDesc = `${matching.length} ${cuisineDisplay.toLowerCase()} restaurant${matching.length !== 1 ? 's' : ''} in ${cityDisplay} use Seatable's AI host to handle reservations 24/7. Set up in 5 minutes, no per-cover commission.`;

  const html = renderPage({
    title,
    meta: metaDesc,
    body,
    canonical: `/restaurants/${citySlug}/${cuisineSlug}`,
  });

  // 5. Upsert into cache
  await supabaseAdmin
    .from('seo_page_cache')
    .upsert({ cache_key: cacheKey, html }, { onConflict: 'cache_key' });

  logger.info('Page generated and cached', { cacheKey, restaurants: matching.length });
  return res.send(html);
};
