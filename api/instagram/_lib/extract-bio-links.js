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

const dns = require('node:dns/promises');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('instagram-bio-links');

const MAX_LINKS = 20;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1.5 * 1024 * 1024; // 1.5 MB — aggregator pages are usually <500KB
const MAX_REDIRECT_HOPS = 3;

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

/**
 * Checks whether an IP literal falls inside any private/loopback/link-local
 * range. We resolve every URL host through DNS before fetching to block
 * SSRF against AWS/GCP metadata endpoints (169.254.169.254), internal
 * service meshes (10.0.0.0/8), and loopback. Aggregator URLs go through
 * public CDN IPs, so this is purely defensive: if the aggregator OR a
 * follow-on redirect resolves to a private IP we refuse to fetch.
 */
function isPrivateIp(ip) {
  if (typeof ip !== 'string') return true;
  // IPv6
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    // Unique-local fc00::/7 (fc.. or fd..)
    if (/^fc[0-9a-f]{2}:|^fd[0-9a-f]{2}:/.test(lower)) return true;
    // Link-local fe80::/10
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    // IPv4-mapped IPv6: ::ffff:x.x.x.x — fall through to v4 check
    const m = lower.match(/::ffff:([0-9.]+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  // IPv4
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  // 10/8, 127/8, 0/8
  if (a === 10 || a === 127 || a === 0) return true;
  // 172.16/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168/16
  if (a === 192 && b === 168) return true;
  // 169.254/16 — link-local incl. AWS metadata
  if (a === 169 && b === 254) return true;
  // 100.64/10 — carrier-grade NAT (RFC 6598), sometimes used internally
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertPublicHost(hostname) {
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    throw new Error(`dns lookup failed for ${hostname}: ${err.code || err.message}`);
  }
  if (!records || records.length === 0) {
    throw new Error(`no DNS records for ${hostname}`);
  }
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error(`refusing to fetch private IP ${r.address} (for ${hostname})`);
    }
  }
}

/**
 * Manual redirect-follower. Validates every hop's URL via assertPublicHost
 * to prevent SSRF: a 302 to http://169.254.169.254/... would otherwise let
 * an attacker who controls the IG website field (or compromises an
 * aggregator) pivot through our serverless function to internal endpoints.
 *
 * fetch(redirect: 'manual') is required so we see 3xx responses instead of
 * silently following them.
 */
async function fetchHtml(initialUrl) {
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), FETCH_TIMEOUT_MS);
  let url = initialUrl;

  try {
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(`invalid url: ${url}`);
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`refusing non-http protocol: ${parsed.protocol}`);
      }
      await assertPublicHost(parsed.hostname);

      const resp = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: aborter.signal,
        redirect: 'manual',
      });

      // Manual redirect handling — validate the next hop before following.
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        if (!location) throw new Error(`${resp.status} with no Location header`);
        if (hop >= MAX_REDIRECT_HOPS) throw new Error(`exceeded ${MAX_REDIRECT_HOPS} redirect hops`);
        // Resolve relative locations against the current URL
        url = new URL(location, url).toString();
        continue;
      }

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
    }
    // Should be unreachable — the loop either returns or throws.
    throw new Error('redirect loop did not terminate');
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
  __test__: { hostMatches, extractFromAnchors, extractFromNextData, capAndDedupe, isPrivateIp, AGGREGATOR_HOSTS },
};
