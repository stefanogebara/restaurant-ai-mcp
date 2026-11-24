/**
 * Tests for api/_lib/seo-matrix.js — the single source of truth for the
 * buyer-intent programmatic pages. Pins slug uniqueness (duplicate slugs
 * would silently merge pages) and the lookup/cartesian contracts that
 * sitemap.js, reservas.js and warm-seo-cache.js all rely on.
 */

const { CITIES, CUISINES, findCity, findCuisine, getMatrixEntries } = require('../_lib/seo-matrix');

describe('seo-matrix data integrity', () => {
  test('city slugs are unique, lowercase, URL-safe and carry name + uf', () => {
    const slugs = CITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CITIES) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.name).toBeTruthy();
      expect(c.uf).toMatch(/^[A-Z]{2}$/);
    }
  });

  test('cuisine slugs are unique and every entry has grammatical label + plural', () => {
    const slugs = CUISINES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CUISINES) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.label).toBeTruthy();
      expect(c.plural).toBeTruthy();
    }
  });
});

describe('lookups', () => {
  test('findCity resolves known slugs case-insensitively and rejects unknown', () => {
    expect(findCity('sao-paulo')).toMatchObject({ name: 'São Paulo', uf: 'SP' });
    expect(findCity('SAO-PAULO')).toMatchObject({ slug: 'sao-paulo' });
    expect(findCity('gotham')).toBeNull();
    expect(findCity(undefined)).toBeNull();
  });

  test('findCuisine resolves known slugs and rejects unknown', () => {
    expect(findCuisine('japones')).toMatchObject({ plural: 'restaurantes japoneses' });
    expect(findCuisine('klingon')).toBeNull();
  });
});

describe('getMatrixEntries', () => {
  test('emits the full cartesian with consistent path and cacheKey', () => {
    const entries = getMatrixEntries();
    expect(entries).toHaveLength(CITIES.length * CUISINES.length);

    const sp = entries.find((e) => e.city.slug === 'sao-paulo' && e.cuisine.slug === 'japones');
    expect(sp.path).toBe('/sistema-de-reservas/sao-paulo/japones');
    expect(sp.cacheKey).toBe('reservas:sao-paulo:japones');

    // No duplicate pages
    const keys = entries.map((e) => e.cacheKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
