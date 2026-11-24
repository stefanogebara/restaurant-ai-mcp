/**
 * SSRF-safe HTTP fetch for user-controlled URLs.
 *
 * Why this exists: any endpoint that fetches a URL the user (or an
 * untrusted upstream like a Google Places result) can influence is an
 * SSRF surface. Vanilla `fetch(url, { redirect: 'follow' })` will happily
 * follow a 302 to http://169.254.169.254/latest/meta-data/iam/security-
 * credentials/ (AWS EC2 metadata) and hand the response back to the
 * caller — exfiltrating service-role secrets through a feature that looks
 * like a benign "enrich this restaurant by scraping their website".
 *
 * This helper:
 *   - Requires http(s) — refuses file://, gopher://, data:, etc.
 *   - DNS-resolves every hop's hostname via dns.lookup({all:true}) and
 *     refuses IPs in loopback / RFC1918 / link-local / multicast /
 *     CGNAT / IPv6 loopback / ULA / link-local / IPv4-mapped IPv6.
 *   - Sets `redirect: 'manual'` and re-validates the Location of each
 *     3xx through the same allowlist before re-fetching (default fetch
 *     follows redirects opaquely → a public host can 302 to a private
 *     one + bypass any pre-fetch DNS check).
 *   - Caps the response body to maxBytes (defaults to 1.5 MB) so a
 *     malicious response can't blow our memory.
 *   - Bounds the whole operation with AbortController + timeoutMs.
 *
 * Returns the response text on success. Throws a descriptive Error on
 * any rejection — caller decides whether to surface a generic 4xx or
 * swallow + log.
 *
 * This is the same pattern shipped earlier for Phase C aggregator
 * scraping (commit 843026c8 against api/instagram/_lib/extract-bio-links.js)
 * — factored here so we have one tested implementation instead of two.
 */

const dns = require('node:dns/promises');

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1.5 * 1024 * 1024;  // 1.5 MB
const DEFAULT_MAX_HOPS = 3;

const DEFAULT_HEADERS = {
  // Many real sites (Cloudflare/Sucuri) block bare fetch UAs. Identify
  // as a desktop browser so we look ordinary.
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en;q=0.7,pt;q=0.7,es;q=0.7',
};

/**
 * IP-literal blocklist check. Returns true for any address we should
 * refuse to fetch. Errs on the side of "private" — unknown IP families,
 * malformed strings, etc. all return true (fail closed).
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
    // Multicast ff00::/8
    if (/^ff[0-9a-f]{2}:/.test(lower)) return true;
    // IPv4-mapped IPv6: ::ffff:x.x.x.x — recurse with the embedded v4
    const m = lower.match(/::ffff:([0-9.]+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }

  // IPv4
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  // 0/8 (current network), 10/8, 127/8 (loopback)
  if (a === 0 || a === 10 || a === 127) return true;
  // 172.16/12 (RFC1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168/16 (RFC1918)
  if (a === 192 && b === 168) return true;
  // 169.254/16 link-local (includes AWS / GCP / Azure metadata endpoints)
  if (a === 169 && b === 254) return true;
  // 100.64/10 carrier-grade NAT (RFC 6598) — sometimes used for internal
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 multicast (anything 224-239 in first octet)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 reserved
  if (a >= 240) return true;
  return false;
}

/**
 * Resolve `hostname` via DNS and throw if ANY resolved IP is private.
 * We refuse rather than filter because a hostname that resolves to BOTH
 * a public and a private IP (DNS rebinding setup) shouldn't be trusted.
 */
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
 * SSRF-safe wrapper around fetch(). See the file header for the
 * threat model + guarantees.
 *
 * options:
 *   timeoutMs   — total deadline for the entire chain (default 10s)
 *   maxBytes    — body byte cap (default 1.5 MB)
 *   maxHops     — max redirect follows (default 3)
 *   headers     — request headers (default: browser-like UA + accept)
 *
 * Returns: { text, finalUrl, truncated }
 */
async function safeFetchText(initialUrl, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxHops = DEFAULT_MAX_HOPS,
    headers = DEFAULT_HEADERS,
  } = options;

  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), timeoutMs);
  let url = initialUrl;

  try {
    for (let hop = 0; hop <= maxHops; hop++) {
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
        method: 'GET',
        headers,
        signal: aborter.signal,
        redirect: 'manual',
      });

      // Manual redirect handling — validate the next hop before following.
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        if (!location) throw new Error(`${resp.status} with no Location header`);
        if (hop >= maxHops) throw new Error(`exceeded ${maxHops} redirect hops`);
        // Resolve relative locations against the current URL.
        url = new URL(location, url).toString();
        continue;
      }

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // Read body in chunks, capping at maxBytes. Stops reading once cap is
      // hit so a malicious response can't blow our memory.
      const reader = resp.body.getReader();
      const chunks = [];
      let total = 0;
      let truncated = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          reader.cancel().catch(() => {});
          truncated = true;
          break;
        }
        chunks.push(value);
      }
      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      return { text: buf.toString('utf-8'), finalUrl: resp.url || url, truncated };
    }
    // Loop terminates by returning or throwing — unreachable.
    throw new Error('redirect loop did not terminate');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  safeFetchText,
  // Exported for the existing extract-bio-links.js to migrate onto this
  // shared implementation in a follow-up, and for unit tests.
  isPrivateIp,
  assertPublicHost,
};
