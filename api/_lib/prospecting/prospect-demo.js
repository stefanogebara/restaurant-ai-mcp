/**
 * Prospecting demo ("prévia") creation.
 *
 * The CTA the whole conversion study elected as fix #1: instead of asking for a
 * 30-min call (0% acceptance), Olímpia offers to build a PRÉVIA of the lead's
 * own restaurant and pastes a real link. This module turns that into code —
 * the engineer critic flagged it as "the only piece that must be CODE" for the
 * strategy to work.
 *
 * It reuses the Google data the discovery step already scraped onto the lead
 * (name, rating, reviews_count, address) — NO second Places call — and inserts
 * a minimal demo restaurant_config row that /previa/:token renders. Tables and
 * reservations are NOT seeded: the prévia shows the 2-act narrative, not the
 * full dashboard.
 *
 * The link is built HERE (never by the LLM — R4: the model must never write a
 * URL the system didn't paste). The responder appends what this returns.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { getProfile } = require('./prospect-product');

const logger = createSecureLogger('ProspectDemo');

const BASE_URL = process.env.CLIENT_URL || 'https://seatable.one';
// Olímpia's dialable WhatsApp number for the "me chama aqui" deep-link on the
// prévia page (E.164 digits, no '+'). Optional — the page falls back to a
// number-less wa.me when absent.
const OLIMPIA_WA = String(
  process.env.OLIMPIA_WA_NUMBER || process.env.PROSPECTING_DISPLAY_NUMBER || '',
).replace(/\D/g, '');

const VALID_TYPES = new Set([
  'fine_dining', 'casual_dining', 'fast_casual', 'cafe', 'bar',
  'steakhouse', 'italian', 'japanese', 'mexican', 'other',
]);

/** Map a discovery sector string onto the restaurant_type enum (best-effort). */
function sectorToType(sector) {
  const s = String(sector || '').toLowerCase();
  if (VALID_TYPES.has(s)) return s;
  if (/(italian|cantina|trattoria|pizz)/.test(s)) return 'italian';
  if (/(japon|sushi|ramen|izakaya)/.test(s)) return 'japanese';
  if (/(mexic|taco|cantina mex)/.test(s)) return 'mexican';
  if (/(churrasc|steak|grill|parrilla)/.test(s)) return 'steakhouse';
  if (/(caf[eé]|padaria|bakery|coffee)/.test(s)) return 'cafe';
  if (/(bar|pub|boteco|choppe)/.test(s)) return 'bar';
  return 'casual_dining';
}

// Cockpit event marker written once when Olímpia reacts to a prévia open — the
// storage-free dedup key (queried via prospect_messages, no migration).
const PREVIA_REACAO_MARK = '🤖 reagiu à abertura da prévia';

/**
 * One Place Details (v1) call for the personal "wow" assets the discovery data
 * doesn't carry: the lead's REAL photo + REAL review quotes. These are what
 * make the prévia read as "é o MEU restaurante" instead of a template —
 * without them the page falls back to a generic gradient and no quote.
 * Best-effort with a hard timeout: the prévia must never fail because Google
 * hiccuped. Returns {} on any failure. Shapes mirror scrape-restaurant.js
 * (top_reviews / photo_ref), which is what PreviaPage already renders.
 */
async function fetchPlaceAssets(placeId) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !placeId || typeof placeId !== 'string') return {};
  try {
    const resp = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'photos,reviews',
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!resp.ok) {
      logger.warn(`fetchPlaceAssets: Place Details ${resp.status} — prévia segue sem foto/review`);
      return {};
    }
    const place = await resp.json();
    const photoRef = place.photos && place.photos[0] && typeof place.photos[0].name === 'string'
      ? place.photos[0].name
      : null;
    const topReviews = (Array.isArray(place.reviews) ? place.reviews : [])
      .filter((r) => r && r.text && r.text.text && (typeof r.rating !== 'number' || r.rating >= 4))
      .slice(0, 3)
      .map((r) => ({
        text: String(r.text.text).slice(0, 260),
        rating: typeof r.rating === 'number' ? r.rating : null,
        author: (r.authorAttribution && r.authorAttribution.displayName) || 'um cliente',
        time: r.relativePublishTimeDescription || '',
      }));
    const out = {};
    if (photoRef) out.photo_ref = photoRef;
    if (topReviews.length) out.top_reviews = topReviews;
    return out;
  } catch (err) {
    logger.warn('fetchPlaceAssets failed (prévia segue sem foto/review):', err.message);
    return {};
  }
}

