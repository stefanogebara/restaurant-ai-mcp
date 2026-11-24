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

const { createSecureLogger } = require('./secure-logger');
const { getAI, AI_MODEL_FAST } = require('./ai-client');
const { safeFetchText } = require('./safe-fetch');

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
/**
 * SSRF-safe website fetch. `url` here comes from the restaurant's
 * `scraped_data.website` field which is ultimately user-controlled
 * (Google Places result → demo setup form → DB). Without per-hop
 * private-IP rejection, an attacker could set `website` to a 302
 * redirector that points at http://169.254.169.254/ (AWS metadata)
 * and our lambda would happily exfiltrate the response. The shared
 * safeFetchText helper handles DNS resolution, IP-range allowlisting,
 * manual redirect with per-hop revalidation, and body-size capping.
 */
async function fetchHtmlSafely(url) {
  try {
    const { text, finalUrl, truncated } = await safeFetchText(url, {
      timeoutMs: WEBSITE_FETCH_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
    });
    return { ok: true, text, finalUrl, truncated };
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
 * Onde o cardápio realmente está.
 *
 * A home quase nunca lista pratos e preços — ela tem foto, telefone e um LINK
 * escrito "Cardápio". Ler só a home é o motivo de `menu_items` voltar vazio na
 * maioria dos restaurantes, o que deixa a IA sem saber responder "quanto custa
 * a moqueca?" — a pergunta mais comum de um cliente no WhatsApp.
 *
 * Ordena por probabilidade: o texto do link ("cardápio", "menu") vale mais que
 * a URL, porque muito site usa /pagina-2 com o texto certo. PDF entra na lista
 * porque é onde a maioria dos restaurantes brasileiros publica o cardápio.
 */
function acharLinksDeCardapio(html, baseUrl) {
  if (!html || typeof html !== 'string') return [];
  const encontrados = new Map();

  const RE_LINK = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, href, interno] of html.matchAll(RE_LINK)) {
    const texto = interno.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const alvo = String(href).trim();
    if (!alvo || alvo.startsWith('#') || /^(mailto|tel|javascript):/i.test(alvo)) continue;

    let url;
    try { url = new URL(alvo, baseUrl).href; } catch { continue; }
    // Só o próprio domínio: link pro iFood/Instagram é outra história, e
    // seguir domínio de terceiro aqui seria SSRF de graça.
    try {
      if (new URL(url).hostname !== new URL(baseUrl).hostname) continue;
    } catch { continue; }

    const ehPdf = /\.pdf(\?|$)/i.test(url);
    const textoPromete = /card[áa]pio|menu|pratos|delivery/i.test(texto);
    const urlPromete = /card[áa]pio|menu/i.test(url);
    if (!ehPdf && !textoPromete && !urlPromete) continue;

    // Peso: texto do link é o sinal mais confiável; PDF logo atrás.
    const peso = (textoPromete ? 3 : 0) + (ehPdf ? 2 : 0) + (urlPromete ? 1 : 0);
    if (!encontrados.has(url) || encontrados.get(url).peso < peso) {
      encontrados.set(url, { url, peso, ehPdf });
    }
  }

  return [...encontrados.values()].sort((a, b) => b.peso - a.peso).slice(0, 3);
}

/** Texto de um PDF de cardápio. Falha vira null — nunca derruba a extração. */
async function textoDePdf(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), WEBSITE_FETCH_TIMEOUT_MS);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) return null;

    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAX_HTML_BYTES) return null;

    // require tardio: pdf-parse é pesado e a maioria dos sites não tem PDF.
    const pdfParse = require('pdf-parse');
    const { text } = await pdfParse(buf);
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 20_000) : null;
  } catch (err) {
    logger.info('PDF de cardápio não pôde ser lido', { url, erro: err?.message || String(err) });
    return null;
  }
}

/**
 * Pass 1: website scrape. Returns { menu_items, popular_dishes, social_handles,
 * hours_text } or null on any failure.
 */
