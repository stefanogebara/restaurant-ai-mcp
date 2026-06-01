/**
 * Restaurant Enrichment API
 *
 * POST /api/enrich-restaurant
 * Body: { website?: string, reviews?: Array<{text,rating,author}>, restaurant_name?: string, cuisine_type?: string }
 *
 * Two enrichment passes that run in parallel:
 *
 *   1. Website scrape — fetches the restaurant's homepage, extracts:
 *        - menu items + prices
 *        - popular/signature dishes
 *        - social handles
 *        - hours_text (one-line summary)
 *        - contact { phone, address, email }  ← used by onboarding Step 0
 *        - business_hours (structured weekly schedule, same shape as
 *          /api/scrape-restaurant returns, so the client can use one
 *          converter for both sources)
 *      Uses cheap Claude Haiku for structured extraction.
 *
 *   2. Review insights — passes the top reviews to Claude, returns popular
 *      dishes mentioned by guests, praise themes, complaint themes, and
 *      3–4 vibe descriptors. Drives the auto-generated AI personality.
 *
 * Returns a single JSON envelope with both `.menu` and `.insights` fields,
 * either of which may be `null` if extraction failed (best-effort — the
 * demo dashboard renders whatever is present). Within `.menu`, `contact`
 * and `business_hours` may each be `null` independently when the site
 * didn't surface those fields with confidence.
 *
 * Public endpoint (no auth) — used by demo-create flow + on-demand re-runs.
 * Rate-limited.
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { getAI, AI_MODEL_FAST } = require('./_lib/ai-client');

const logger = createSecureLogger('EnrichRestaurant');

const WEBSITE_FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 500_000; // 500 KB cap — most menu pages are well under this
const LLM_TIMEOUT_MS = 30_000;

/**
 * Strip an HTML document down to just the visible text content for LLM
 * consumption. Removes scripts/styles/svgs, collapses whitespace, caps length.
 */
function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  let s = html;
  // Remove non-content tags entirely (their inner text is noise).
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  // Decode the most common HTML entities so prices render as "R$ 50,00" not "R&#36;50&#44;00"
  s = s.replace(/&nbsp;/gi, ' ');
  s = s.replace(/&amp;/gi, '&');
  s = s.replace(/&lt;/gi, '<');
  s = s.replace(/&gt;/gi, '>');
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = parseInt(n, 10);
    return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : ' ';
  });
  // Drop all remaining tags, preserve their text content.
  s = s.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();
  // Cap to 20k chars — LLM context budget guard.
  return s.slice(0, 20_000);
}

/**
 * Fetch a URL with a timeout + size cap. Returns { ok, text, finalUrl, error }.
 * Best-effort: any failure (DNS, timeout, 4xx/5xx, oversize) returns ok:false
 * and the caller falls back gracefully.
 */
async function fetchHtmlSafely(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // Many restaurant sites block bare fetch UAs (Cloudflare/Sucuri).
        // Identify as a desktop browser so we look ordinary.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en;q=0.7,pt;q=0.7,es;q=0.7',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `http ${res.status}` };
    // Read up to MAX_HTML_BYTES — protects us from a multi-MB site dump.
    const text = await res.text();
    if (text.length > MAX_HTML_BYTES) {
      return { ok: true, text: text.slice(0, MAX_HTML_BYTES), finalUrl: res.url, truncated: true };
    }
    return { ok: true, text, finalUrl: res.url };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'fetch failed') };
  }
}

/** Run a single LLM extraction with a JSON-schema response shape. */
async function extractWithLLM({ system, user, schemaDescription }) {
  const ai = await getAI();
  if (!ai) throw new Error('AI client unavailable');
  // Apply our own timeout — defensive in case the model hangs.
  const completion = await Promise.race([
    ai.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 1024,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)),
  ]);
  // Anthropic-SDK-shaped response: messages.create returns { content: [{ type, text }] }
  const raw = completion?.content?.[0]?.text || '';
  // Strip code fences if the model wrapped its JSON in ```json ... ```
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    logger.warn('LLM returned non-JSON', { sample: cleaned.slice(0, 200), schemaDescription });
    return null;
  }
}

/**
 * Pass 1: website scrape. Returns { menu_items, popular_dishes, social_handles,
 * hours_text } or null on any failure.
 */
