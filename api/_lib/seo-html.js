/**
 * SEO HTML renderer — shared shell for all SEO landing pages.
 */

const { renderJsonLd } = require('./seo-schema');

const BASE_URL = process.env.CLIENT_URL || 'https://seatable.one';

/**
 * Per-locale chrome strings. 'en' preserves the exact original copy so existing
 * English pages (/restaurants, /vs) render byte-identically until migrated.
 */
const LOCALE = {
  en: { htmlLang: 'en', cta: 'Try free demo', footer: 'AI-powered restaurant reservations.' },
  'pt-BR': { htmlLang: 'pt-BR', cta: 'Ver demo grátis', footer: 'Reservas com IA para restaurantes.' },
};

/**
 * Convert a string to a URL-safe slug.
 * Strips diacritics, lowercases, replaces spaces with hyphens.
 * @param {string} str
 * @returns {string}
 */
function slugify(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Title-case a string (capitalize first letter of each word).
 * @param {string} str
 * @returns {string}
 */
function titleCase(str) {
  return String(str).replace(
    /\w\S*/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}

/**
 * Escape HTML special characters to prevent XSS in attributes and text.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a complete HTML page with nav, main, and footer.
 * @param {{ title: string, meta: string, body: string, canonical?: string,
 *   lang?: 'en'|'pt-BR', jsonLd?: object|object[], ctaLabel?: string,
 *   ctaHref?: string }} opts
 * @returns {string}
 */
function renderPage({ title, meta, body, canonical, lang = 'en', jsonLd, ctaLabel, ctaHref = '/demo/setup' }) {
  const L = LOCALE[lang] || LOCALE.en;
  const cta = ctaLabel || L.cta;
  const canonicalTag = canonical
    ? `<link rel="canonical" href="${escapeHtml(BASE_URL + canonical)}" />`
    : '';
  const jsonLdTags = jsonLd ? renderJsonLd(jsonLd) : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(L.htmlLang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(meta)}" />
  ${canonicalTag}
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(meta)}" />
  <meta property="og:type" content="website" />
  ${jsonLdTags}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #fafaf9; color: #1c1917; }
    nav { padding: 1.5rem 4rem; border-bottom: 1px solid #e7e5e4; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 1.5rem; font-weight: 600; text-decoration: none; color: #1c1917; }
    .logo span { color: #7c2d2d; }
    .cta-btn { padding: 0.625rem 1.5rem; background: #7c2d2d; color: #fff; border-radius: 9999px; text-decoration: none; font-size: 0.875rem; font-weight: 600; }
    .cta-btn:hover { background: #6b2525; }
    main { max-width: 900px; margin: 0 auto; padding: 4rem 2rem 6rem; }
    h1 { font-size: 2.5rem; font-weight: 700; line-height: 1.2; margin-bottom: 1rem; }
    .lead { font-size: 1.125rem; color: #57534e; margin-bottom: 3rem; line-height: 1.7; }
    h2 { font-size: 1.5rem; font-weight: 600; margin: 2.5rem 0 1rem; }
    p { line-height: 1.8; color: #44403c; margin-bottom: 1rem; }
    .restaurant-list { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin: 1.5rem 0 3rem; }
    .restaurant-list li a { display: block; padding: 1rem 1.25rem; background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; text-decoration: none; color: #1c1917; font-weight: 500; transition: border-color 0.15s; }
    .restaurant-list li a:hover { border-color: #7c2d2d; }
    .cta-block { background: #1c1917; border-radius: 1.5rem; padding: 3rem; text-align: center; margin-top: 3rem; }
    .cta-block h2 { color: #fff; margin-top: 0; }
    .cta-block p { color: #a8a29e; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
    th, td { padding: 0.875rem 1rem; text-align: left; border-bottom: 1px solid #e7e5e4; }
    th { font-weight: 600; background: #f5f5f4; }
    td.check { color: #16a34a; font-size: 1.25rem; }
    td.cross { color: #dc2626; font-size: 1.25rem; }
    footer { text-align: center; padding: 2rem; color: #a8a29e; font-size: 0.875rem; border-top: 1px solid #e7e5e4; }
  </style>
</head>
<body>
  <nav>
    <a href="/" class="logo">seatable<span>.</span></a>
    <a href="${escapeHtml(ctaHref)}" class="cta-btn">${escapeHtml(cta)}</a>
  </nav>
  <main>${body}</main>
  <footer>&copy; ${new Date().getFullYear()} Seatable. ${escapeHtml(L.footer)}</footer>
</body>
</html>`;
}

module.exports = { renderPage, slugify, titleCase, escapeHtml };
