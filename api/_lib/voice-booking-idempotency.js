'use strict';

const { supabaseAdmin } = require('./supabase');

// This value comes only from authenticated provider context, never tool arguments.
function voiceBookingKey(conversationId) {
  if (typeof conversationId !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(conversationId)) {
    throw new Error('Invalid trusted voice conversation');
  }
  return `voice:${conversationId}`;
}

const BOOKING_COLUMNS = 'id,reservation_id,restaurant_id,customer_phone,customer_name,date,time,party_size,status,special_requests';

async function getVoiceBooking(restaurantId, key, callerPhone) {
  const { data, error } = await supabaseAdmin.from('reservations')
    .select(BOOKING_COLUMNS)
    .eq('restaurant_id', restaurantId).eq('source', 'voice_ai').eq('external_id', key).maybeSingle();
  if (error) throw new Error('Voice booking lookup unavailable');
  if (data) return data;
  // A call can span a release. Recover its earlier reservation through the
  // durable, caller-scoped conversation without rewriting historical records.
  const { data: binding, error: bindingError } = await supabaseAdmin.from('agent_conversations')
    .select('reservation_id,metadata,tools_used,ended_at').eq('conversation_id', key.slice('voice:'.length))
    .eq('restaurant_info_id', restaurantId).eq('caller_phone', callerPhone).maybeSingle();
  if (bindingError) throw new Error('Voice conversation lookup unavailable');
  const recordedCodes = [...new Set((binding?.tools_used || [])
    .filter(tool => tool.tool_name === 'create_reservation' && tool.success === true)
    .map(tool => tool.result?.reservation_id).filter(code => typeof code === 'string' && code))];
  if (recordedCodes.length > 1 || (binding?.reservation_id && recordedCodes.some(code => code !== binding.reservation_id))) {
    throw new Error('Conflicting voice booking evidence');
  }
  const reservationCode = binding?.reservation_id || (recordedCodes.length === 1 ? recordedCodes[0] : null);
  if (!reservationCode) {
    if (!binding || binding.ended_at || recordedCodes.length > 1 || binding.metadata?.voice_booking_guard !== 'external_id_v1') {
      throw new Error('Voice booking state is ambiguous; do not create another booking');
    }
    return null;
  }
  const { data: legacy, error: legacyError } = await supabaseAdmin.from('reservations')
    .select(BOOKING_COLUMNS).eq('restaurant_id', restaurantId).eq('source', 'voice_ai')
    .eq('customer_phone', callerPhone).eq('reservation_id', reservationCode).maybeSingle();
  if (legacyError || !legacy) throw new Error('Existing voice booking unavailable');
  return legacy;
}

async function ensureVoiceBookingLinked(restaurantId, conversationId, callerPhone, reservationCode) {
  const scope = query => query.eq('conversation_id', conversationId)
    .eq('restaurant_info_id', restaurantId).eq('caller_phone', callerPhone);
  const read = () => scope(supabaseAdmin.from('agent_conversations')
    .select('reservation_id,successful_booking,outcome')).maybeSingle();
  const { data: binding, error } = await read();
  if (error || !binding || (binding.reservation_id && binding.reservation_id !== reservationCode)) {
    throw new Error('Voice booking link conflict');
  }
  if (binding.reservation_id === reservationCode && binding.successful_booking === true && binding.outcome === 'reservation_created') return;
  let update = scope(supabaseAdmin.from('agent_conversations').update({
    reservation_id: reservationCode, successful_booking: true, outcome: 'reservation_created',
  }));
  update = binding.reservation_id ? update.eq('reservation_id', reservationCode) : update.is('reservation_id', null);
  const { data: linked, error: updateError } = await update.select('reservation_id').maybeSingle();
  if (updateError) throw new Error('Voice booking link unavailable');
  if (linked?.reservation_id === reservationCode) return;
  const current = await read();
  if (current.error || current.data?.reservation_id !== reservationCode || current.data?.successful_booking !== true || current.data?.outcome !== 'reservation_created') {
    throw new Error('Voice booking link conflict');
  }
}

// ASR can add/remove an accent while reconfirming the same guest. This is
// comparison only inside the existing authenticated call/tenant/phone scope;
// it never changes the stored guest or matches a restaurant name.
function comparableGuestName(name) {
  return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function replayVoiceBooking(existing, params, restaurant) {
  const language = String(restaurant.agent_language || restaurant.language || 'pt').toLowerCase().split(/[-_]/)[0];
  const copy = !['pt', 'es'].includes(language) ? {
    conflict: 'This call already created a reservation. No second booking or change was made. Contact the restaurant to change it.',
    same: 'This is the same confirmed reservation. No second booking was created and no WhatsApp message was resent.',
  } : language === 'es' ? {
    conflict: 'Esta llamada ya creó una reserva. No se creó otra ni se modificó la existente. Contacta con el restaurante para cambiarla.',
    same: 'Es la misma reserva confirmada. No se creó otra reserva ni se volvió a enviar el mensaje de WhatsApp.',
  } : {
    conflict: 'Esta ligação já criou uma reserva. Não criei outra nem alterei a existente. Para mudar, entre em contato com o restaurante.',
    same: 'É a mesma reserva confirmada. Não criei outra reserva nem reenviei a mensagem pelo WhatsApp.',
  };
  if (existing.customer_phone !== params.customer_phone) {
    return { success: false, error: 'voice_booking_scope_mismatch', message: copy.conflict };
  }
  const same = existing.status === 'confirmed' && existing.date === params.date
    && /^\d{2}:\d{2}(?::00)?$/.test(String(params.time))
    && String(existing.time).slice(0, 5) === String(params.time).slice(0, 5)
    && Number(existing.party_size) === Number(params.party_size)
    && comparableGuestName(existing.customer_name) === comparableGuestName(params.customer_name)
    && (existing.special_requests || '') === (params.special_requests || '');
  if (!same) return { success: false, error: 'voice_booking_already_exists', message: copy.conflict };
  return { success: true, reused: true, reservation_id: existing.reservation_id,
    restaurant_name: restaurant.restaurant_name || restaurant.name, message: copy.same };
}

module.exports = { voiceBookingKey, getVoiceBooking, replayVoiceBooking, ensureVoiceBookingLinked };
