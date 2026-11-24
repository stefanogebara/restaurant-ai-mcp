/**
 * The router of the one serverless function (api/index.js).
 *
 * vercel.json rewrites every /api/* address, and the few public addresses
 * served by code (/blog, /sitemap.xml, /v3/...), to api/index.js. Vercel
 * hands the function the ORIGINAL address, so the mapping that the old
 * per-file rewrites did (`/blog/:slug -> /api/seo/artigo?slug=:slug`) lives
 * here now, in one place.
 *
 * Never reads req.body: the webhooks that check signatures read the raw
 * request stream themselves (stripe, square, elevenlabs, whatsapp).
 */
const routes = require('./routes');

/** Public addresses and aliases → endpoint + extra query. First match wins. */
const REWRITES = [
  { pattern: /^\/proposta\/?$/, to: 'racha-proposta' },
  { pattern: /^\/sitemap\.xml$/, to: 'sitemap' },
  { pattern: /^\/restaurants\/([^/]+)\/([^/]+)\/?$/, to: 'seo/city-cuisine', query: (m) => ({ city: m[1], cuisine: m[2] }) },
  { pattern: /^\/sistema-de-reservas\/([^/]+)\/([^/]+)\/?$/, to: 'seo/reservas', query: (m) => ({ city: m[1], cuisine: m[2] }) },
  { pattern: /^\/blog\/?$/, to: 'seo/blog-index' },
  { pattern: /^\/blog\/([^/]+)\/?$/, to: 'seo/artigo', query: (m) => ({ slug: m[1] }) },
  { pattern: /^\/vs\/([^/]+)\/?$/, to: 'seo/vs', query: (m) => ({ competitor: m[1] }) },
  { pattern: /^\/v3\/(HealthCheck|BatchAvailabilityLookup|CreateBooking|UpdateBooking)\/?$/, to: 'google-booking/server', query: (m) => ({ action: m[1] }) },
  { pattern: /^\/api\/demo\/(create|session|convert|attach-contact)\/?$/, to: 'demo', query: (m) => ({ action: m[1] }) },
  { pattern: /^\/api\/square\/(auth|callback|sync)\/?$/, to: 'square', query: (m) => ({ route: m[1] }) },
  { pattern: /^\/api\/square\/webhook\/?$/, to: 'square-webhook' },
  { pattern: /^\/api\/subscription\/status\/?$/, to: 'subscription-status' },
];

const NOT_FOUND = 'api-not-found';

function decode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** Which endpoint serves this address, and the query the old rewrite added. */
function resolve(url) {
  const pathname = new URL(url || '/', 'http://localhost').pathname;
  for (const rule of REWRITES) {
    const m = pathname.match(rule.pattern);
    if (m) {
      const extra = rule.query ? rule.query(m.map(decode)) : {};
      return { key: rule.to, extra };
    }
  }
  const api = pathname.match(/^\/api\/(.+?)\/?$/);
  if (api) {
    const key = api[1].replace(/\.js$/, '');
    if (routes[key]) return { key, extra: {} };
    if (routes[`${key}/index`]) return { key: `${key}/index`, extra: {} };
  }
  return { key: NOT_FOUND, extra: {} };
}

function setQuery(req, extra) {
  const query = { ...Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams), ...(req.query || {}), ...extra };
  Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true, enumerable: true });
}

async function route(req, res) {
  const { key, extra } = resolve(req.url);
  setQuery(req, extra);
  const mod = routes[key]();
  const handler = typeof mod === 'function' ? mod : mod.default;
  return handler(req, res);
}

module.exports = { route, resolve, REWRITES };
