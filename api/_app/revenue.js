/**
 * Retired manual-revenue API.
 *
 * This handler was written for a different revenue_records schema. The live
 * table stores amount_cents and recorded_at, while the old code read and wrote
 * total_revenue, service_date, and is_deleted. Its update path also selected a
 * record by id without restaurant scoping while using the service-role client.
 * Keep the URL as an explicit, authenticated 410 until a new manual-entry
 * contract is designed against the current POS schema.
 */

const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'revenue', 30, 60);
  if (rateLimited) return;

  const { user, error, status } = await verifyAuth(req);
  if (error) return res.status(status).json({ success: false, error });
  if (!user?.restaurant_id) {
    return res.status(403).json({ success: false, error: 'Restaurant context required' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    success: false,
    error: 'legacy_revenue_endpoint_retired',
    message: 'This endpoint is no longer compatible with the current revenue schema. Use /api/revenue-stats for read-only metrics.',
  });
};