/** Build the /previa scraped_data envelope from a discovered lead row. */
function buildScrapedData(lead) {
  return {
    name: lead.name || 'seu restaurante',
    address: lead.address || null,
    phone: lead.phone || null,
    rating: typeof lead.rating === 'number' ? lead.rating : null,
    review_count: lead.reviews_count || 0,
    cuisine_type: lead.sector || 'Restaurante',
    website: lead.website || null,
    google_maps_url: lead.google_place_id
      ? `https://www.google.com/maps/place/?q=place_id:${lead.google_place_id}`
      : null,
    // Back-reference so the /previa beacon (P3) can map token → lead without a
    // schema change. Only the demo's own scraped_data carries it; never shown.
    prospect_lead_id: lead.id || null,
    source: 'prospect_previa',
  };
}

/**
 * Map a prévia demo_token back to its prospect lead (via the back-reference
 * stashed in scraped_data). Returns the full lead row or null.
 */
async function mapTokenToLead(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const { data: cfg } = await supabaseAdmin
      .schema('restaurant').from('restaurant_config')
      .select('scraped_data').eq('demo_token', token).maybeSingle();
    const leadId = cfg && cfg.scraped_data && cfg.scraped_data.prospect_lead_id;
    if (!leadId) return null;
    const { data: lead } = await supabaseAdmin
      .from('prospect_leads').select('*').eq('id', leadId).maybeSingle();
    return lead || null;
  } catch (err) {
    logger.warn('mapTokenToLead failed:', err.message);
    return null;
  }
}

/** Has Olímpia already reacted to this lead's prévia open? (once-per-lead dedup) */
async function previaJaReagida(leadId) {
  if (!leadId) return true; // no lead → treat as done (don't fire)
  try {
    const { data } = await supabaseAdmin
      .from('prospect_messages').select('id')
      .eq('lead_id', leadId).eq('tipo', 'evento')
      .ilike('corpo', `${PREVIA_REACAO_MARK}%`).limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    logger.warn('previaJaReagida failed (treating as reacted):', err.message);
    return true; // fail-safe: on error, DON'T double-send
  }
}

/** Assemble the public prévia URL, with the "me chama aqui" number when set. */
function previaUrl(token) {
  const base = `${BASE_URL}/previa/${token}`;
  return OLIMPIA_WA ? `${base}?wa=${OLIMPIA_WA}` : base;
}

/**
 * Detect a prévia link already sent in this thread — storage-free idempotency.
 * Tolerant to history item shape (corpo/texto/body). Returns the URL or null.
 */
