/**
 * Unit tests for the pure JSON-LD schema builders (api/_lib/seo-schema.js).
 * These run with no DB/network — they pin the schema.org shapes and the
 * <script> hardening so a future edit can't silently break rich results or
 * open an XSS hole via scraped review text.
 */

const {
  softwareApplicationSchema,
  faqPageSchema,
  breadcrumbSchema,
  itemListSchema,
  articleSchema,
  renderJsonLd,
} = require('../_lib/seo-schema');

describe('softwareApplicationSchema', () => {
  it('builds a SoftwareApplication with a BRL Offer by default', () => {
    const s = softwareApplicationSchema();
    expect(s['@type']).toBe('SoftwareApplication');
    expect(s.name).toBe('Seatable');
    expect(s.offers).toEqual({ '@type': 'Offer', price: '497', priceCurrency: 'BRL' });
    expect(s.aggregateRating).toBeUndefined();
  });

  it('includes aggregateRating only when both value and count are present', () => {
    expect(softwareApplicationSchema({ rating: { ratingValue: 4.8 } }).aggregateRating).toBeUndefined();
    const s = softwareApplicationSchema({ rating: { ratingValue: 4.8, ratingCount: 120 } });
    expect(s.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '120',
    });
  });
});

describe('faqPageSchema', () => {
  it('returns null for empty / missing input', () => {
    expect(faqPageSchema([])).toBeNull();
    expect(faqPageSchema(undefined)).toBeNull();
    expect(faqPageSchema([{ q: '', a: 'x' }])).toBeNull();
  });

  it('maps {q,a} pairs to Question/Answer entities', () => {
    const s = faqPageSchema([{ q: 'Quanto custa?', a: 'A partir de R$497.' }]);
    expect(s['@type']).toBe('FAQPage');
    expect(s.mainEntity).toHaveLength(1);
    expect(s.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'Quanto custa?',
      acceptedAnswer: { '@type': 'Answer', text: 'A partir de R$497.' },
    });
  });
});

describe('breadcrumbSchema', () => {
  it('numbers items from 1 and absolute-izes relative urls', () => {
    const s = breadcrumbSchema([
      { name: 'Início', url: '/' },
      { name: 'São Paulo' }, // current crumb, no url
    ]);
    expect(s['@type']).toBe('BreadcrumbList');
    expect(s.itemListElement[0]).toMatchObject({ position: 1, name: 'Início', item: 'https://seatable.one/' });
    expect(s.itemListElement[1]).toMatchObject({ position: 2, name: 'São Paulo' });
    expect(s.itemListElement[1].item).toBeUndefined();
  });

  it('returns null when nothing has a name', () => {
    expect(breadcrumbSchema([{ url: '/x' }])).toBeNull();
  });
});

describe('itemListSchema', () => {
  it('accepts plain strings and {name,url} objects', () => {
    const s = itemListSchema({ name: 'Cidades', items: ['Curitiba', { name: 'Recife', url: '/x' }] });
    expect(s['@type']).toBe('ItemList');
    expect(s.name).toBe('Cidades');
    expect(s.itemListElement[0]).toEqual({ '@type': 'ListItem', position: 1, name: 'Curitiba' });
    expect(s.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: 'Recife', url: 'https://seatable.one/x' });
  });

  it('returns null on empty', () => {
    expect(itemListSchema({ items: [] })).toBeNull();
  });
});

describe('articleSchema', () => {
  it('returns null without a headline', () => {
    expect(articleSchema({ description: 'x' })).toBeNull();
  });

  it('defaults dateModified to datePublished', () => {
    const s = articleSchema({ headline: 'Como reduzir no-show', datePublished: '2026-07-12' });
    expect(s['@type']).toBe('Article');
    expect(s.datePublished).toBe('2026-07-12');
    expect(s.dateModified).toBe('2026-07-12');
  });
});

describe('renderJsonLd', () => {
  it('returns empty string when nothing renders', () => {
    expect(renderJsonLd([])).toBe('');
    expect(renderJsonLd([null, false, undefined])).toBe('');
    expect(renderJsonLd(null)).toBe('');
  });

  it('wraps a single schema in an ld+json script tag', () => {
    const out = renderJsonLd(softwareApplicationSchema());
    expect(out).toMatch(/^<script type="application\/ld\+json">/);
    expect(out).toMatch(/<\/script>$/);
    expect(out).toContain('"SoftwareApplication"');
  });

  it('drops falsy entries and joins multiple schemas', () => {
    const out = renderJsonLd([softwareApplicationSchema(), faqPageSchema([]), breadcrumbSchema([{ name: 'A', url: '/' }])]);
    expect((out.match(/<script/g) || []).length).toBe(2); // FAQ was null → dropped
  });

  it('escapes < so a literal </script> in data cannot break out of the tag', () => {
    const out = renderJsonLd({ '@type': 'Thing', name: 'Best </script> ever' });
    expect(out).not.toContain('</script> ever'); // the inner one must be escaped
    expect(out).toContain('\\u003c/script'); // escaped form present
    expect((out.match(/<\/script>/g) || []).length).toBe(1); // only the real closing tag
  });
});
