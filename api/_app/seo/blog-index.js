/**
 * GET /api/seo/blog-index  →  /blog
 *
 * Server-rendered PT-BR blog index — cards for every published article.
 * Content comes from the repo (api/_content/articles); effectively static
 * behind the /api/seo/* edge cache.
 */

const { renderPage, escapeHtml } = require('../_lib/seo-html');
const { itemListSchema, breadcrumbSchema } = require('../_lib/seo-schema');
const { ARTICLES } = require('../_content/articles');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method not allowed');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  const cards = ARTICLES.map(
    (a) => `
    <li class="article-card">
      <h2><a href="/blog/${a.slug}">${escapeHtml(a.title)}</a></h2>
      <p>${escapeHtml(a.excerpt)}</p>
    </li>`,
  ).join('\n');

  const body = `
    <h1>Blog Seatable</h1>
    <p class="lead">Operação, reservas e atendimento com IA — escrito para quem é dono de restaurante, sem enrolação.</p>
    <ul class="article-list">${cards}
    </ul>
    <div class="cta-block">
      <h2>Veja o seu restaurante dentro da Seatable</h2>
      <p>Demo com os dados reais da sua casa em 30 segundos. Sem cartão, sem compromisso.</p>
      <a href="/demo/setup" class="cta-btn" style="display:inline-block;margin-top:1rem;">Ver demo grátis</a>
    </div>
  `;

  return res.send(
    renderPage({
      title: 'Blog Seatable — operação e reservas para donos de restaurante',
      meta: 'Artigos sobre no-show, WhatsApp, atendimento com IA e a operação de reservas — escritos para donos de restaurante no Brasil.',
      body,
      canonical: '/blog',
      lang: 'pt-BR',
      jsonLd: [
        itemListSchema({
          name: 'Blog Seatable',
          items: ARTICLES.map((a) => ({ name: a.title, url: `/blog/${a.slug}` })),
        }),
        breadcrumbSchema([{ name: 'Início', url: '/' }, { name: 'Blog' }]),
      ],
    }),
  );
};
