/**
 * Fetches a Linktree-style aggregator page and parses out the individual
 * destination links. Used by recompute-tone when the IG `website` field
 * points at one of the known aggregators.
 *
 * Strategy:
 *   1. If the URL is on a known aggregator host (linktr.ee, beacons.ai,
 *      etc.), fetch the HTML with a real-browser User-Agent (a few of them
 *      block default Node fetch).
 *   2. Try the JSON-in-script extractor first — most aggregators
 *      server-render a __NEXT_DATA__/JSON dump that contains the canonical
 *      link list. This is fastest and most accurate.
 *   3. Fall back to a generic <a href> scrape: collect every <a> with an
 *      http(s) href that isn't on the aggregator's own host. Dedupe by URL,
 *      cap at MAX_LINKS, return as [{label, url, host}].
 *
 * Non-aggregator URLs return null (the caller should not store an empty
 * array for those — that would be a lie).
 *
 * Returns:
 *   null              — URL is not an aggregator we recognise (skip entirely)
 *   []                — aggregator page detected but no parseable destinations
 *   [{...}, ...]      — extracted destinations
 *
 * Throws only on programming errors. Network failures resolve to [] with
 * a logged warning so the caller can proceed.
 */

const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('instagram-bio-links');

const MAX_LINKS = 20;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1.5 * 1024 * 1024; // 1.5 MB — aggregator pages are usually <500KB

// User-Agent that several aggregators accept; default Node fetch UA gets
// blocked by Cloudflare on some of them.
const UA = 'Mozilla/5.0 (compatible; Seatable/1.0; +https://seatable.one)';

// Hosts we recognise as bio-link aggregators. Match is on suffix so e.g.
// "stefano.linktr.ee" still matches.
const AGGREGATOR_HOSTS = [
  'linktr.ee',
  'beacons.ai',
  'beacons.page',
  'lnk.bio',
  'snipfeed.co',
  'msha.ke',
  'biolinky.co',
  'taplink.cc',
  'tap.bio',
  'allmylinks.com',
  'shor.by',
  'campsite.bio',
  'koji.to',
  'withkoji.com',
  'flow.page',
  'milkshake.app',
  'solo.to',
  'carrd.co',  // carrd is borderline — many personal sites are carrd-hosted but
               // people also use it as a bio aggregator. Treat as aggregator.
];

function hostMatches(url) {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    return AGGREGATOR_HOSTS.find((agg) => host === agg || host.endsWith('.' + agg)) || null;
  } catch {
    return null;
  }
}

/**
 * Public entry. Returns null when URL is not an aggregator (caller skips
 * the write); returns [] when aggregator detected but no destinations
 * parseable; returns [{label,url,host},...] on success.
 */
async function extractBioLinks(url) {
  if (typeof url !== 'string' || url.length < 8) return null;
  const aggHost = hostMatches(url);
  if (!aggHost) return null;

  let html;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    logger.warn('aggregator fetch failed', { url, err: err.message });
    return [];
  }

  // Try JSON-in-script first (most accurate for Linktree/Beacons)
  const fromJson = extractFromNextData(html, aggHost);
  if (fromJson && fromJson.length > 0) {
    return capAndDedupe(fromJson);
  }

  // Fall back to <a href> scraping
  const fromScrape = extractFromAnchors(html, aggHost);
  return capAndDedupe(fromScrape);
}

async function fetchHtml(url) {
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: aborter.signal,
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    // Read body but cap to MAX_HTML_BYTES so a maliciously huge response
    // can't blow our memory.
    const reader = resp.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_HTML_BYTES) {
        reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
    return buf.toString('utf-8');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Linktree and several others embed an `__NEXT_DATA__` JSON block with the
 * canonical link list. Parse the JSON, then walk it looking for objects
 * with shapes like { title, url } or { label, href }.
 */
function extractFromNextData(html, aggHost) {
  const out = [];
  const blocks = [];

  // __NEXT_DATA__ — Linktree, Beacons (sometimes)
  let m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) blocks.push(m[1]);

  // application/ld+json — used by some
  const ldRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  while ((m = ldRe.exec(html)) !== null) blocks.push(m[1]);

  for (const block of blocks) {
    let parsed;
    try { parsed = JSON.parse(block.trim()); } catch { continue; }
    walkForLinks(parsed, aggHost, out);
  }
  return out;
}

function walkForLinks(node, aggHost, out, depth = 0) {
  if (depth > 12 || !node) return;  // bound recursion
  if (Array.isArray(node)) {
    for (const child of node) walkForLinks(child, aggHost, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  // Common shapes:
  //   { title|name|label, url|href|link }
  //   { content: { title, url } }
  const url = pickString(node, ['url', 'href', 'link', 'target_url']);
  const label = pickString(node, ['title', 'label', 'name', 'displayName', 'text']);
  if (url && /^https?:\/\//.test(url)) {
    try {
      const u = new URL(url);
      const host = u.host.toLowerCase();
      // Skip self-references (links back into the aggregator)
      if (!host.endsWith(aggHost)) {
        out.push({
          label: (label || u.host).slice(0, 100),
          url,
          host,
        });
      }
    } catch { /* malformed url — skip */ }
  }

  for (const key of Object.keys(node)) {
    if (key === 'url' || key === 'href' || key === 'link') continue;
    walkForLinks(node[key], aggHost, out, depth + 1);
  }
}

function pickString(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

/**
 * Generic fallback: find every <a href="http(s)://..."> in the HTML, dedupe,
 * filter out self-references. Less accurate than __NEXT_DATA__ but works
 * for aggregators we don't have a specific parser for.
 */
function extractFromAnchors(html, aggHost) {
  const out = [];
  const re = /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    let label = m[2]
      .replace(/<[^>]+>/g, '')         // strip nested tags
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    try {
      const u = new URL(url);
      const host = u.host.toLowerCase();
      if (host.endsWith(aggHost)) continue;  // self-link
      if (!label) label = host;
      out.push({ label: label.slice(0, 100), url, host });
    } catch { /* skip */ }
  }
  return out;
}

function capAndDedupe(links) {
  const seen = new Set();
  const out = [];
  for (const l of links) {
    if (!l || !l.url || seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

module.exports = {
  extractBioLinks,
  // Exposed for unit tests
  __test__: { hostMatches, extractFromAnchors, extractFromNextData, capAndDedupe, AGGREGATOR_HOSTS },
};
