/**
 * POS Service Completion Endpoint
 *
 * POST /api/pos/service-completion
 * Auth: API key via X-API-Key header
 *
 * POS pushes completed service with total_bill.
 * Creates a service_records entry and updates customer_ltv.
 */

const { verifyApiKey, hasPermission } = require('../_lib/api-key-auth');
const { setWebhookCors, handlePreflight } = require('../_lib/cors');
const { rejectOversizedBody } = require('../_lib/rate-limit');
const { createSecureLogger } = require('../_lib/secure-logger');
const { recordServiceCompletion } = require('../_lib/pos/service-completion-core');

const logger = createSecureLogger('POS-ServiceCompletion');

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;
  if (rejectOversizedBody(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate via API key
  let auth;
  try {
    auth = await verifyApiKey(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!hasPermission(auth.permissions, 'pos:service_completion')) {
    return res.status(403).json({ error: 'Insufficient permissions: pos:service_completion required' });
  }

  const restaurantId = auth.restaurant_id;

  try {
    const {
      reservation_id,
      customer_phone,
      customer_name,
      party_size,
      total_bill,
      payment_method,
    } = req.body || {};

    const result = await recordServiceCompletion({
      restaurantId,
      customerPhone: customer_phone,
      customerName: customer_name,
      partySize: party_size,
      totalBill: total_bill,
      paymentMethod: payment_method,
      reservationId: reservation_id,
      // Generic API-key path has no POS-side transaction ID; caller can
      // supply their own dedup via `reservation_id` if needed.
      posProvider: 'api-key',
      posTransactionId: null,
    });

    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    return res.status(201).json({
      success: true,
      service_id: result.service_id,
      message: 'Service completion recorded',
    });
  } catch (err) {
    logger.error('Service completion error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
