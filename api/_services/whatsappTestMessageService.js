'use strict';

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('WhatsAppTestMessages');

const WHATSAPP_TEST_MESSAGE_COOLDOWN_MS = 2 * 60 * 1000;

const SELECT_FIELDS = [
  'id',
  'restaurant_id',
  'provider',
  'recipient_phone',
  'template_name',
  'template_language',
  'whatsapp_message_id',
  'status',
  'error_message',
  'requested_at',
  'status_updated_at',
  'sent_at',
  'delivered_at',
  'read_at',
  'failed_at',
].join(', ');

const STATUS_PRIORITY = {
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

function normalizeWhatsAppTestPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function getWhatsAppTestMessageCooldownMs(message, now = Date.now()) {
  if (!message?.requested_at) return 0;
  if (String(message.status || '').toLowerCase() === 'failed') return 0;

  const requestedAtMs = Date.parse(message.requested_at);
  if (!Number.isFinite(requestedAtMs)) return 0;

  return Math.max(0, requestedAtMs + WHATSAPP_TEST_MESSAGE_COOLDOWN_MS - now);
}

function serializeWhatsAppTestMessage(message, now = Date.now()) {
  if (!message) return null;

  const cooldownRemainingMs = getWhatsAppTestMessageCooldownMs(message, now);
  const requestedAtMs = Date.parse(message.requested_at || '');
  const cooldownExpiresAt = Number.isFinite(requestedAtMs)
    ? new Date(requestedAtMs + WHATSAPP_TEST_MESSAGE_COOLDOWN_MS).toISOString()
    : null;

  return {
    ...message,
    recipient_phone: normalizeWhatsAppTestPhone(message.recipient_phone) || message.recipient_phone,
    cooldown_remaining_ms: cooldownRemainingMs,
    cooldown_active: cooldownRemainingMs > 0,
    cooldown_expires_at: cooldownExpiresAt,
  };
}

function getFailedStatusMessage(statusUpdate) {
  const firstError = statusUpdate?.errors?.[0];
  if (!firstError) return null;

  return firstError.error_user_msg
    || firstError.title
    || firstError.message
    || firstError.details
    || null;
}

function shouldAdvanceStatus(currentStatus, nextStatus) {
  if (!nextStatus) return false;
  if (nextStatus === 'failed') return true;

  const currentRank = STATUS_PRIORITY[String(currentStatus || '').toLowerCase()] || 0;
  const nextRank = STATUS_PRIORITY[nextStatus] || 0;
  return nextRank >= currentRank;
}

async function getLatestWhatsAppTestMessage(restaurantId) {
  if (!restaurantId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_test_messages')
      .select(SELECT_FIELDS)
      .eq('restaurant_id', restaurantId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to load latest WhatsApp test message', { restaurantId, error: error.message });
      return null;
    }

    return data || null;
  } catch (error) {
    logger.warn('WhatsApp test message lookup failed', { restaurantId, error: error.message });
    return null;
  }
}

async function getRecentDuplicateWhatsAppTestMessage(restaurantId, phone) {
  const normalizedPhone = normalizeWhatsAppTestPhone(phone);
  if (!restaurantId || !normalizedPhone) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_test_messages')
      .select(SELECT_FIELDS)
      .eq('restaurant_id', restaurantId)
      .eq('recipient_phone', normalizedPhone)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        logger.warn('Failed to check duplicate WhatsApp test message', {
          restaurantId,
          recipientPhone: normalizedPhone,
          error: error.message,
        });
      }
      return null;
    }

    return getWhatsAppTestMessageCooldownMs(data) > 0 ? data : null;
  } catch (error) {
    logger.warn('Duplicate WhatsApp test message lookup failed', {
      restaurantId,
      recipientPhone: normalizedPhone,
      error: error.message,
    });
    return null;
  }
}

async function createWhatsAppTestMessage({
  restaurantId,
  provider,
  recipientPhone,
  templateName = null,
  templateLanguage = null,
  whatsappMessageId,
  errorMessage = null,
}) {
  const normalizedPhone = normalizeWhatsAppTestPhone(recipientPhone);
  if (!restaurantId || !normalizedPhone || !whatsappMessageId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_test_messages')
      .insert({
        restaurant_id: restaurantId,
        provider: provider || 'meta',
        recipient_phone: normalizedPhone,
        template_name: templateName,
        template_language: templateLanguage,
        whatsapp_message_id: whatsappMessageId,
        status: 'accepted',
        error_message: errorMessage,
      })
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      logger.warn('Failed to persist WhatsApp test message', {
        restaurantId,
        recipientPhone: normalizedPhone,
        whatsappMessageId,
        error: error.message,
      });
      return null;
    }

    return data || null;
  } catch (error) {
    logger.warn('WhatsApp test message persistence failed', {
      restaurantId,
      recipientPhone: normalizedPhone,
      whatsappMessageId,
      error: error.message,
    });
    return null;
  }
}

async function updateWhatsAppTestMessageStatus(whatsappMessageId, statusUpdate) {
  const nextStatus = String(statusUpdate?.status || '').toLowerCase();
  if (!whatsappMessageId || !['sent', 'delivered', 'read', 'failed'].includes(nextStatus)) {
    return false;
  }

  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('whatsapp_test_messages')
      .select(SELECT_FIELDS)
      .eq('whatsapp_message_id', whatsappMessageId)
      .maybeSingle();

    if (lookupError || !existing) {
      return false;
    }

    if (!shouldAdvanceStatus(existing.status, nextStatus)) {
      return false;
    }

    const nowIso = new Date().toISOString();
    const updates = {
      status: nextStatus,
      status_updated_at: nowIso,
    };

    if (nextStatus === 'sent') updates.sent_at = nowIso;
    if (nextStatus === 'delivered') updates.delivered_at = nowIso;
    if (nextStatus === 'read') updates.read_at = nowIso;
    if (nextStatus === 'failed') {
      updates.failed_at = nowIso;
      updates.error_message = getFailedStatusMessage(statusUpdate);
    }

    const { error: updateError } = await supabaseAdmin
      .from('whatsapp_test_messages')
      .update(updates)
      .eq('id', existing.id);

    if (updateError) {
      logger.warn('Failed to update WhatsApp test message status', {
        whatsappMessageId,
        status: nextStatus,
        error: updateError.message,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('WhatsApp test message status update failed', {
      whatsappMessageId,
      status: nextStatus,
      error: error.message,
    });
    return false;
  }
}

module.exports = {
  WHATSAPP_TEST_MESSAGE_COOLDOWN_MS,
  normalizeWhatsAppTestPhone,
  getWhatsAppTestMessageCooldownMs,
  serializeWhatsAppTestMessage,
  getLatestWhatsAppTestMessage,
  getRecentDuplicateWhatsAppTestMessage,
  createWhatsAppTestMessage,
  updateWhatsAppTestMessageStatus,
};
