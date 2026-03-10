/**
 * Sitemap
 *
 * Returns a sitemap.xml listing all public booking pages
 * plus key static pages. Called at /sitemap.xml via vercel.json rewrite.
 */

const { supabaseAdmin } = require('./_lib/supabase');

const BASE_URL = 'https://seatable.one';

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
    { loc: `${BASE_URL}/pricing`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${BASE_URL}/features`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${BASE_URL}/contact`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${BASE_URL}/live-demo`, priority: '0.7', changefreq: 'monthly' },
  ];

  const staticEntries = staticPages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');

  const restaurantEntries = (restaurants || [])
    .filter(r => r.slug && !r.slug.startsWith('demo-') && !r.slug.startsWith('test-') && !r.slug.startsWith('logverify-'))
    .map(r => {
    const lastmod = r.updated_at ? r.updated_at.split('T')[0] : today;
    return `  <url>
    <loc>${BASE_URL}/book/${r.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('\n');

  // SEO city+cuisine pages
  const { slugify: seoSlugify } = require('./_lib/seo-html');
  const { data: seoPairs } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('city, restaurant_type')
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .not('city', 'is', null)
    .not('restaurant_type', 'is', null);

  const seenPairs = new Set();
  const seoEntries = (seoPairs || [])
    .map((r) => {
      const key = `${seoSlugify(r.city)}/${seoSlugify(r.restaurant_type)}`;
      if (seenPairs.has(key)) return null;
      seenPairs.add(key);
      return `  <url>
    <loc>${BASE_URL}/restaurants/${key}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    })
    .filter(Boolean)
    .join('\n');

  const vsEntries = ['opentable', 'resy', 'sevenrooms']
    .map(
      (c) => `  <url>
    <loc>${BASE_URL}/vs/${c}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${restaurantEntries}
${seoEntries}
${vsEntries}
</urlset>`;

  return res.status(200).send(xml);
};
