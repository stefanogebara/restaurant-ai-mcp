/**
 * Data Deletion API (LGPD / GDPR)
 *
 * DELETE /api/data-deletion
 * Auth: Required (JWT with restaurant_id)
 *
 * Deletes all customer PII for a given phone number from the restaurant's data.
 * Covers: reservations, customer_ltv, customer_history, service_records,
 * waitlist, manager_memory (conversation references).
 *
 * Body: { customer_phone: string }
 */

const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('data-deletion');

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  try {
    const user = await verifyAuth(req.headers.authorization?.replace('Bearer ', ''));
    if (!user || !user.restaurant_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const restaurantId = user.restaurant_id;
    const { customer_phone } = req.body || {};

    if (!customer_phone || typeof customer_phone !== 'string' || customer_phone.length < 7) {
      return res.status(400).json({ error: 'Valid customer_phone is required' });
    }

    const phone = customer_phone.trim();
    const deletionResults = {};

    // 1. Anonymize reservations (keep record for analytics, remove PII)
    const { data: resData, error: resErr } = await supabaseAdmin
      .from('reservations')
      .update({
        customer_name: '[DELETED]',
        customer_phone: null,
        customer_email: null,
        special_requests: null,
      })
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', phone)
      .select('reservation_id');

    deletionResults.reservations_anonymized = resData?.length || 0;
    if (resErr) logger.warn('Reservation anonymization error:', resErr.message);

    // 2. Delete customer_ltv record
    const { data: ltvData, error: ltvErr } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', phone)
      .select('customer_id');

    deletionResults.ltv_records_deleted = ltvData?.length || 0;
    if (ltvErr) logger.warn('LTV deletion error:', ltvErr.message);

    // 3. Delete customer_history records
    const { data: histData, error: histErr } = await supabaseAdmin
      .from('customer_history')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', phone)
      .select('id');

    deletionResults.history_records_deleted = histData?.length || 0;
    if (histErr) logger.warn('History deletion error:', histErr.message);

    // 4. Anonymize service_records
    const { data: svcData, error: svcErr } = await supabaseAdmin
      .from('service_records')
      .update({
        customer_name: '[DELETED]',
        customer_phone: null,
      })
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', phone)
      .select('id');

    deletionResults.service_records_anonymized = svcData?.length || 0;
    if (svcErr) logger.warn('Service record anonymization error:', svcErr.message);

    // 5. Delete from waitlist
    const { data: waitData, error: waitErr } = await supabaseAdmin
      .from('waitlist')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', phone)
      .select('id');

    deletionResults.waitlist_deleted = waitData?.length || 0;
    if (waitErr) logger.warn('Waitlist deletion error:', waitErr.message);

    // 6. Delete manager_memory references containing this phone
    const { data: memData, error: memErr } = await supabaseAdmin
      .schema('restaurant')
      .from('manager_memory')
      .delete()
      .eq('restaurant_id', restaurantId)
      .ilike('content', `%${phone}%`)
      .select('id');

    deletionResults.memory_records_deleted = memData?.length || 0;
    if (memErr) logger.warn('Memory deletion error:', memErr.message);

    logger.info('Customer data deletion completed', {
      restaurant_id: restaurantId,
      phone: '[redacted]',
      results: deletionResults,
    });

    return res.status(200).json({
      success: true,
      message: 'Customer data deleted/anonymized successfully',
      details: deletionResults,
    });

  } catch (err) {
    logger.error('Data deletion error:', err.message);
    return res.status(500).json({ error: 'Internal error during data deletion' });
  }
};
