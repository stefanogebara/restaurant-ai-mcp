/**
 * Catch-all 404 for unknown /api/* paths.
 *
 * Routed via vercel.json before the SPA index.html fallback. Without this
 * handler, requests to non-existent API routes (typos, removed endpoints,
 * scanning bots, stale integrations) get the SPA HTML with a 200 status.
 * That looks like success to API clients and confuses debugging.
 *
 * Returns a clean JSON 404 with `Cache-Control: no-store` so CDNs don't
 * cache the negative response.
 */

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(404).json({
    success: false,
    error: 'not_found',
    message: 'API endpoint not found',
    path: req.url || req.originalUrl || null,
  });
};
