/**
 * Restaurant Scraper API
 *
 * POST /api/scrape-restaurant
 * Body: { query: "restaurant name", city: "city", country?: "country" }
 *
 * Returns Google Places data: name, address, phone, hours, cuisine, rating,
 * review_count, top_reviews, website, google_maps_url.
 *
 * Public endpoint (no auth) — used by demo setup flow.
 * Rate-limited: 5 requests/minute per IP.
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('ScrapeRestaurant');

// Google Places Text Search v2 — extended field mask with phone + photos
const PLACES_FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.regularOpeningHours',
  'places.websiteUri',
  'places.types',
  'places.reviews',
  'places.editorialSummary',
  'places.googleMapsUri',
  'places.photos',
  'places.primaryType',
  'places.primaryTypeDisplayName',
].join(',');

/**
 * Parse Google Places opening hours into our business_hours format
 * @param {object} openingHours - Google Places regularOpeningHours
 * @returns {object|null} business_hours JSONB or null
 */
function parseBusinessHours(openingHours) {
  if (!openingHours?.periods) return null;

  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hours = {};
  dayMap.forEach(d => { hours[d] = { open_time: null, close_time: null, is_open: false }; });

  for (const period of openingHours.periods) {
    const openDay = period.open?.day;
    const closeDay = period.close?.day;
    if (openDay == null) continue;

    const dayName = dayMap[openDay];
    if (!dayName) continue;

    const openHour = String(period.open?.hour ?? 0).padStart(2, '0');
    const openMin = String(period.open?.minute ?? 0).padStart(2, '0');
    const closeHour = String(period.close?.hour ?? 23).padStart(2, '0');
    const closeMin = String(period.close?.minute ?? 0).padStart(2, '0');

    hours[dayName] = {
      open_time: `${openHour}:${openMin}`,
      close_time: `${closeHour}:${closeMin}`,
      is_open: true,
    };
  }

  return hours;
}

/**
 * Infer cuisine type from Google Places types + primaryType
 * @param {string[]} types - Google Places type array
 * @param {string|null} primaryType - Primary type string
 * @returns {string} Cuisine type string
 */
function inferCuisineType(types, primaryType) {
  const all = [...(types || []), primaryType].filter(Boolean).map(t => t.toLowerCase());

  const cuisineMap = {
    italian_restaurant: 'Italian',
    japanese_restaurant: 'Japanese',
    sushi_restaurant: 'Japanese',
    ramen_restaurant: 'Japanese',
    mexican_restaurant: 'Mexican',
    steak_house: 'Steakhouse',
    chinese_restaurant: 'Chinese',
    indian_restaurant: 'Indian',
    thai_restaurant: 'Thai',
    french_restaurant: 'French',
    spanish_restaurant: 'Spanish',
    brazilian_restaurant: 'Brazilian',
    korean_restaurant: 'Korean',
    vietnamese_restaurant: 'Vietnamese',
    greek_restaurant: 'Greek',
    mediterranean_restaurant: 'Mediterranean',
    seafood_restaurant: 'Seafood',
    pizza_restaurant: 'Italian',
    hamburger_restaurant: 'American',
    american_restaurant: 'American',
    barbecue_restaurant: 'BBQ',
    cafe: 'Cafe',
    coffee_shop: 'Cafe',
    bar: 'Bar',
    fine_dining_restaurant: 'Fine Dining',
  };

  for (const t of all) {
    if (cuisineMap[t]) return cuisineMap[t];
  }

  // Fallback: check if any type contains known keywords
  const typeStr = all.join(' ');
  if (typeStr.includes('italian')) return 'Italian';
  if (typeStr.includes('japanese') || typeStr.includes('sushi')) return 'Japanese';
  if (typeStr.includes('mexican')) return 'Mexican';
  if (typeStr.includes('steak')) return 'Steakhouse';
  if (typeStr.includes('seafood')) return 'Seafood';
  if (typeStr.includes('cafe') || typeStr.includes('coffee')) return 'Cafe';

  return 'Restaurant';
}

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: strict tier (Google Places API has cost/quota)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'demo-create');
  if (rateLimited) return;

  const { query, city, country } = req.body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Missing required field: query' });
  }
  if (!city || typeof city !== 'string' || !city.trim()) {
    return res.status(400).json({ error: 'Missing required field: city' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    logger.error('GOOGLE_PLACES_API_KEY not configured');
    return res.status(503).json({ error: 'Restaurant search temporarily unavailable' });
  }

  try {
    const searchQuery = `${query.trim()} restaurant ${city.trim()} ${(country || '').trim()}`.trim();
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        maxResultCount: 3,
        languageCode: 'en',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('Google Places API error:', { status: response.status, body: errorText });
      return res.status(502).json({ error: 'Restaurant search failed' });
    }

    const data = await response.json();
    const places = data.places || [];

    if (places.length === 0) {
      return res.status(404).json({ error: 'No restaurants found', results: [] });
    }

    // Map results to our format
    const results = places.map(place => {
      const topReviews = (place.reviews || []).slice(0, 3).map(review => ({
        text: review.text?.text || '',
        rating: review.rating,
        author: review.authorAttribution?.displayName || 'Anonymous',
        time: review.relativePublishTimeDescription || '',
      }));

      const businessHours = parseBusinessHours(place.regularOpeningHours);
      const cuisineType = inferCuisineType(place.types, place.primaryType);

      // Get first photo reference (if available)
      const photoRef = place.photos?.[0]?.name || null;

      return {
        name: place.displayName?.text || query.trim(),
        address: place.formattedAddress || null,
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
        rating: place.rating || null,
        review_count: place.userRatingCount || 0,
        price_level: place.priceLevel || null,
        cuisine_type: cuisineType,
        website: place.websiteUri || null,
        google_maps_url: place.googleMapsUri || null,
        editorial_summary: place.editorialSummary?.text || null,
        business_hours: businessHours,
        hours_text: place.regularOpeningHours?.weekdayDescriptions || null,
        top_reviews: topReviews,
        types: place.types || [],
        photo_ref: photoRef,
      };
    });

    logger.info('Scrape success:', { query: searchQuery, results: results.length });
    return res.status(200).json({ results });

  } catch (error) {
    if (error.name === 'AbortError') {
      logger.warn('Google Places request timed out');
      return res.status(504).json({ error: 'Search timed out' });
    }
    logger.error('Scrape error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
