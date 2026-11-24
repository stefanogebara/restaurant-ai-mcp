/**
 * Índice do blog — fonte única dos artigos publicados.
 *
 * Publicar = adicionar o require aqui e mergear na main: o diff do PR é a
 * revisão editorial e o merge é o ato humano de publicação (nada é publicado
 * por cron ou pipeline automaticamente). Consumido por api/seo/artigo.js,
 * api/seo/blog-index.js e api/sitemap.js.
 */

const ARTICLES = [
  require('./no-show-restaurante'),
  require('./whatsapp-reservas'),
  require('./sistema-reservas-ia'),
  require('./dados-restaurantes-sp'),
  require('./comissao-por-reserva'),
].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

/** @returns {object|null} */
function findArticle(slug) {
  return ARTICLES.find((a) => a.slug === String(slug || '').toLowerCase()) || null;
}

module.exports = { ARTICLES, findArticle };