async function enrichFromWebsite(websiteUrl, restaurantName) {
  const fetched = await fetchHtmlSafely(websiteUrl);
  if (!fetched.ok) {
    logger.info('website fetch failed', { website: websiteUrl, error: fetched.error });
    return null;
  }
  const text = htmlToText(fetched.text);
  if (text.length < 80) return null;

  const system =
    'You are extracting structured restaurant information from a website. ' +
    'Respond with ONLY valid JSON matching the schema. No prose, no code fences.';

  const user = `Extract structured info about ${restaurantName ? `"${restaurantName}"` : 'this restaurant'} from the website text below.

Schema (return EXACTLY this shape, all fields required, use null when unknown):
{
  "menu_items": [{ "name": string, "price": string | null, "description": string | null, "category": string | null }],  // up to 12 items
  "popular_dishes": [string],  // up to 5 names of signature/most-mentioned dishes
  "social_handles": { "instagram": string | null, "facebook": string | null },
  "hours_text": string | null,  // one-line summary if visible, else null
  "contact": {                  // best-effort lift from the site's contact/footer
    "phone": string | null,     // include country code if visible (e.g. "+55 11 5555 1234")
    "address": string | null,   // single-line postal address
    "email": string | null
  },
  "business_hours": {           // structured weekly schedule when the site lists per-day hours
    "monday":    { "open_time": string | null, "close_time": string | null, "is_open": boolean },
    "tuesday":   { "open_time": string | null, "close_time": string | null, "is_open": boolean },
    "wednesday": { "open_time": string | null, "close_time": string | null, "is_open": boolean },
    "thursday":  { "open_time": string | null, "close_time": string | null, "is_open": boolean },
    "friday":    { "open_time": string | null, "close_time": string | null, "is_open": boolean },
    "saturday":  { "open_time": string | null, "close_time": string | null, "is_open": boolean },
    "sunday":    { "open_time": string | null, "close_time": string | null, "is_open": boolean }
  } | null
}

Rules:
- price: keep the original currency symbol if visible ("R$ 45", "€ 12.50"), null if not.
- popular_dishes: only include if the website explicitly highlights them (e.g. "our specialty", "signature dish", "most popular"). Else empty array.
- social_handles: extract from links/icons, return just the URL.
- Return at most 12 menu items — prioritize variety across categories.
- contact.phone: prefer the most prominent number (booking/reservations line), strip formatting except spaces and +.
- contact.address: most prominent street address, single line, no "Address:" prefix.
- business_hours: ONLY when the site lists actual times. If it just says "open daily" without times, return null.
- business_hours times: 24h "HH:MM" format. is_open=false for closed days. If a day isn't listed at all on the site, is_open=false.
- Return null for any field you cannot find with confidence — fabricated phones / addresses / hours are worse than missing ones.

Website text:
${text}`;

  const parsed = await extractWithLLM({
    system,
    user,
    schemaDescription: 'website menu',
  });
  if (!parsed) return null;

  return {
    menu_items: Array.isArray(parsed.menu_items) ? parsed.menu_items.slice(0, 12) : [],
    popular_dishes: Array.isArray(parsed.popular_dishes) ? parsed.popular_dishes.slice(0, 5) : [],
    social_handles: parsed.social_handles && typeof parsed.social_handles === 'object' ? parsed.social_handles : {},
    hours_text: typeof parsed.hours_text === 'string' ? parsed.hours_text : null,
    contact: normaliseContact(parsed.contact),
    business_hours: normaliseBusinessHours(parsed.business_hours),
    source_url: fetched.finalUrl || websiteUrl,
  };
}

/**
 * Normalise the LLM-returned contact bag — drop empty strings, validate that
 * each field is actually a string, and surface a flat { phone, address, email }
 * object. Returns null when nothing usable came back so callers can short-circuit.
 */
function normaliseContact(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of ['phone', 'address', 'email']) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      out[key] = v.trim();
    } else {
      out[key] = null;
    }
  }
  // If every field is null, treat the whole bag as null so downstream code
  // can fall through to "no contact info" branches without a key dance.
  if (!out.phone && !out.address && !out.email) return null;
  return out;
}

/**
 * Normalise the LLM-returned weekly schedule into the same shape
 * /api/scrape-restaurant emits, so applyScrapedData on the client can treat
 * both sources identically. Returns null when the structure is missing or
 * has zero open days (which is what we want — better to fall through to
 * the form defaults than render an all-closed week).
 */
