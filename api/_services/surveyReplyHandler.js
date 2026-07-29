/**
 * Survey Reply Handler
 *
 * Detects WhatsApp replies to survey messages and saves them
 * to restaurant.survey_responses.
 *
 * A reply is considered a survey reply when:
 * 1. The phone number has a service_record with survey_sent_at in the last 48h
 * 2. The message starts with a number 1-5
 *
 * After the rating, any additional text is saved as a comment.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { lerNota } = require('../_lib/rating-reply');

const logger = createSecureLogger('SurveyReplyHandler');

const SURVEY_WINDOW_HOURS = 48;

/**
 * Check if this message is a survey reply and process it.
 * @param {string} phone - Sender phone (e.g. '5511999002121')
 * @param {string} messageText - Raw message text
 * @param {string} [restaurantId] Restaurante da conversa, quando já resolvido.
 *   ESCOPO (bug #66): sem ele a busca do service_record é só por telefone, via
 *   supabaseAdmin, que ignora RLS — um "5" limpo mandado para o restaurante B
 *   era gravado como avaliação do A, e o B nunca via. Opcional para não
 *   quebrar chamadores que não sabem o restaurante; quem sabe DEVE passar.
 * @returns {null | { rating: number, comment: string|null }} - null if not a survey reply
 */
async function handleSurveyReply(phone, messageText, restaurantId) {
  if (!phone || !messageText) return null;

  const trimmed = messageText.trim();
  if (!trimmed) return null;

  // A leitura da nota é do rating-reply, que sabe distinguir "5 - excelente"
  // de "4 pessoas amanhã 20h". A versão anterior olhava só `charAt(0)`: bastava
  // a mensagem começar com 1–5 e existir pesquisa nas últimas 48h para uma
  // RESERVA virar avaliação, e a IA nunca ver a mensagem. O cliente recebia
  // "Obrigado pela avaliação! ⭐⭐⭐⭐" e ia embora sem mesa.
  const leitura = lerNota(trimmed);
  if (leitura.nota === null) {
    // Só registra quando a mensagem chegou perto de ser nota — senão todo "oi"
    // vira linha de log. O rastro existe pra que uma avaliação recusada por
    // engano seja investigável, em vez de sumir.
    if (leitura.motivo === 'texto tem marcador de reserva') {
      logger.info('Mensagem começa com dígito mas parece reserva — seguindo para a IA', {
        motivo: leitura.motivo,
      });
    }
    return null;
  }
  const rating = leitura.nota;

  // Normalize phone: strip non-digits, remove leading +
  const normalizedPhone = phone.replace(/\D/g, '');

  // Check if this phone has a recent survey_sent_at
  const cutoff = new Date(Date.now() - SURVEY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  let qServico = supabaseAdmin
    .from('service_records')
    .select('id, restaurant_id, customer_name, reservation_id, survey_sent_at')
    .eq('status', 'completed');

  if (restaurantId) qServico = qServico.eq('restaurant_id', restaurantId);

  const { data: serviceRecord, error: svcErr } = await qServico
    .gte('survey_sent_at', cutoff)
    .or(`customer_phone.eq.${normalizedPhone},customer_phone.eq.+${normalizedPhone}`)
    .order('survey_sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (svcErr) {
    logger.error('Failed to check survey status', { error: svcErr.message });
    return null;
  }

  if (!serviceRecord) return null;

  // Check if already responded
  const { data: existing } = await supabaseAdmin
    .schema('restaurant')
    .from('survey_responses')
    .select('id')
    .eq('restaurant_id', serviceRecord.restaurant_id)
    .or(`customer_phone.eq.${normalizedPhone},customer_phone.eq.+${normalizedPhone}`)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();

  if (existing) {
    logger.info('Survey already responded', { phone: normalizedPhone.slice(0, 4) + '****' });
    return null;
  }

  // Comentário já veio limpo do rating-reply ("5 - Great!" → "Great!").
  const comment = leitura.comentario;

  // Save to survey_responses
  const { error: insertErr } = await supabaseAdmin
    .schema('restaurant')
    .from('survey_responses')
    .insert({
      restaurant_id: serviceRecord.restaurant_id,
      customer_phone: normalizedPhone,
      customer_name: serviceRecord.customer_name || null,
      rating,
      comment,
      reservation_id: serviceRecord.reservation_id || null,
    });

  if (insertErr) {
    logger.error('Failed to save survey response', { error: insertErr.message });
    return null;
  }

  logger.info('Survey response saved', {
    restaurantId: serviceRecord.restaurant_id,
    rating,
    hasComment: !!comment,
  });

  return { rating, comment };
}

module.exports = { handleSurveyReply };