function previaLinkInHistory(history) {
  if (!Array.isArray(history)) return null;
  const re = /https?:\/\/[^\s]*\/previa\/[a-f0-9-]{8,}[^\s]*/i;
  // Prévia fixa (Racha) não casa com /previa/<uuid>; detecta pelo próprio link.
  const profile = getProfile();
  const fixedMarker = profile.previaFixed && profile.previaUrl
    ? profile.previaUrl.replace(/^https?:\/\//i, '').toLowerCase()
    : null;
  for (const h of history) {
    const txt = String((h && (h.corpo || h.texto || h.body)) || '');
    const m = txt.match(re);
    if (m) return m[0];
    if (fixedMarker && txt.toLowerCase().includes(fixedMarker)) return profile.previaUrl;
  }
  return null;
}

/**
 * PURO: o trecho que identifica "o demo foi enviado" no corpo de uma mensagem.
 *
 * MESMA regra que previaLinkInHistory usa para idempotência, extraída para que
 * o painel CONTE exatamente o que o agente considera enviado. Se contagem e
 * detecção divergissem, o número no painel seria uma terceira opinião sobre o
 * mesmo fato — e a pessoa que olha não teria como saber qual está certa.
 *
 * @returns {{tipo:'fixo'|'token', marcador:string}}
 */
function marcadorDeDemoEnviado() {
  const profile = getProfile();
  if (profile.previaFixed && profile.previaUrl) {
    return { tipo: 'fixo', marcador: profile.previaUrl.replace(/^https?:\/\//i, '').toLowerCase() };
  }
  // Prévia por-restaurante (Seatable): todo link passa por /previa/<token>.
  return { tipo: 'token', marcador: '/previa/' };
}

/**
 * Create a prévia demo for a discovered lead and return its public link.
 * Fetches the lead's full row (guarantees the Google fields are present even
 * if the caller passed a trimmed lead object).
 *
 * @param {string} leadId
 * @returns {Promise<{ok:true, token:string, url:string} | {ok:false, error:string}>}
 */
async function criarPreviaDemo(leadId) {
  // Prévia FIXA (Racha wedge): o demo interativo é o mesmo link pra todo lead —
  // a pessoa paga uma conta de mentira pelo QR, do celular, em ~10s. Não gera
  // página por-restaurante (sem 2ª chamada ao Places, sem insert). Flipar pro
  // Seatable (PROSPECTING_PRODUCT=seatable) restaura a geração por-restaurante.
  const profile = getProfile();
  if (profile.previaFixed) {
    return { ok: true, token: null, url: profile.previaUrl, fixed: true };
  }
  try {
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, city, sector, address, phone, website, rating, reviews_count, google_place_id')
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr) return { ok: false, error: `lead fetch: ${leadErr.message}` };
    if (!lead) return { ok: false, error: 'lead não encontrado' };

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const business_hours = {};
    days.forEach((d) => { business_hours[d] = { open_time: '12:00', close_time: '23:00', is_open: true }; });

    const payload = {
      user_id: crypto.randomUUID(), // UNIQUE(user_id) on restaurant_config
      restaurant_name: (lead.name || 'seu restaurante').trim(),
      restaurant_type: sectorToType(lead.sector),
      city: (lead.city || '').trim() || 'São Paulo',
      country: 'BR', // prospecting is Brazil-only
      agent_language: 'pt',
      email: `previa+${String(leadId).slice(0, 8)}@seatable.one`,
      phone: lead.phone || 'N/A',
      slug: `previa-${token.slice(0, 8)}`,
      business_hours,
      reservation_settings: {
        max_party_size: 8, min_party_size: 1, advance_booking_days: 30,
        allow_waitlist: true, buffer_time_minutes: 15, require_credit_card: false,
      },
      is_active: true,
      onboarding_completed: true,
      is_demo: true,
      demo_token: token,
      demo_expires_at: expires,
      demo_contact_email: `previa+${String(leadId).slice(0, 8)}@seatable.one`,
      demo_contact_name: 'Prévia de prospecção',
      // Base envelope from discovery data + the Place Details assets (real
      // photo + real reviews) that make the page personal. Assets are
      // best-effort: {} on any Google failure, page falls back gracefully.
      scraped_data: {
        ...buildScrapedData(lead),
        ...(await fetchPlaceAssets(lead.google_place_id)),
      },
    };
    if (lead.website) payload.website = lead.website;

    const { error: insErr } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .insert(payload);
    if (insErr) return { ok: false, error: `insert: ${insErr.message}` };

    logger.info(`prévia criada lead=${leadId} token=${token}`);
    return { ok: true, token, url: previaUrl(token) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  criarPreviaDemo, previaLinkInHistory, previaUrl, buildScrapedData, sectorToType,
  fetchPlaceAssets, mapTokenToLead, previaJaReagida, PREVIA_REACAO_MARK,
  marcadorDeDemoEnviado,
};
