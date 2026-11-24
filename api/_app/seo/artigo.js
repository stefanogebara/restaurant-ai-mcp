/**
 * GET /api/seo/artigo?slug=:slug  →  /blog/:slug
 *
 * Server-rendered PT-BR blog article. Content lives in the repo
 * (api/_content/articles/) — no DB, no LLM at request time; the edge cache
 * headers on /api/seo/* (s-maxage=86400) make this effectively static.
 * Article JSON-LD + breadcrumb ship server-side.
 */

const { renderPage, escapeHtml } = require('../_lib/seo-html');
const { articleSchema, breadcrumbSchema } = require('../_lib/seo-schema');
const { ARTICLES, findArticle } = require('../_content/articles');

/** "2026-07-12" → "12 de julho de 2026" (fixed pt-BR month names — no locale dependency at runtime) */
const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function formatDatePt(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MONTHS_PT[m - 1]} de ${y}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method not allowed');
  }

  const article = findArticle(req.query.slug);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!article) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(404).send(
      renderPage({
        title: 'Artigo não encontrado | Blog Seatable',
        meta: 'Esse artigo não existe no blog da Seatable.',
        body: '<h1>Artigo não encontrado</h1><p>Esse artigo não existe. <a href="/blog">Ver todos os artigos</a>.</p>',
        lang: 'pt-BR',
      }),
    );
  }

  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  const canonicalPath = `/blog/${article.slug}`;
  const related = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 3);
  const relatedBlock = related.length
    ? `
    <h2>Leia também</h2>
    <ul>
      ${related.map((a) => `<li><a href="/blog/${a.slug}">${escapeHtml(a.title)}</a></li>`).join('\n      ')}
    </ul>`
    : '';

  const body = `
    <p class="article-meta"><a href="/blog">← Blog Seatable</a> · ${escapeHtml(formatDatePt(article.publishedAt))}</p>
    <h1>${escapeHtml(article.title)}</h1>
    ${article.bodyHtml}
    ${relatedBlock}
    <div class="cta-block">
      <h2>Veja o seu restaurante dentro da Seatable</h2>
      <p>Demo com os dados reais da sua casa em 30 segundos. Sem cartão, sem compromisso.</p>
      <a href="/demo/setup" class="cta-btn" style="display:inline-block;margin-top:1rem;">Ver demo grátis</a>
    </div>
  `;

  return res.send(
    renderPage({
      title: `${article.title} | Blog Seatable`,
      meta: article.metaDescription,
      body,
      canonical: canonicalPath,
      lang: 'pt-BR',
      jsonLd: [
        articleSchema({
          headline: article.title,
          description: article.metaDescription,
          url: canonicalPath,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt || article.publishedAt,
        }),
        breadcrumbSchema([
          { name: 'Início', url: '/' },
          { name: 'Blog', url: '/blog' },
          { name: article.title },
        ]),
      ],
    }),
  );
};
