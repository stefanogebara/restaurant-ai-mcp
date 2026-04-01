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
const { supabaseAdmin } = require('../_lib/supabase');
const { setWebhookCors, handlePreflight } = require('../_lib/cors');
const { rejectOversizedBody } = require('../_lib/rate-limit');
const { createSecureLogger } = require('../_lib/secure-logger');
const { validatePhoneNumber } = require('../_lib/validation');
const { generateSecureServiceId } = require('../_lib/secure-id');

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

    // Validate required fields
    if (!customer_phone || !customer_name || !party_size || total_bill === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: customer_phone, customer_name, party_size, total_bill',
      });
    }

    const phoneValidation = validatePhoneNumber(customer_phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    if (typeof total_bill !== 'number' || total_bill < 0) {
      return res.status(400).json({ error: 'total_bill must be a non-negative number' });
    }

    if (typeof party_size !== 'number' || party_size < 1 || party_size > 100) {
      return res.status(400).json({ error: 'party_size must be between 1 and 100' });
    }

    // Create service record
    const serviceId = generateSecureServiceId();
    const now = new Date().toISOString();

    const { data: serviceRecord, error: serviceError } = await supabaseAdmin
      .from('service_records')
      .insert({
        restaurant_id: restaurantId,
        service_id: serviceId,
        reservation_id: reservation_id || null,
        customer_name,
        customer_phone,
        party_size,
        total_bill,
        seated_at: now,
        actual_departure: now,
        status: 'completed',
      })
      .select('id, service_id')
      .single();

    if (serviceError) {
      logger.error('Failed to create service record', serviceError);
      return res.status(500).json({ error: 'Failed to create service record' });
    }

    // Update customer_ltv (fire-and-forget)
    updateCustomerLTV(restaurantId, customer_phone, customer_name, total_bill, party_size)
      .catch((err) => logger.warn('LTV update failed (non-fatal)', { error: err.message }));

    // Dispatch webhook event (fire-and-forget)
    try {
      const { dispatchEvent } = require('../services/webhookDispatcher');
      dispatchEvent(restaurantId, 'service.completed', {
        service_id: serviceId,
        reservation_id: reservation_id || null,
        customer_phone,
        customer_name,
        party_size,
        total_bill,
        payment_method: payment_method || null,
        completed_at: now,
      }).catch((err) => logger.warn('Webhook dispatch failed (non-fatal)', { error: err.message }));
    } catch {
      // webhookDispatcher not available — skip
    }

    logger.info('Service completion recorded', {
      serviceId,
      restaurant: restaurantId,
      totalBill: total_bill,
    });

    return res.status(201).json({
      success: true,
      service_id: serviceId,
      message: 'Service completion recorded',
    });
  } catch (err) {
    logger.error('Service completion error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update customer lifetime value
 * Upserts into customer_ltv table
 */
async function updateCustomerLTV(restaurantId, phone, name, billAmount, partySize) {
  // Check if customer exists
  const { data: existing } = await supabaseAdmin
    .from('customer_ltv')
    .select('id, total_spent, visit_count')
    .eq('restaurant_id', restaurantId)
    .eq('customer_phone', phone)
    .single();

  if (existing) {
    // Update existing customer
    const newTotalSpent = (existing.total_spent || 0) + billAmount;
    const newVisitCount = (existing.visit_count || 0) + 1;
    const avgSpend = newTotalSpent / newVisitCount;

    await supabaseAdmin
      .from('customer_ltv')
      .update({
        total_spent: newTotalSpent,
        visit_count: newVisitCount,
        avg_spend_per_visit: avgSpend,
        last_visit_date: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Create new customer record
    await supabaseAdmin
      .from('customer_ltv')
      .insert({
        restaurant_id: restaurantId,
        customer_phone: phone,
        customer_name: name,
        total_spent: billAmount,
        visit_count: 1,
        avg_spend_per_visit: billAmount,
        last_visit_date: new Date().toISOString(),
      });
  }
}
