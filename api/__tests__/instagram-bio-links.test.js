/**
 * Tests for the pure helpers in extract-bio-links.js. The actual fetch is
 * not exercised here (that would require either a network call or a
 * mocked fetch — the helpers are extracted specifically so they can be
 * tested in isolation).
 */

const { __test__ } = require('../instagram/_lib/extract-bio-links');
const { hostMatches, extractFromAnchors, extractFromNextData, capAndDedupe, AGGREGATOR_HOSTS } = __test__;

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
