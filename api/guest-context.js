/**
 * Guest Context API
 *
 * REST endpoint for the host dashboard to fetch guest memory context.
 * Used when a reservation is selected or a walk-in is seated.
 *
 * GET /api/guest-context?phone=+34...
 * Returns formatted guest memory summary for display in the dashboard.
 */

const { verifyAuth } = require('./_lib/auth');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { buildGuestContext, getRecentMemories } = require('./services/guestMemory');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { inlineCheckSubscription } = require('./_lib/subscription-middleware');

const logger = createSecureLogger('GuestContext');

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'guest_context', 60, 60);
  if (rateLimited) return;

  // Authenticate
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(403).json({ message: 'No restaurant associated with your account.' });
  }

  // Subscription check
  const subBlocked = await inlineCheckSubscription(restaurantId, res);
  if (subBlocked) return;

  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ message: 'Phone number is required (query param: phone)' });
  }

  try {
    // Get formatted context (for AI prompt injection)
    const context = await buildGuestContext(restaurantId, phone, 'host_dashboard_lookup');

    // Get raw memories (for dashboard display)
    const memories = await getRecentMemories(restaurantId, phone, 20);

    return res.status(200).json({
      success: true,
      guest_phone: phone,
      has_memories: !!context,
      context: context || null,
      memories: memories.map(m => ({
        id: m.id,
        type: m.memory_type,
        content: m.content,
        importance: m.importance,
        created_at: m.created_at
      })),
      total: memories.length
    });
  } catch (error) {
    logger.error('Error fetching guest context:', error.message);
    return res.status(500).json({ message: 'Error fetching guest context' });
  }
};
