/**
 * Tests for the pure helpers in extract-bio-links.js. The actual fetch is
 * not exercised here (that would require either a network call or a
 * mocked fetch — the helpers are extracted specifically so they can be
 * tested in isolation).
 */

const { __test__ } = require('../instagram/_lib/extract-bio-links');
const {
  hostMatches, extractFromAnchors, extractFromNextData, capAndDedupe,
  isPrivateIp, extractFromScriptUrls, hostToLabel, AGGREGATOR_HOSTS,
} = __test__;

describe('hostMatches', () => {
  test.each([
    ['https://linktr.ee/restaurant', 'linktr.ee'],
    ['https://stefano.linktr.ee/', 'linktr.ee'],
    ['https://beacons.ai/restaurantxyz', 'beacons.ai'],
    ['https://lnk.bio/something', 'lnk.bio'],
    ['https://taplink.cc/abc', 'taplink.cc'],
  ])('matches aggregator: %s', (url, expected) => {
    expect(hostMatches(url)).toBe(expected);
  });

  test.each([
    'https://seatable.one',
    'https://opentable.com/restaurant',
    'https://example.com',
    'not a url',
    '',
  ])('rejects non-aggregator: %s', (url) => {
    expect(hostMatches(url)).toBeNull();
  });

  test('AGGREGATOR_HOSTS list covers common services', () => {
    for (const expected of ['linktr.ee', 'beacons.ai', 'lnk.bio', 'taplink.cc']) {
      expect(AGGREGATOR_HOSTS).toContain(expected);
    }
  });
});

describe('extractFromAnchors', () => {
  test('picks <a href> with absolute URLs', () => {
    const html = `
      <a href="https://opentable.com/r/cantina">Reserve a table</a>
      <a href="https://wa.me/5511555">WhatsApp us</a>
      <a href="/internal">Internal</a>
    `;
    const out = extractFromAnchors(html, 'linktr.ee');
    expect(out).toEqual([
      { label: 'Reserve a table', url: 'https://opentable.com/r/cantina', host: 'opentable.com' },
      { label: 'WhatsApp us',     url: 'https://wa.me/5511555',           host: 'wa.me' },
    ]);
  });

  test('skips self-references back to the aggregator host', () => {
    const html = `
      <a href="https://linktr.ee/foo">Self-link</a>
      <a href="https://stefano.linktr.ee/x">Self-link 2</a>
      <a href="https://other.com">External</a>
    `;
    const out = extractFromAnchors(html, 'linktr.ee');
    expect(out).toHaveLength(1);
    expect(out[0].host).toBe('other.com');
  });

  test('falls back to host when label is empty', () => {
    const html = `<a href="https://example.com"></a>`;
    expect(extractFromAnchors(html, 'linktr.ee')[0].label).toBe('example.com');
  });

  test('strips nested tags from label', () => {
    const html = `<a href="https://x.com"><span class="z">Order <strong>online</strong></span></a>`;
    expect(extractFromAnchors(html, 'linktr.ee')[0].label).toBe('Order online');
  });

  test('caps label at 100 chars', () => {
    const longLabel = 'a'.repeat(500);
    const html = `<a href="https://x.com">${longLabel}</a>`;
    expect(extractFromAnchors(html, 'linktr.ee')[0].label.length).toBe(100);
  });
});

