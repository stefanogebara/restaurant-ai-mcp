/**
 * Service-completion core.
 *
 * Pulled out of api/pos/service-completion.js so two callers can share it:
 *   - /api/pos/service-completion      — API-key auth, push from any POS
 *   - /api/square/webhook              — HMAC auth, Square payment events
 *
 * The function does four things, in order:
 *   1. INSERT into public.service_records   (operational tracking)
 *   2. INSERT into public.revenue_records   (analytics + LTV source)
 *   3. UPSERT customer_ltv                  (running per-customer revenue)
 *   4. Dispatch service.completed webhook   (best-effort, fire-and-forget)
 *
 * Steps 3 + 4 are non-fatal — if they fail the service record still
 * stands. The caller gets a `service_id` back.
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { validatePhoneNumber } = require('../validation');
const { generateSecureServiceId } = require('../secure-id');

const logger = createSecureLogger('service-completion-core');

/**
 * @param {object} params
 * @param {string}  params.restaurantId
 * @param {string}  params.customerPhone   E.164
 * @param {string}  params.customerName
 * @param {number}  params.partySize       1..100
 * @param {number}  params.totalBill       non-negative number (currency unit)
 * @param {string?} params.paymentMethod   "card" | "cash" | etc — optional, stored on revenue
 * @param {string?} params.reservationId   public.reservations.reservation_id, when known
 * @param {string?} params.posProvider     "square" | "stripe-pos" | etc
 * @param {string?} params.posTransactionId Idempotency key from the POS — dedup safety
 * @param {string?} params.currency        ISO 4217 (default: 'BRL'). Stored on revenue_records.
 * @returns {Promise<{ok:boolean, service_id?:string, revenue_id?:string, error?:string, status?:number, duplicate?:boolean}>}
 */
