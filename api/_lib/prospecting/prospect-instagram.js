'use strict';

/**
 * Instagram helpers for BR enrichment. Ported from Olivia's `_shared/instagram.ts`.
 * `buscarSeguidores`/`descobrirHandle` use Scrapingdog (SCRAPINGDOG_API_KEY) and
 * are best-effort — they degrade to null without throwing. The handle parsers are
 * pure (no key, unit-tested).
 */

const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Follower count for a profile via Scrapingdog (~15 credits). Best-effort:
 * degrades to null on any error. The followers field name varies across API
 * versions, so we probe several likely paths.
 * @param {string} handle
 * @param {string} apiKey
 * @returns {Promise<number|null>}
 */
async function buscarSeguidores(handle, apiKey) {
  const username = String(handle || '').replace(/^@/, '').trim();
  if (!username || !apiKey) return null;
  try {
    const url = `https://api.scrapingdog.com/instagram/profile?api_key=${apiKey}&username=${encodeURIComponent(username)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const candidates = [
      data && data.followers,
      data && data.follower_count,
      data && data.followers_count,
      data && data.edge_followed_by && data.edge_followed_by.count,
      data && data.user && data.user.edge_followed_by && data.user.edge_followed_by.count,
      data && data.data && data.data.followers,
    ];
    for (const c of candidates) {
      const n = typeof c === 'string' ? Number(c.replace(/\D/g, '')) : Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  } catch {
    return null;
  }
}

const RESERVED_IG = new Set([
  'p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'about',
  'directory', 'developer', 'legal', 'web', 'sharer',
]);

/** Extract the handle from an instagram.com URL (ignores reserved paths). */
function instagramHandleFromUrl(url) {
  const m = String(url || '').match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (!m) return null;
  const h = m[1];
  return RESERVED_IG.has(h.toLowerCase()) ? null : h;
}

/**
 * Extract an Instagram @handle from a site's HTML (header/footer link). Many
 * businesses link their IG on their own site — a DIRECT, free source, and the
 * enrichment already downloads that HTML for the CNPJ (zero extra cost). Takes
 * the first valid handle. Invents nothing.
 * @param {string|null|undefined} html
 * @returns {string|null}
 */
function handleFromHtml(html) {
  if (!html) return null;
  for (const m of String(html).matchAll(/instagram\.com\/([A-Za-z0-9._]+)/gi)) {
    const h = instagramHandleFromUrl('instagram.com/' + m[1]);
    if (h) return h;
  }
  return null;
}

/**
 * How well a @handle matches the business name (0..1). Equal/contained → high;
 * else the fraction of name tokens (>2 letters) present in the handle. Used to
 * pick the RIGHT handle among Google links (avoids competitor/aggregator).
 * @param {string} handle
 * @param {string} nome
 * @returns {number}
 */
function handleCasaNome(handle, nome) {
  const h = norm(handle);
  const n = norm(nome);
  if (!h || !n) return 0;
  if (h === n) return 1;
  if (h.includes(n) || n.includes(h)) return 0.8;
  const tokens = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => h.includes(t)).length;
  return hits / tokens.length;
}

/**
 * Discover a business's @handle via Scrapingdog Google Search. Instead of taking
 * the first instagram.com/<profile> link (which may be a competitor/aggregator),
 * scores each candidate by name similarity and picks the best; falls back to the
 * first found when none match the name.
 * @param {string} nome
 * @param {string|null} cidade
 * @param {string} apiKey
 * @returns {Promise<string|null>}
 */
async function descobrirHandle(nome, cidade, apiKey) {
  if (!apiKey) return null;
  const query = `"${nome}" instagram ${cidade || ''}`.replace(/\s+/g, ' ').trim();
  const url = `https://api.scrapingdog.com/google/?api_key=${apiKey}&query=${encodeURIComponent(query)}&country=br&results=10`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = Array.isArray(data && data.organic_results) ? data.organic_results : [];
    const candidatos = [];
    for (const r of results) {
      for (const field of [r.link, r.displayed_link]) {
        const h = field ? instagramHandleFromUrl(String(field)) : null;
        if (h && !candidatos.includes(h)) candidatos.push(h);
      }
    }
    if (candidatos.length === 0) return null;
    let melhor = candidatos[0];
    let melhorScore = handleCasaNome(melhor, nome);
    for (const h of candidatos.slice(1)) {
      const s = handleCasaNome(h, nome);
      if (s > melhorScore) { melhor = h; melhorScore = s; }
    }
    return melhor;
  } catch {
    return null;
  }
}

module.exports = {
  buscarSeguidores,
  instagramHandleFromUrl,
  handleFromHtml,
  handleCasaNome,
  descobrirHandle,
};
