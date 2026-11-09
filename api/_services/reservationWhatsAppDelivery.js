'use strict';
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const logger = createSecureLogger('ReservationWhatsAppDelivery');
const normalizePhone = value => String(value || '').replace(/\D/g, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function beginConfirmation({ restaurantId, reservationRecordId, phone }) {
  const sender = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!restaurantId || !reservationRecordId || !sender) return null;
  try {
    // Look up the reservation under the bound tenant before linking the tracking row.
    const { data: reservation, error: lookupError } = await supabaseAdmin.from('reservations')
      .select('id').eq('id', reservationRecordId).eq('restaurant_id', restaurantId).maybeSingle();
    if (lookupError || !reservation) return null;
    const { data, error } = await supabaseAdmin.from('reservation_whatsapp_messages').insert({
      restaurant_id: restaurantId, reservation_id: reservationRecordId,
      recipient_phone: normalizePhone(phone), sender_id: sender,
    }).select('id,sender_id,recipient_phone').single();
    if (error) throw error;
    return data;
  } catch (error) { logger.warn('Confirmation tracking unavailable', { error: error.message }); return null; }
}

async function advanceConfirmation({ trackingId = null, messageId = null, status, sender, recipient, error = null }) {
  const { error: dbError } = await supabaseAdmin.rpc('advance_reservation_whatsapp_message', {
    p_id: trackingId, p_message_id: messageId, p_status: status,
    p_sender: sender, p_recipient: normalizePhone(recipient), p_error: error,
  });
  if (dbError) throw dbError;
}

async function finishConfirmation(tracking, result) {
  if (!tracking) return;
  try {
    await advanceConfirmation({ trackingId: tracking.id, messageId: result.messageId || null,
      status: result.success && result.messageId ? 'accepted' : result.success || result.ambiguo || result.timeout ? 'unknown' : 'failed',
      sender: tracking.sender_id, recipient: tracking.recipient_phone,
      error: result.error || null });
  } catch (error) { logger.warn('Confirmation outcome tracking failed', { error: error.message }); }
}

async function applyConfirmationReceipt(statusUpdate, metadata) {
  if (!['sent','delivered','read','failed'].includes(statusUpdate?.status) || !statusUpdate.id || !metadata?.phone_number_id || !statusUpdate.recipient_id) return;
  const callback = String(statusUpdate.biz_opaque_callback_data || '');
  const candidate = callback.startsWith('reservation:') ? callback.slice(12) : null;
  const trackingId = candidate && UUID.test(candidate) ? candidate : null;
  await advanceConfirmation({ trackingId, messageId: statusUpdate.id, status: statusUpdate.status,
    sender: metadata.phone_number_id, recipient: statusUpdate.recipient_id,
    error: statusUpdate.errors?.[0]?.title || statusUpdate.errors?.[0]?.message || null });
}

async function decorateReservationConfirmations(restaurantId, reservations) {
  if (!restaurantId || !reservations.length) return reservations;
  const ids = reservations.map(r => r.record_id).filter(Boolean);
  if (!ids.length) return reservations;
  const { data, error } = await supabaseAdmin.from('reservation_whatsapp_messages')
    .select('reservation_id,status,status_updated_at,requested_at')
    .eq('restaurant_id', restaurantId).in('reservation_id', ids)
    .order('requested_at', { ascending: false });
  if (error) { logger.warn('Confirmation statuses unavailable', { error: error.message }); return reservations; }
  const latest = new Map();
  for (const row of data || []) if (!latest.has(row.reservation_id)) latest.set(row.reservation_id, row);
  return reservations.map(r => ({ ...r, whatsapp_confirmation: latest.get(r.record_id) || null }));
}
module.exports = { beginConfirmation, finishConfirmation, applyConfirmationReceipt, decorateReservationConfirmations };
