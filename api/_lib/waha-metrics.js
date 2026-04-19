'use strict';

/**
 * WAHA pipeline metrics — fire-and-forget event logger.
 * Writes to waha_events table for /api/waha-status observability.
 * All errors are swallowed — never let metrics break the pipeline.
 */

const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('WahaMetrics');

/**
 * Log a WAHA pipeline event.
 * @param {string} eventType - 'received'|'processed'|'failed'|'duplicate'|'rate_limited'|'sig_invalid'
 * @param {object} [data]
 * @param {string} [data.messageId]
 * @param {string} [data.phone]
 * @param {string} [data.restaurantId]
 * @param {number} [data.durationMs]
 * @param {string} [data.error]
 * @param {object} [data.meta]
 */
async function logWahaEvent(eventType, data = {}) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('waha_events').insert({
      event_type: eventType,
      message_id: data.messageId || null,
      sender_phone: data.phone || null,
      restaurant_id: data.restaurantId || null,
      duration_ms: data.durationMs != null ? Math.round(data.durationMs) : null,
      error_msg: data.error || null,
      meta: data.meta || null,
    });
  } catch (err) {
    logger.warn('waha_events insert failed (non-fatal):', err.message);
  }
}

module.exports = { logWahaEvent };