async function enrichFromWebsite(websiteUrl, restaurantName, menuUrl) {
  // O dono pode ter só o cardápio (um PDF no Drive, um link do Instagram) e
  // nenhum site — caso comum e que antes ficava de fora, porque a função
  // inteira dependia da home existir.
  const temSite = Boolean(websiteUrl && typeof websiteUrl === 'string');
  const fetched = temSite ? await fetchHtmlSafely(websiteUrl) : { ok: false, error: 'sem site' };
  if (temSite && !fetched.ok) {
    logger.info('website fetch failed', { website: websiteUrl, error: fetched.error });
  }

  let text = fetched.ok ? htmlToText(fetched.text) : '';

  // Ordem deliberada: o link que o DONO informou vem primeiro. Ele sabe onde
  // está o cardápio melhor que qualquer heurística — e informar o link é a
  // única via para quem não tem site.
  const base = (fetched.ok && fetched.finalUrl) || websiteUrl || menuUrl;
  const candidatos = [];
  if (menuUrl && typeof menuUrl === 'string') {
    candidatos.push({ url: menuUrl.trim(), ehPdf: /\.pdf(\?|$)/i.test(menuUrl), doDono: true });
  }
  if (fetched.ok) candidatos.push(...acharLinksDeCardapio(fetched.text, base));

  // Anexa ao texto da home em vez de substituir: contato, horários e redes
  // seguem morando na home — o cardápio só acrescenta os pratos.
  const jaVistos = new Set();
  for (const link of candidatos) {
    if (text.length > 18_000) break; // orçamento de contexto do LLM
    if (jaVistos.has(link.url)) continue;
    jaVistos.add(link.url);

    const extra = link.ehPdf
      ? await textoDePdf(link.url)
      : await fetchHtmlSafely(link.url).then((r) => (r.ok ? htmlToText(r.text) : null));

    if (extra && extra.length > 80) {
      logger.info('Cardápio lido', { url: link.url, pdf: link.ehPdf, doDono: Boolean(link.doDono), chars: extra.length });
      text = `${text}\n\n[CARDÁPIO — ${link.url}]\n${extra}`.slice(0, 24_000);
    } else if (link.doDono) {
      // O dono digitou este link à mão. Se não deu para ler, ele precisa
      // saber — senão fica esperando uma IA que sabe preço e não sabe.
      logger.warn('Cardápio informado pelo dono não pôde ser lido', { url: link.url, pdf: link.ehPdf });
    }
  }

  if (text.length < 80) return null;

  const system =
    'You are extracting structured restaurant information from a website. ' +
    'Respond with ONLY valid JSON matching the schema. No prose, no code fences.';

  const user = `Extract structured info about ${restaurantName ? `"${restaurantName}"` : 'this restaurant'} from the website text below.

Schema (return EXACTLY this shape, all fields required, use null when unknown):
{
  "menu_items": [{ "name": string, "price": string | null, "description": string | null, "category": string | null }],  // up to 40 items
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
- Return at most 40 menu items. When a [CARDÁPIO] section is present it holds the real menu — extract from it, and PRIORITIZE ITEMS THAT SHOW A PRICE: "quanto custa a moqueca?" is the most common guest question on WhatsApp, and an item without a price cannot answer it.
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
    // 40, alinhado ao prompt: o corte antigo em 12 foi calibrado quando só se
    // lia a home. Agora que o cardápio inteiro entra, cortar em 12 jogaria
    // fora justamente os pratos com preço que a IA precisa para responder.
    menu_items: Array.isArray(parsed.menu_items) ? parsed.menu_items.slice(0, 40) : [],
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
async function enrichFromReviews(reviews, cuisineType, restaurantName, idioma = 'pt-BR') {
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

  // IDIOMA DA SAÍDA — sem esta instrução o modelo respondia em inglês, porque o
  // prompt inteiro e todos os exemplos estão em inglês. E este texto vai DIRETO
  // pra tela do dono: verificado em produção (27/jul/2026), o painel do Mocotó
  // mostrava, em português, o cartão de insights dizendo
  //   "Emphasize authentic Brazilian flavors and the chef's commitment..."
  //   "Mention no-wait availability during off-peak times (like Friday 2 PM)"
  // — a IA que deveria provar inteligência falando a língua errada com o dono.
  const NOMES = { 'pt-BR': 'português do Brasil', es: 'espanhol', en: 'inglês' };
  const nomeDoIdioma = NOMES[idioma] || NOMES['pt-BR'];

  const system =
    'You are extracting structured insights from restaurant reviews. '
    + 'Respond with ONLY valid JSON matching the schema. No prose, no code fences. '
    + `Write every human-readable string in ${nomeDoIdioma}, regardless of the language of the reviews. `
    + 'EXCEPTION: "vibe_tags" must use the exact English keywords from the allowed list — '
    + 'they are enum values consumed by code, not text shown to people.';

  const user = `Analyze these reviews for ${restaurantName ? `"${restaurantName}"` : 'a restaurant'}${cuisineType ? ` (${cuisineType})` : ''}.

Schema (return EXACTLY this shape, all fields required, use empty arrays when nothing found):
{
  "popular_dishes": [string],          // up to 5 dish names guests mention positively — keep the dish name as written by guests
  "praise_themes": [string],           // up to 4 short phrases, in ${nomeDoIdioma} ("equipe atenciosa", "ótimo ambiente")
  "complaint_themes": [string],        // up to 4 short phrases, in ${nomeDoIdioma} ("espera longa", "barulhento")
  "vibe_tags": [string],               // 3-4 descriptors — ENGLISH KEYWORDS ONLY, pick from: "romantic", "lively", "casual", "upscale", "family-friendly", "quiet", "trendy", "traditional", "intimate", "bustling"
  "ai_voice_notes": [string]           // up to 3 short suggestions for the AI receptionist, in ${nomeDoIdioma} (ex.: "Avise sobre o tempo de espera já no início — é a reclamação mais comum")
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
async function enrichRestaurant({ website, reviews, restaurant_name, cuisine_type, menu_url }) {
  // Falha aqui NÃO bloqueia o demo (o dono cai no painel de qualquer jeito),
  // mas também não pode ser muda: quando o enriquecimento morre, o cartão
  // "o que a IA já sabe" some da tela e o demo vira um painel genérico —
  // exatamente o argumento de venda que a página promete.
  //
  // Foi assim que um slug de modelo morto passou semanas sem ninguém notar:
  // o .catch(() => null) engolia o 404 da API e o cartão simplesmente não
  // renderizava. Silêncio aqui custa caro; log não custa nada.
  const aoFalhar = (etapa) => (err) => {
    logger.error(`Enriquecimento falhou (${etapa}) — o demo abre sem esses dados`, {
      etapa,
      restaurante: restaurant_name || null,
      erro: err?.message || String(err),
    });
    return null;
  };

  const [menu, insights] = await Promise.all([
    // Basta UM dos dois: quem tem só o cardápio (PDF no Drive, sem site)
    // também é atendido.
    (website && typeof website === 'string') || (menu_url && typeof menu_url === 'string')
      ? enrichFromWebsite(website, restaurant_name, menu_url).catch(aoFalhar('site'))
      : Promise.resolve(null),
    reviews
      ? enrichFromReviews(reviews, cuisine_type, restaurant_name).catch(aoFalhar('avaliações'))
      : Promise.resolve(null),
  ]);
  return { menu, insights };
}


// _lib module — pure functions only. The HTTP handler that wraps these
// lives in api/enrich-restaurant.js (which now imports from this file).
//
// This split fixes a Vercel bundling bug: when api/demo.js statically
// required('./enrich-restaurant') (a sibling handler file), Vercel's
// per-function NFT tracer silently dropped api/demo.js → /api/demo
// returned 404 from the catch-all. Moving the pure functions to _lib/
// breaks the cross-handler import.
module.exports = {
  enrichRestaurant,
  enrichFromWebsite,
  enrichFromReviews,
  // exportado para teste: é a heurística que decide onde o cardápio está,
  // e errar aqui devolve a IA ao estado de não saber preço nenhum.
  acharLinksDeCardapio,
};
