/**
 * Tests for the repo-based blog (Fase B do motor SEO).
 *
 * Content integrity acts as the automated inspector for every article that
 * gets added: required fields, unique URL-safe slugs, sane dates, no scripts
 * or event handlers smuggled into bodyHtml, and internal links that resolve.
 * Handler tests pin the /blog and /blog/:slug contracts (Article JSON-LD,
 * canonical, 404 PT-BR).
 */

const { ARTICLES, findArticle } = require('../_content/articles');
const { getMatrixEntries } = require('../_lib/seo-matrix');
const artigoHandler = require('../seo/artigo');
const blogIndexHandler = require('../seo/blog-index');

function mkRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

describe('article content integrity', () => {
  test('every article has the required fields', () => {
    expect(ARTICLES.length).toBeGreaterThanOrEqual(5);
    for (const a of ARTICLES) {
      expect(a.slug).toMatch(/^[a-z0-9-]+$/);
      expect(a.title.length).toBeGreaterThan(15);
      expect(a.metaDescription.length).toBeGreaterThan(50);
      expect(a.metaDescription.length).toBeLessThanOrEqual(170);
      expect(a.excerpt).toBeTruthy();
      expect(a.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.bodyHtml.length).toBeGreaterThan(1500); // substância, não stub
    }
  });

  test('slugs are unique', () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test('bodyHtml contains no scripts, event handlers or iframes', () => {
    for (const a of ARTICLES) {
      expect(a.bodyHtml).not.toMatch(/<script/i);
      expect(a.bodyHtml).not.toMatch(/<iframe/i);
      expect(a.bodyHtml).not.toMatch(/\son\w+\s*=/i);
      expect(a.bodyHtml).not.toMatch(/javascript:/i);
    }
  });

  test('articles use h2/h3 structure, never h1 (the handler owns the h1)', () => {
    for (const a of ARTICLES) {
      expect(a.bodyHtml).not.toMatch(/<h1[\s>]/i);
      expect(a.bodyHtml).toMatch(/<h2[\s>]/i);
    }
  });

  test('internal links resolve to real routes', () => {
    const validPrefixes = ['/demo/setup', '/precos', '/calculadora', '/live-demo', '/blog'];
    const matrixPaths = new Set(getMatrixEntries().map((e) => e.path));
    const blogPaths = new Set(ARTICLES.map((a) => `/blog/${a.slug}`));

    for (const a of ARTICLES) {
      const hrefs = [...a.bodyHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        expect(href.startsWith('/')).toBe(true); // só links internos no corpo
        const ok =
          validPrefixes.some((p) => href === p) ||
          matrixPaths.has(href) ||
          blogPaths.has(href);
        if (!ok) throw new Error(`Link interno quebrado em ${a.slug}: ${href}`);
      }
    }
  });

  test('findArticle resolves known slugs and rejects unknown', () => {
    expect(findArticle(ARTICLES[0].slug)).toBe(ARTICLES[0]);
    expect(findArticle('nao-existe')).toBeNull();
    expect(findArticle(undefined)).toBeNull();
  });
});

describe('GET /blog/:slug (artigo handler)', () => {
  test('renders the article with Article JSON-LD, breadcrumb and canonical', async () => {
    const a = ARTICLES[0];
    const res = mkRes();
    await artigoHandler({ method: 'GET', query: { slug: a.slug } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(`<h1>${a.title.replace(/&/g, '&amp;')}</h1>`);
    expect(res.body).toContain('"Article"');
    expect(res.body).toContain('BreadcrumbList');
    expect(res.body).toContain(`/blog/${a.slug}`);
    expect(res.body).toContain('lang="pt-BR"');
    expect(res.body).toContain('Leia também');
  });

  test('unknown slug returns PT-BR 404 with link back to /blog', async () => {
    const res = mkRes();
    await artigoHandler({ method: 'GET', query: { slug: 'nao-existe' } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Artigo não encontrado');
    expect(res.body).toContain('href="/blog"');
  });

  test('non-GET is rejected', async () => {
    const res = mkRes();
    await artigoHandler({ method: 'DELETE', query: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('GET /blog (index handler)', () => {
  test('lists every article with ItemList JSON-LD', async () => {
    const res = mkRes();
    await blogIndexHandler({ method: 'GET', query: {} }, res);
    expect(res.statusCode).toBe(200);
    for (const a of ARTICLES) {
      expect(res.body).toContain(`/blog/${a.slug}`);
    }
    expect(res.body).toContain('"ItemList"');
    expect(res.body).toContain('lang="pt-BR"');
  });
});
