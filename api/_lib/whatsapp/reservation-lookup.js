/**
 * Reservation lookup and session context utilities for WhatsApp flows.
 * Extracted from twilio-whatsapp-webhook.js (M-23).
 */

const { centralSupabase } = require('../central-supabase');
const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('WhatsApp:Reservation');

/**
 * Find the most recent upcoming reservation for a phone number
 * @param {string} phoneNumber - Customer phone number (without whatsapp: prefix)
 * @param {string} restaurantId - Optional restaurant ID to filter by
 * @returns {Object|null} - Most recent upcoming reservation or null
 */
async function findRecentReservation(phoneNumber, restaurantId = null) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Normalize phone number - remove + prefix and any non-digits
    // Database stores: 5511999002121 (digits only, no +)
    const normalizedPhone = phoneNumber.replace(/^\+/, '').replace(/\D/g, '');

    // Generate phone variants to match different storage formats
    const phoneVariants = [normalizedPhone];

    // If phone has country code (11+ digits for US), also try without it
    if (normalizedPhone.length >= 11 && normalizedPhone.startsWith('1')) {
      phoneVariants.push(normalizedPhone.slice(1)); // Remove US country code
    }

    // If phone is 10 digits, also try with US country code prepended
    if (normalizedPhone.length === 10) {
      phoneVariants.push('1' + normalizedPhone);
    }

    // Also try last 10 digits as fallback (handles international numbers)
    if (normalizedPhone.length > 10) {
      const last10 = normalizedPhone.slice(-10);
      if (!phoneVariants.includes(last10)) {
        phoneVariants.push(last10);
      }
    }

    logger.info(` Finding reservation for phone: ${phoneNumber} -> variants: ${phoneVariants.join(', ')}`);

    let query = centralSupabase
      .from('reservations')
      .select('*')
      .in('customer_phone', phoneVariants)
      .in('status', ['confirmed', 'pending'])
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(1);

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error(' Error finding recent reservation:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  } catch (err) {
    logger.error(' Exception finding recent reservation:', err);
    return null;
  }
}

/**
 * Update the context stored in a WhatsApp session
 * @param {string} sessionId - Session UUID
 * @param {Object} contextUpdate - Object with fields to update/merge into context
 */
async function updateSessionContext(sessionId, contextUpdate) {
  try {
    // First get the current session
    const { data: session, error: fetchError } = await centralSupabase
      .from('whatsapp_sessions')
      .select('context')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      logger.error(' Error fetching session for context update:', fetchError);
      return;
    }

    // Merge the new context with existing
    const currentContext = session?.context || {};
    const newContext = { ...currentContext, ...contextUpdate };

    // Update the session
    const { error: updateError } = await centralSupabase
      .from('whatsapp_sessions')
      .update({
        context: newContext,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (updateError) {
      logger.error(' Error updating session context:', updateError);
    }
  } catch (err) {
    logger.error(' Exception updating session context:', err);
  }
}

module.exports = {
  findRecentReservation,
  updateSessionContext,
};