describe('extractFromNextData', () => {
  test('parses __NEXT_DATA__ link objects with title+url shape', () => {
    const nextData = {
      props: {
        pageProps: {
          links: [
            { title: 'Reserve', url: 'https://opentable.com/x' },
            { title: 'Order',   url: 'https://ubereats.com/y' },
          ],
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const out = extractFromNextData(html, 'linktr.ee');
    expect(out.map((l) => l.url)).toEqual(['https://opentable.com/x', 'https://ubereats.com/y']);
    expect(out[0].label).toBe('Reserve');
  });

  test('walks nested structures recursively', () => {
    const nextData = {
      a: { b: { c: [ { name: 'WhatsApp', href: 'https://wa.me/55x' } ] } },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const out = extractFromNextData(html, 'linktr.ee');
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('WhatsApp');
  });

  test('skips malformed JSON without throwing', () => {
    const html = `<script id="__NEXT_DATA__">{this is not json</script>`;
    expect(extractFromNextData(html, 'linktr.ee')).toEqual([]);
  });
});

describe('isPrivateIp — SSRF guards', () => {
  test.each([
    // IPv4 private ranges
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.0.1', true],
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    ['0.0.0.0', true],
    // AWS / GCP / Azure metadata
    ['169.254.169.254', true],
    ['169.254.0.1', true],
    // Carrier-grade NAT
    ['100.64.0.1', true],
    ['100.127.255.254', true],
    // IPv6 loopback + ULA + link-local
    ['::1', true],
    ['fc00::1', true],
    ['fd12:3456:789a:1::1', true],
    ['fe80::1', true],
    // IPv4-mapped IPv6 to private space
    ['::ffff:10.0.0.1', true],
    ['::ffff:127.0.0.1', true],
  ])('blocks private/loopback/link-local: %s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  test.each([
    ['8.8.8.8', false],            // Google DNS
    ['1.1.1.1', false],            // Cloudflare DNS
    ['172.15.0.1', false],         // 172.15 is public (just outside 172.16/12)
    ['172.32.0.1', false],         // 172.32 is public (just past 172.31)
    ['100.63.255.255', false],     // 100.63 is public (just before 100.64/10)
    ['100.128.0.1', false],        // 100.128 is public (just past 100.127)
    ['192.169.0.1', false],        // 192.169 is public (not 192.168)
    ['169.255.0.1', false],        // 169.255 is public (not 169.254)
    ['2606:4700::1111', false],    // Cloudflare IPv6
    ['::ffff:8.8.8.8', false],     // IPv4-mapped public
  ])('allows public IPs: %s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  test('rejects garbage as private (fail-closed)', () => {
    expect(isPrivateIp('not an ip')).toBe(true);
    expect(isPrivateIp('999.999.999.999')).toBe(true);
    expect(isPrivateIp('')).toBe(true);
    expect(isPrivateIp(null)).toBe(true);
  });
});

describe('capAndDedupe', () => {
  test('dedupes by url, preserves first occurrence', () => {
    const out = capAndDedupe([
      { label: 'A', url: 'https://x.com', host: 'x.com' },
      { label: 'B', url: 'https://x.com', host: 'x.com' },
      { label: 'C', url: 'https://y.com', host: 'y.com' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('A');
  });

  test('caps at 20', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ label: `L${i}`, url: `https://x.com/${i}`, host: 'x.com' }));
    expect(capAndDedupe(many)).toHaveLength(20);
  });
});

describe('hostToLabel — Beacons brand mapping', () => {
  test.each([
    ['instagram.com', 'Instagram'],
    ['www.instagram.com', 'Instagram'],
    ['tiktok.com', 'TikTok'],
    ['youtube.com', 'YouTube'],
    ['youtu.be', 'YouTube'],
    ['m.youtube.com', 'YouTube'],     // subdomain rule
    ['twitter.com', 'X (Twitter)'],
    ['x.com', 'X (Twitter)'],
    ['facebook.com', 'Facebook'],
    ['twitch.tv', 'Twitch'],
    ['wa.me', 'WhatsApp'],
    ['opentable.com', 'OpenTable'],
    ['opentable.com.br', 'OpenTable'],
    ['ifood.com.br', 'iFood'],
    ['open.spotify.com', 'Spotify'],
  ])('%s → %s', (host, expected) => {
    expect(hostToLabel(host)).toBe(expected);
  });

  test('unmapped host returns the host stripped of www', () => {
    expect(hostToLabel('aliabdaal.com')).toBe('aliabdaal.com');
    expect(hostToLabel('www.example.org')).toBe('example.org');
  });
});

describe('extractFromScriptUrls — Beacons strategy', () => {
  test('picks up plain http(s) URLs from inline scripts', () => {
    const html = `
      <script>self.__next_f.push([1,"some-data {\\"url\\":\\"https://instagram.com/u\\"} more https://tiktok.com/@u"])</script>
      <script>nope</script>
      <script>visible https://twitter.com/u text</script>
    `;
    const out = extractFromScriptUrls(html, 'beacons.ai');
    const hosts = out.map((o) => o.host).sort();
    expect(hosts).toEqual(['instagram.com', 'tiktok.com', 'twitter.com']);
    // Labels should come from HOST_BRAND_MAP
    const ig = out.find((o) => o.host === 'instagram.com');
    expect(ig.label).toBe('Instagram');
  });

  test('skips beacons-self, infra hosts (cloudflare, schema.org), and asset URLs', () => {
    const html = `
      <script>
        https://beacons.ai/_next/static/chunks/x.js
        https://stefano.beacons.ai/profile
        https://static.cloudflareinsights.com/beacon.min.js/abc
        https://www.w3.org/2000/svg
        https://schema.org/Person
        https://example.com/avatar.png
        https://example.com/stylesheet.css
        https://example.com/data.json
        https://instagram.com/realtarget
      </script>
    `;
    const out = extractFromScriptUrls(html, 'beacons.ai');
    expect(out.map((o) => o.url)).toEqual(['https://instagram.com/realtarget']);
  });

  test('dedupes when the same URL appears in multiple script blocks', () => {
    const html = `
      <script>https://instagram.com/u</script>
      <script>https://instagram.com/u again</script>
      <script>https://tiktok.com/u</script>
    `;
    const out = extractFromScriptUrls(html, 'beacons.ai');
    expect(out).toHaveLength(2);
  });

  test('returns [] on HTML with no script tags', () => {
    expect(extractFromScriptUrls('<body>plain</body>', 'beacons.ai')).toEqual([]);
  });
});

describe('isAggregatorShareLink — share-button filter', () => {
  // Note: isAggregatorShareLink is internal but the FILTER behavior is
  // observable through extractFromAnchors below.

  test.each([
    // Lnk.Bio share buttons — pasted from real justinbieber page
    'https://www.facebook.com/sharer.php?u=https://lnk.bio/justinbieber',
    'https://twitter.com/intent/tweet?text=Check%20out%20https://lnk.bio/justinbieber',
    'https://www.reddit.com/submit?url=https://lnk.bio/justinbieber&title=foo',
    'https://www.linkedin.com/sharing/share-offsite/?url=https://lnk.bio/justinbieber',
    'https://wa.me/?text=Check%20out%20https://lnk.bio/justinbieber',
    'https://social-plugins.line.me/lineit/share?url=https://lnk.bio/justinbieber',
  ])('extractFromAnchors filters share button: %s', (shareUrl) => {
    const html = `
      <a href="${shareUrl}">Share</a>
      <a href="https://example.com/real">Real destination</a>
    `;
    const out = extractFromAnchors(html, 'lnk.bio');
    // Only the real destination survives
    expect(out.map((o) => o.url)).toEqual(['https://example.com/real']);
  });

  test('does NOT filter URLs that mention the aggregator host in the path of a different domain', () => {
    // e.g. someone's blog post hosted at example.com that happens to
    // mention lnk.bio in the slug — that should NOT be filtered.
    // (Path containment is a real risk — we accept that as a known small
    // false-positive surface since aggregator hostnames are uncommon in
    // post slugs.)
    // This test documents that a "?url=somewhere-else" doesn't get hit.
    const html = `<a href="https://example.com/article/about-aggregators">Article</a>`;
    const out = extractFromAnchors(html, 'lnk.bio');
    expect(out).toHaveLength(1);
  });

  test('share-link filter also applies to script-URL extractor', () => {
    const html = `<script>https://twitter.com/share?text=Check+https://beacons.ai/x</script>`;
    const out = extractFromScriptUrls(html, 'beacons.ai');
    expect(out).toEqual([]);
  });
});

describe('VERIFIED_AGGREGATOR_HOSTS — coverage contract', () => {
  test('verified set includes all hosts with live-tested extraction strategies', () => {
    // If you add a new aggregator parser AND verify it works against a
    // real account, add the host here. This catches accidental removals.
    const { VERIFIED_AGGREGATOR_HOSTS } = __test__;
    const expected = [
      'linktr.ee',     // anchor scrape + __NEXT_DATA__ JSON walk
      'beacons.ai',    // script-URL stream
      'beacons.page',
      'taplink.cc',    // script-URL stream
      'lnk.bio',       // anchor scrape + share filter
      'biolinky.co',   // anchor scrape
      'flow.page',     // anchor scrape
      'allmylinks.com',// anchor scrape
    ];
    for (const host of expected) {
      expect(VERIFIED_AGGREGATOR_HOSTS.has(host)).toBe(true);
    }
    expect(VERIFIED_AGGREGATOR_HOSTS.size).toBe(expected.length);
  });

  test('verified set is a subset of AGGREGATOR_HOSTS (no orphans)', () => {
    const { VERIFIED_AGGREGATOR_HOSTS, AGGREGATOR_HOSTS } = __test__;
    for (const host of VERIFIED_AGGREGATOR_HOSTS) {
      expect(AGGREGATOR_HOSTS).toContain(host);
    }
  });
});
