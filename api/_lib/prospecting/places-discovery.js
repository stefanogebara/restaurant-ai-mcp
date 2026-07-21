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

// ICP do Racha = casa com MESA (tem conta pra dividir). Ficam de fora delivery,
// marmita, sorveteria, doceria, padaria, lanchonete de balcão, mercado — sem
// mesa não há conta pra rachar. Filtro pelo primaryType do Google (a
// classificação DOMINANTE — um restaurante que TAMBÉM entrega continua ICP,
// por isso não olhamos a lista `types` inteira) + um backstop no nome pra
// quando o Google tipa errado (São Paulo ZL: o funil vinha entupido de
// marmita/delivery, queimando envio pago de template em quem nunca teria mesa).
const NAO_ICP_PRIMARY = new Set([
  'meal_delivery', 'meal_takeaway', 'ice_cream_shop', 'bakery', 'dessert_shop',
  'sandwich_shop', 'catering_service', 'food_court', 'candy_store',
  'chocolate_shop', 'donut_shop', 'juice_shop', 'convenience_store',
  'supermarket', 'grocery_store', 'liquor_store',
]);
const NAO_ICP_NOME = /(marmit|sorvet|a[çc]a[íi]|geladinho|picol[ée]|confeitaria|doceria|panificadora|\bpadaria\b|\bdelivery\b|bolos?\s+e\s+doces)/i;

/**
 * PURE: a casa tem mesa pra dividir conta? (Racha ICP). Conservador de
 * propósito — só corta o que claramente não tem serviço de mesa; um bar/
 * restaurante/espetinho/pizzaria com salão passa.
 * @param {object} place - Google Places v1 place object
 * @returns {boolean}
 */
function isRachaIcp(place) {
  const primary = place && place.primaryType;
  if (primary && NAO_ICP_PRIMARY.has(primary)) return false;
  const name = (place && place.displayName && place.displayName.text) || '';
  if (NAO_ICP_NOME.test(name)) return false;
  return true;
}

/**
 * Normalize a Places result into a prospect_leads row. A business phone that
 * resolves to a BR MOBILE becomes the WhatsApp candidate (whatsapp_status
 * 'pending'); a landline/none → 'missing' (proper WhatsApp discovery is Phase 3).
 *
 * @param {object} place - Google Places v1 place object
 * @param {object} ctx - { city, sector }
 * @returns {object|null} lead row, or null if unusable (no id/name) OR não-ICP
 */
function normalizePlace(place, ctx = {}) {
  if (!place || !place.id) return null;
  const name = place.displayName && place.displayName.text;
  if (!name) return null;
  if (!isRachaIcp(place)) return null; // sem mesa, sem Racha — descarta na fonte

  const rawPhone = place.internationalPhoneNumber || place.nationalPhoneNumber || null;
  // ANY normalized BR number is a WhatsApp candidate — fixed lines routinely
  // run WhatsApp Business in BR (call verification). A candidate that turns
  // out not to be on WhatsApp fails benignly on first send (131026) and the
  // receipts handler marks it 'missing' — the pool self-cleans at zero
  // reputation cost. Discarding landlines up-front threw away ~2/3 of real
  // Google results (São Paulo sweep: 2,131 of 3,342 discarded).
  const numero = rawPhone ? normalizarNumeroBr(rawPhone) : null;
  const isMobile = !!numero && numero.length === 14; // +55 + DDD + 9 digits

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
    whatsapp_phone: numero,
    whatsapp_status: numero ? 'pending' : 'missing',
    whatsapp_source: numero ? (isMobile ? 'google_places' : 'google_places_fixo') : null,
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
  const cap = Math.min(Math.max(maxResults, 1), 60); // Places v1 pages 20 at a time, 60 max
  const all = [];
  let pageToken = null;

  try {
    // Up to 3 pages of 20 — each page is a billed request, so stop as soon as
    // the cap is reached or the API stops returning a nextPageToken.
    for (let page = 0; page < 3 && all.length < cap; page++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const body = {
        textQuery,
        maxResultCount: Math.min(cap - all.length, 20),
        languageCode: lang,
        ...(pageToken ? { pageToken } : {}),
      };
      const response = await fetch(PLACES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': `${FIELD_MASK},nextPageToken`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        logger.error('Places API error:', { status: response.status, body: errBody.slice(0, 300) });
        // Partial results are still results — fail only when the FIRST page fails.
        if (all.length === 0) return { ok: false, leads: [], error: `places_api_${response.status}` };
        break;
      }

      const data = await response.json();
      all.push(...(data.places || []));
      pageToken = data.nextPageToken || null;
      if (!pageToken) break;
    }

    const leads = all.map((p) => normalizePlace(p, { city, sector })).filter(Boolean);
    logger.info(`discovery "${textQuery}" → ${all.length} places, ${leads.length} usable`);
    return { ok: true, leads };
  } catch (err) {
    if (err.name === 'AbortError') {
      if (all.length > 0) {
        const leads = all.map((p) => normalizePlace(p, { city, sector })).filter(Boolean);
        return { ok: true, leads };
      }
      return { ok: false, leads: [], error: 'timeout' };
    }
    logger.error('searchPlaces exception:', err.message);
    return { ok: false, leads: [], error: err.message };
  }
}

/** PURE: Places v1 autocomplete request body — BR localities/neighborhoods. */
function buildAutocompleteBody(input) {
  return {
    input: String(input || '').slice(0, 120),
    includedRegionCodes: ['br'],
    includedPrimaryTypes: ['locality', 'sublocality', 'neighborhood', 'administrative_area_level_3'],
    languageCode: 'pt-BR',
  };
}

/** PURE: normalize the autocomplete response into [{texto}] (max 8). */
function parseAutocomplete(json) {
  const sug = Array.isArray(json && json.suggestions) ? json.suggestions : [];
  return sug
    .map((x) => x && x.placePrediction && x.placePrediction.text && x.placePrediction.text.text)
    .filter(Boolean)
    .slice(0, 8)
    .map((texto) => ({ texto }));
}

module.exports = {
  buildAutocompleteBody,
  parseAutocomplete, searchPlaces, normalizePlace, isRachaIcp, FIELD_MASK };
