'use strict';

/**
 * Lead discovery via Google Places API v1 (Text Search).
 *
 * Reuses Seatable's existing Google Places integration (same endpoint + key as
 * scrape-restaurant.js / restaurantIntelligence.js). For the MVP we search one
 * city/sector at a time ("restaurantes italianos em Pinheiros São Paulo") and
 * normalize each result into a prospect_leads row. google_place_id is the dedup
 * key (UNIQUE) so re-running discovery never duplicates a lead.
 *
 * The full geo-grid mass scraper (geo_grid.ts) is a later phase — a single Text
 * Search returns up to ~20 places, plenty for controlled early outreach.
 */

const { createSecureLogger } = require('../secure-logger');
const { normalizarNumeroBr } = require('./prospect-extract');

const logger = createSecureLogger('PlacesDiscovery');

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.nationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.location',
  'places.primaryType',
  'places.types',
].join(',');

/**
 * Normalize a Places result into a prospect_leads row. A business phone that
 * resolves to a BR MOBILE becomes the WhatsApp candidate (whatsapp_status
 * 'pending'); a landline/none → 'missing' (proper WhatsApp discovery is Phase 3).
 *
 * @param {object} place - Google Places v1 place object
 * @param {object} ctx - { city, sector }
 * @returns {object|null} lead row, or null if unusable (no place id/name)
 */
function normalizePlace(place, ctx = {}) {
  if (!place || !place.id) return null;
  const name = place.displayName && place.displayName.text;
  if (!name) return null;

  const rawPhone = place.internationalPhoneNumber || place.nationalPhoneNumber || null;
  const mobile = rawPhone ? normalizarNumeroBr(rawPhone) : null;
  const isMobile = !!mobile && mobile.length === 14; // +55 + DDD + 9 digits

  return {
    name,
    sector: ctx.sector || null,
    address: place.formattedAddress || null,
    city: ctx.city || null,
    lat: place.location ? place.location.latitude : null,
    lng: place.location ? place.location.longitude : null,
    google_place_id: place.id,
    source: 'google_places',
    phone: rawPhone,
    website: place.websiteUri || null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviews_count: place.userRatingCount || 0,
    whatsapp_phone: isMobile ? mobile : null,
    whatsapp_status: isMobile ? 'pending' : 'missing',
    whatsapp_source: isMobile ? 'google_places' : null,
    prospect_state: 'aguardando',
    status: 'descoberto',
  };
}

/**
 * Run a Text Search and return normalized lead rows.
 * @param {object} args
 * @param {string} args.query  - what to look for (e.g. "restaurante italiano")
 * @param {string} args.city   - city/neighborhood (e.g. "Pinheiros, São Paulo")
 * @param {string} [args.country='Brasil']
 * @param {string} [args.sector] - stored on each lead
 * @param {number} [args.maxResults=20]
 * @param {string} [args.lang='pt-BR']
 * @returns {Promise<{ok:boolean, leads:object[], error?:string}>}
 */
async function searchPlaces({ query, city, country = 'Brasil', sector, maxResults = 20, lang = 'pt-BR' }) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    logger.error('GOOGLE_PLACES_API_KEY not configured');
    return { ok: false, leads: [], error: 'places_not_configured' };
  }
  if (!query || !city) {
    return { ok: false, leads: [], error: 'query_and_city_required' };
  }

  const textQuery = `${query.trim()} em ${city.trim()} ${country}`.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: Math.min(Math.max(maxResults, 1), 20),
        languageCode: lang,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('Places API error:', { status: response.status, body: body.slice(0, 300) });
      return { ok: false, leads: [], error: `places_api_${response.status}` };
    }

    const data = await response.json();
    const places = data.places || [];
    const leads = places.map((p) => normalizePlace(p, { city, sector })).filter(Boolean);
    logger.info(`discovery "${textQuery}" → ${places.length} places, ${leads.length} usable`);
    return { ok: true, leads };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { ok: false, leads: [], error: 'timeout' };
    logger.error('searchPlaces exception:', err.message);
    return { ok: false, leads: [], error: err.message };
  }
}

module.exports = { searchPlaces, normalizePlace, FIELD_MASK };
