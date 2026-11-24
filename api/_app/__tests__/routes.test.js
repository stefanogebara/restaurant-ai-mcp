/**
 * One serverless function (2026-11-24). Until then Vercel compiled 162 files
 * under api/ as 162 functions (~11 min a build). Now api/index.js is the only
 * entry and api/_app/router.js maps addresses to handlers. These tests keep
 * it that way and keep every old address working.
 */
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..', '..');
const APP = path.join(API, '_app');
const ROOT = path.join(API, '..');
const routes = require('../routes');
const { resolve } = require('../router');

function handlerFiles(dir = APP, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('_') || e.name === 'node_modules') return [];
    if (e.isDirectory()) return handlerFiles(path.join(dir, e.name), `${prefix}${e.name}/`);
    return e.name.endsWith('.js') ? [`${prefix}${e.name.slice(0, -3)}`] : [];
  });
}

describe('one serverless function', () => {
  it('api/ holds only index.js, package.json and underscore folders, so Vercel builds one function', () => {
    const top = fs.readdirSync(API, { withFileTypes: true });
    const others = top.filter((e) => !e.name.startsWith('_') && !e.name.startsWith('.'));
    expect(others.map((e) => e.name).sort()).toEqual(['index.js', 'package.json']);
  });

  it('every handler file has a route, and every route has a file', () => {
    const files = handlerFiles().filter((f) => f !== 'router' && f !== 'routes').sort();
    expect(Object.keys(routes).sort()).toEqual(files);
  });

  it('vercel.json declares only api/index.js and sends /api/* to it', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(Object.keys(vercel.functions)).toEqual(['api/index.js']);
    expect(vercel.rewrites).toContainEqual({ source: '/api/(.*)', destination: '/api/index.js' });
  });

  it('every cron address reaches a real handler', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const missing = vercel.crons.map((c) => c.path).filter((p) => resolve(p).key === 'api-not-found');
    expect(missing).toEqual([]);
  });
});

describe('addresses that the old per-file rewrites served', () => {
  it.each([
    ['/api/host-dashboard?x=1', 'host-dashboard', {}],
    ['/api/host-dashboard.js', 'host-dashboard', {}],
    ['/api/cron/run?group=daily', 'cron/run', {}],
    ['/api/onboarding/complete', 'onboarding/complete', {}],
    ['/api/demo/create', 'demo', { action: 'create' }],
    ['/api/square/callback?code=1', 'square', { route: 'callback' }],
    ['/api/square/webhook', 'square-webhook', {}],
    ['/api/subscription/status', 'subscription-status', {}],
    ['/sitemap.xml', 'sitemap', {}],
    ['/proposta', 'racha-proposta', {}],
    ['/blog', 'seo/blog-index', {}],
    ['/blog/sistema-de-reservas', 'seo/artigo', { slug: 'sistema-de-reservas' }],
    ['/restaurants/lisboa/italian', 'seo/city-cuisine', { city: 'lisboa', cuisine: 'italian' }],
    ['/sistema-de-reservas/sao-paulo/japonesa', 'seo/reservas', { city: 'sao-paulo', cuisine: 'japonesa' }],
    ['/vs/opentable', 'seo/vs', { competitor: 'opentable' }],
    ['/v3/HealthCheck/', 'google-booking/server', { action: 'HealthCheck' }],
    ['/v3/CreateBooking', 'google-booking/server', { action: 'CreateBooking' }],
    ['/api/does-not-exist', 'api-not-found', {}],
  ])('%s → %s', (url, key, extra) => {
    expect(resolve(url)).toEqual({ key, extra });
  });

  it('every route key loads a handler function', () => {
    // Dummy values: some modules build their clients at load time.
    Object.assign(process.env, {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_dummy',
      SUPABASE_URL: process.env.SUPABASE_URL || 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'dummy',
    });
    const notFunctions = Object.entries(routes).filter(([, load]) => {
      const mod = load();
      return typeof (typeof mod === 'function' ? mod : mod.default) !== 'function';
    }).map(([k]) => k);
    expect(notFunctions).toEqual([]);
  });
});