function normaliseBusinessHours(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const out = {};
  let anyOpen = false;
  for (const day of DAYS) {
    const entry = raw[day];
    if (entry && typeof entry === 'object') {
      const open = typeof entry.open_time === 'string' && TIME_RE.test(entry.open_time) ? entry.open_time : null;
      const close = typeof entry.close_time === 'string' && TIME_RE.test(entry.close_time) ? entry.close_time : null;
      const isOpen = entry.is_open === true && open !== null && close !== null;
      out[day] = { open_time: open, close_time: close, is_open: isOpen };
      if (isOpen) anyOpen = true;
    } else {
      out[day] = { open_time: null, close_time: null, is_open: false };
    }
  }
  return anyOpen ? out : null;
}

/**
 * Pass 2: review insights. Takes the top reviews (typically 3 from Google
 * Places) and extracts structured signal for the AI to use later.
 */
async function enrichFromReviews(reviews, cuisineType, restaurantName) {
  if (!Array.isArray(reviews) || reviews.length === 0) return null;
  // Cap each review's text — long ones bloat the prompt with diminishing return.
  const compactReviews = reviews
    .filter(r => r && typeof r.text === 'string' && r.text.length > 30)
    .slice(0, 8)
    .map(r => ({
      text: r.text.length > 800 ? r.text.slice(0, 800) + '…' : r.text,
      rating: r.rating ?? null,
    }));
  if (compactReviews.length === 0) return null;

  const system =
    'You are extracting structured insights from restaurant reviews. ' +
    'Respond with ONLY valid JSON matching the schema. No prose, no code fences.';

  const user = `Analyze these reviews for ${restaurantName ? `"${restaurantName}"` : 'a restaurant'}${cuisineType ? ` (${cuisineType})` : ''}.

Schema (return EXACTLY this shape, all fields required, use empty arrays when nothing found):
{
  "popular_dishes": [string],          // up to 5 dish names guests mention positively
  "praise_themes": [string],           // up to 4 short phrases ("attentive staff", "great atmosphere")
  "complaint_themes": [string],        // up to 4 short phrases ("long wait", "noisy")
  "vibe_tags": [string],               // 3-4 short descriptors: pick from "romantic", "lively", "casual", "upscale", "family-friendly", "quiet", "trendy", "traditional", "intimate", "bustling"
  "ai_voice_notes": [string]           // up to 3 short suggestions for the AI receptionist (e.g. "Mention wait times proactively — guests complain about them")
}

Reviews:
${compactReviews.map((r, i) => `[${i + 1}] (${r.rating ?? '?'}/5) ${r.text}`).join('\n\n')}`;

  const parsed = await extractWithLLM({
    system,
    user,
    schemaDescription: 'review insights',
  });
  if (!parsed) return null;

  return {
    popular_dishes: Array.isArray(parsed.popular_dishes) ? parsed.popular_dishes.slice(0, 5) : [],
    praise_themes: Array.isArray(parsed.praise_themes) ? parsed.praise_themes.slice(0, 4) : [],
    complaint_themes: Array.isArray(parsed.complaint_themes) ? parsed.complaint_themes.slice(0, 4) : [],
    vibe_tags: Array.isArray(parsed.vibe_tags) ? parsed.vibe_tags.slice(0, 4) : [],
    ai_voice_notes: Array.isArray(parsed.ai_voice_notes) ? parsed.ai_voice_notes.slice(0, 3) : [],
  };
}

/**
 * Library entry point — runs both enrichment passes and returns
 * { menu, insights } directly. Used by demo.js to enrich a freshly-created
 * demo in the background, without the HTTP round-trip.
 *
 * Both fields may be null on failure — caller decides what to merge.
 */
async function enrichRestaurant({ website, reviews, restaurant_name, cuisine_type }) {
  const [menu, insights] = await Promise.all([
    website && typeof website === 'string'
      ? enrichFromWebsite(website, restaurant_name).catch(() => null)
      : Promise.resolve(null),
    reviews
      ? enrichFromReviews(reviews, cuisine_type, restaurant_name).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { menu, insights };
}

async function httpHandler(req, res) {
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
}

// Vercel routes the file's default export — keep that as the HTTP handler.
// Also expose enrichRestaurant for in-process use by demo.js.
module.exports = httpHandler;
module.exports.enrichRestaurant = enrichRestaurant;
