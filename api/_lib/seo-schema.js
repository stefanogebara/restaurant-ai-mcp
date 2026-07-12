/**
 * seo-schema.js — pure builders for schema.org JSON-LD.
 *
 * Server SEO pages ship structured data so Google can render rich results
 * (rating stars, FAQ accordions, breadcrumbs). These are PURE functions: given
 * plain data they return plain JS objects; `renderJsonLd` serializes them into
 * crawler-safe <script type="application/ld+json"> tags.
 *
 * Kept separate from seo-html.js so the schema shapes are unit-testable in
 * isolation and reused by every page type (city pages, /vs, blog articles).
 */

const BASE_URL = process.env.CLIENT_URL || 'https://seatable.one';

/** Absolute-ize a path. Passes through values that are already absolute. */
function abs(pathOrUrl) {
  if (!pathOrUrl) return BASE_URL;
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
}

/**
 * SoftwareApplication schema for Seatable itself — the product being sold.
 * Include on every marketing page. aggregateRating is optional (only pass it
 * when you have real, defensible numbers — fabricating ratings is a penalty).
 */
function softwareApplicationSchema({
  name = 'Seatable',
  description,
  url = BASE_URL,
  priceCurrency = 'BRL',
  price = '497',
  rating,
} = {}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: abs(url),
    offers: {
      '@type': 'Offer',
      price: String(price),
      priceCurrency,
    },
  };
  if (description) schema.description = description;
  if (rating && rating.ratingValue && rating.ratingCount) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(rating.ratingValue),
      ratingCount: String(rating.ratingCount),
    };
  }
  return schema;
}

/**
 * FAQPage schema from [{ q, a }] pairs. Returns null for an empty list so
 * callers can spread it into a jsonLd array without guarding.
 */
function faqPageSchema(faqs) {
  const clean = (faqs || []).filter((f) => f && f.q && f.a);
  if (clean.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: clean.map((f) => ({
      '@type': 'Question',
      name: String(f.q),
      acceptedAnswer: { '@type': 'Answer', text: String(f.a) },
    })),
  };
}

/**
 * BreadcrumbList from [{ name, url }] items, in order. `url` is optional on the
 * last (current) crumb.
 */
function breadcrumbSchema(items) {
  const clean = (items || []).filter((i) => i && i.name);
  if (clean.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: clean.map((item, i) => {
      const el = {
        '@type': 'ListItem',
        position: i + 1,
        name: String(item.name),
      };
      if (item.url) el.item = abs(item.url);
      return el;
    }),
  };
}

/**
 * ItemList — an ordered list of named things (e.g. cities we cover, related
 * pages). Items may be strings or { name, url }.
 */
function itemListSchema({ name, items } = {}) {
  const clean = (items || [])
    .map((it) => (typeof it === 'string' ? { name: it } : it))
    .filter((it) => it && it.name);
  if (clean.length === 0) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: clean.map((item, i) => {
      const el = { '@type': 'ListItem', position: i + 1, name: String(item.name) };
      if (item.url) el.url = abs(item.url);
      return el;
    }),
  };
  if (name) schema.name = name;
  return schema;
}

/**
 * Article schema for blog posts.
 */
function articleSchema({
  headline,
  description,
  url,
  datePublished,
  dateModified,
  authorName = 'Seatable',
  imageUrl,
} = {}) {
  if (!headline) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: String(headline),
    author: { '@type': 'Organization', name: authorName },
    publisher: {
      '@type': 'Organization',
      name: 'Seatable',
      logo: { '@type': 'ImageObject', url: abs('/logo.png') },
    },
  };
  if (description) schema.description = description;
  if (url) schema.mainEntityOfPage = abs(url);
  if (datePublished) schema.datePublished = datePublished;
  if (dateModified || datePublished) schema.dateModified = dateModified || datePublished;
  if (imageUrl) schema.image = abs(imageUrl);
  return schema;
}

/**
 * Serialize one schema object or an array of them into <script> tags. Falsy
 * entries are dropped (so `[softwareApplicationSchema(), faqPageSchema([])]`
 * with an empty FAQ just omits the FAQ). Returns '' when nothing renders.
 *
 * Escaping '<' as < is enough to stop a literal "</script>" in the data
 * (e.g. inside a scraped review) from breaking out of the tag — a closing tag
 * cannot form without '<'. The content is parsed as JSON (not a JS string), so
 * line/paragraph separators need no special handling. The backslash is built
 * via fromCharCode(92) to keep this source byte-unambiguous.
 */
function renderJsonLd(schemas) {
  const list = (Array.isArray(schemas) ? schemas : [schemas]).filter(Boolean);
  if (list.length === 0) return '';
  const ltEscape = String.fromCharCode(92) + 'u003c';
  return list
    .map((schema) => {
      const json = JSON.stringify(schema).split('<').join(ltEscape);
      return `<script type="application/ld+json">${json}</script>`;
    })
    .join('\n  ');
}

module.exports = {
  softwareApplicationSchema,
  faqPageSchema,
  breadcrumbSchema,
  itemListSchema,
  articleSchema,
  renderJsonLd,
};
