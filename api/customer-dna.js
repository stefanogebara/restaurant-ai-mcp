/**
 * Retired Customer DNA API.
 *
 * The published customer_behavioral_profiles table is global and has no
 * restaurant_id. The previous handler used the service-role client and could
 * read profiles, reservations and predictions without tenant isolation. A
 * future replacement needs tenant-owned storage before this route reopens.
 */

const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'customer_dna', 60, 60);
  if (rateLimited) return;

  const { user, error, status } = await verifyAuth(req);
  if (error) return res.status(status).json({ success: false, error });
  if (!user?.restaurant_id) {
    return res.status(403).json({ success: false, error: 'Restaurant context required' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    success: false,
    error: 'legacy_customer_dna_endpoint_retired',
    message: 'Customer DNA is unavailable until its data is isolated by restaurant. Use the Customers page for current customer records.',
  });
};
