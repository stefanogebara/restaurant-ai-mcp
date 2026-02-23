/**
 * Sitemap
 *
 * Returns a sitemap.xml listing all public booking pages
 * plus key static pages. Called at /sitemap.xml via vercel.json rewrite.
 */

const { supabaseAdmin } = require('./_lib/supabase');

const BASE_URL = 'https://restaurant-ai-mcp.vercel.app';

module.exports = async (req, res) => {
  // CORS not needed — this is XML consumed by search engines
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  const today = new Date().toISOString().split('T')[0];

  // Fetch all active, onboarded restaurants with slugs
  const { data: restaurants } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('slug, updated_at')
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .not('slug', 'is', null);

  const staticPages = [
    { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${BASE_URL}/live-demo`, priority: '0.7', changefreq: 'monthly' },
  ];

  const staticEntries = staticPages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');

  const restaurantEntries = (restaurants || []).map(r => {
    const lastmod = r.updated_at ? r.updated_at.split('T')[0] : today;
    return `  <url>
    <loc>${BASE_URL}/book/${r.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${restaurantEntries}
</urlset>`;

  return res.status(200).send(xml);
};