async function recordServiceCompletion({
  restaurantId,
  customerPhone,
  customerName,
  partySize,
  totalBill,
  paymentMethod = null,
  reservationId = null,
  posProvider = null,
  posTransactionId = null,
  currency = 'BRL',
}) {
  // -- Validation -----------------------------------------------------------
  if (!restaurantId) return { ok: false, status: 400, error: 'restaurantId required' };
  if (!customerPhone || !customerName || !partySize || totalBill === undefined || totalBill === null) {
    return { ok: false, status: 400, error: 'Missing required fields: customer_phone, customer_name, party_size, total_bill' };
  }
  const phoneValidation = validatePhoneNumber(customerPhone);
  if (!phoneValidation.valid) return { ok: false, status: 400, error: phoneValidation.error };
  if (typeof totalBill !== 'number' || totalBill < 0) {
    return { ok: false, status: 400, error: 'total_bill must be a non-negative number' };
  }
  if (typeof partySize !== 'number' || partySize < 1 || partySize > 100) {
    return { ok: false, status: 400, error: 'party_size must be between 1 and 100' };
  }

  // -- Idempotency check (defensive) ---------------------------------------
  // Square retries webhooks. If we've already recorded this transaction,
  // return the existing service_id instead of inserting a duplicate.
  if (posTransactionId && posProvider) {
    const { data: existing } = await supabaseAdmin
      .from('revenue_records')
      .select('id, service_id:reservation_id')
      .eq('restaurant_id', restaurantId)
      .eq('pos_provider', posProvider)
      .eq('pos_transaction_id', posTransactionId)
      .maybeSingle();
    if (existing) {
      logger.info('service-completion-core: duplicate POS transaction, returning existing record', {
        restaurantId, posProvider, posTransactionId, revenueId: existing.id,
      });
      return { ok: true, duplicate: true, revenue_id: existing.id };
    }
  }

  // -- 1. service_records insert -------------------------------------------
  const serviceId = generateSecureServiceId();
  const now = new Date().toISOString();

  const { data: serviceRecord, error: serviceError } = await supabaseAdmin
    .from('service_records')
    .insert({
      restaurant_id: restaurantId,
      service_id: serviceId,
      reservation_id: reservationId || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      party_size: partySize,
      total_bill: totalBill,
      seated_at: now,
      actual_departure: now,
      status: 'completed',
    })
    .select('id, service_id')
    .single();

  if (serviceError) {
    logger.error('Failed to create service record', { error: serviceError.message, restaurantId });
    return { ok: false, status: 500, error: 'Failed to create service record' };
  }

  // -- 2. revenue_records insert (analytics source-of-truth) ---------------
  // Best-effort; service record write is the operational requirement.
  let revenueId = null;
  try {
    const { data: rev, error: revError } = await supabaseAdmin
      .from('revenue_records')
      .insert({
        restaurant_id: restaurantId,
        amount_cents: Math.round(totalBill * 100),
        currency,
        payment_method: paymentMethod || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        reservation_id: reservationId || null,
        recorded_at: now,
        pos_provider: posProvider || null,
        pos_transaction_id: posTransactionId || null,
      })
      .select('id')
      .single();
    if (revError) {
      logger.warn('revenue_records insert failed (non-fatal)', { error: revError.message });
    } else {
      revenueId = rev?.id || null;
    }
  } catch (err) {
    logger.warn('revenue_records insert threw (non-fatal)', { error: err.message });
  }

  // -- 3. LTV upsert (non-fatal) -------------------------------------------
  updateCustomerLTV(restaurantId, customerPhone, customerName, totalBill, partySize)
    .catch((err) => logger.warn('LTV update failed (non-fatal)', { error: err.message }));

  // -- 4. Webhook dispatch (non-fatal) -------------------------------------
  try {
    const { dispatchEvent } = require('../../_services/webhookDispatcher');
    dispatchEvent(restaurantId, 'service.completed', {
      service_id: serviceId,
      reservation_id: reservationId || null,
      customer_phone: customerPhone,
      customer_name: customerName,
      party_size: partySize,
      total_bill: totalBill,
      payment_method: paymentMethod || null,
      pos_provider: posProvider || null,
      pos_transaction_id: posTransactionId || null,
      completed_at: now,
    }).catch((err) => logger.warn('Webhook dispatch failed (non-fatal)', { error: err.message }));
  } catch {
    // webhookDispatcher not available — skip silently.
  }

  logger.info('Service completion recorded', {
    serviceId, restaurantId, totalBill, posProvider, hasReservation: !!reservationId,
  });

  return { ok: true, service_id: serviceId, revenue_id: revenueId };
}

// ---------------------------------------------------------------------------
// LTV upsert — moved verbatim from the old service-completion handler so
// the existing per-customer ledger keeps working the same way.
// ---------------------------------------------------------------------------
async function updateCustomerLTV(restaurantId, phone, name, billAmount, partySize) {
  const { data: existing } = await supabaseAdmin
    .schema('restaurant')
    .from('customer_ltv')
    .select('customer_id, total_revenue, total_visits')
    .eq('restaurant_id', restaurantId)
    .eq('customer_phone', phone)
    .maybeSingle();

  if (existing) {
    const newRevenue = (Number(existing.total_revenue) || 0) + billAmount;
    const newVisits = (existing.total_visits || 0) + 1;
    const avgRevenue = newRevenue / newVisits;

    await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .update({
        total_revenue: Math.round(newRevenue * 100) / 100,
        total_visits: newVisits,
        avg_revenue_per_visit: Math.round(avgRevenue * 100) / 100,
        last_visit_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', existing.customer_id)
      .eq('restaurant_id', restaurantId);
  } else {
    await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .insert({
        customer_id: phone,
        restaurant_id: restaurantId,
        customer_phone: phone,
        customer_name: name,
        total_revenue: Math.round(billAmount * 100) / 100,
        total_visits: 1,
        avg_revenue_per_visit: Math.round(billAmount * 100) / 100,
        last_visit_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      });
  }
}

module.exports = { recordServiceCompletion };
