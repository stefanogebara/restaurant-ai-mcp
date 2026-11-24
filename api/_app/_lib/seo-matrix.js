/**
 * seo-matrix.js — single source of truth for the programmatic buyer-intent
 * SEO pages (/sistema-de-reservas/:cidade/:cozinha).
 *
 * The buyer is the restaurant OWNER, not the diner — every entry targets a
 * "sistema de reservas para {tipo} em {cidade}" style query in PT-BR.
 *
 * Page existence comes from THIS curated matrix, never from customer rows
 * (the old /restaurants pages 404'd unless a customer already existed in the
 * pair, which starved the engine). Market stats from prospect_leads and
 * customer social proof are optional per-page enrichments, resolved at render
 * time by api/seo/reservas.js.
 *
 * Consumed by: api/seo/reservas.js (validation + copy), api/sitemap.js
 * (URL list), api/cron/warm-seo-cache.js (warm list). Pure data + lookups —
 * no I/O — so it stays unit-testable and safe to import anywhere.
 */

/**
 * Major BR cities with real restaurant-SaaS demand. `name` doubles as the
 * ILIKE prefix used against prospect_leads.city (rows look like
 * "São Paulo, SP") and restaurant.restaurant_config.city ("São Paulo").
 */
const CITIES = [
  { slug: 'sao-paulo', name: 'São Paulo', uf: 'SP' },
  { slug: 'rio-de-janeiro', name: 'Rio de Janeiro', uf: 'RJ' },
  { slug: 'belo-horizonte', name: 'Belo Horizonte', uf: 'MG' },
  { slug: 'curitiba', name: 'Curitiba', uf: 'PR' },
  { slug: 'porto-alegre', name: 'Porto Alegre', uf: 'RS' },
  { slug: 'brasilia', name: 'Brasília', uf: 'DF' },
  { slug: 'salvador', name: 'Salvador', uf: 'BA' },
  { slug: 'recife', name: 'Recife', uf: 'PE' },
  { slug: 'fortaleza', name: 'Fortaleza', uf: 'CE' },
  { slug: 'florianopolis', name: 'Florianópolis', uf: 'SC' },
  { slug: 'goiania', name: 'Goiânia', uf: 'GO' },
  { slug: 'campinas', name: 'Campinas', uf: 'SP' },
  { slug: 'santos', name: 'Santos', uf: 'SP' },
  { slug: 'vitoria', name: 'Vitória', uf: 'ES' },
  { slug: 'belem', name: 'Belém', uf: 'PA' },
];

/**
 * Venue types with owner-side buyer intent. `label` is the singular noun
 * phrase ("restaurante japonês"), `plural` the natural plural — both are
 * grammatical units so copy templates never have to conjugate.
 */
const CUISINES = [
  { slug: 'japones', label: 'restaurante japonês', plural: 'restaurantes japoneses' },
  { slug: 'italiano', label: 'restaurante italiano', plural: 'restaurantes italianos' },
  { slug: 'pizzaria', label: 'pizzaria', plural: 'pizzarias' },
  { slug: 'churrascaria', label: 'churrascaria', plural: 'churrascarias' },
  { slug: 'hamburgueria', label: 'hamburgueria', plural: 'hamburguerias' },
  { slug: 'arabe', label: 'restaurante árabe', plural: 'restaurantes árabes' },
  { slug: 'mexicano', label: 'restaurante mexicano', plural: 'restaurantes mexicanos' },
  { slug: 'chines', label: 'restaurante chinês', plural: 'restaurantes chineses' },
  { slug: 'vegetariano', label: 'restaurante vegetariano', plural: 'restaurantes vegetarianos' },
  { slug: 'frutos-do-mar', label: 'restaurante de frutos do mar', plural: 'restaurantes de frutos do mar' },
  { slug: 'bar', label: 'bar', plural: 'bares' },
  { slug: 'cafe', label: 'café', plural: 'cafés' },
];

/** @returns {object|null} city entry for a URL slug, or null */
function findCity(slug) {
  return CITIES.find((c) => c.slug === String(slug || '').toLowerCase()) || null;
}

/** @returns {object|null} cuisine entry for a URL slug, or null */
function findCuisine(slug) {
  return CUISINES.find((c) => c.slug === String(slug || '').toLowerCase()) || null;
}

/**
 * Full cartesian of the matrix — one entry per page.
 * @returns {Array<{ city: object, cuisine: object, path: string, cacheKey: string }>}
 */
function getMatrixEntries() {
  const entries = [];
  for (const city of CITIES) {
    for (const cuisine of CUISINES) {
      entries.push({
        city,
        cuisine,
        path: `/sistema-de-reservas/${city.slug}/${cuisine.slug}`,
        cacheKey: `reservas:${city.slug}:${cuisine.slug}`,
      });
    }
  }
  return entries;
}

module.exports = { CITIES, CUISINES, findCity, findCuisine, getMatrixEntries };
