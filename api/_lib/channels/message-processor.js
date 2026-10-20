'use strict';

/**
 * MessageProcessor — Unified message processing pipeline.
 *
 * Handles the shared business logic for all WhatsApp channels:
 * dedup, rate limiting, session management, restaurant routing,
 * feedback/survey detection, AI processing, history, memory extraction.
 *
 * Adapters handle provider-specific concerns (signature, parsing, sending).
 */

const { createSecureLogger } = require('../secure-logger');
const { acquireProcessingLock, releaseProcessingLock } = require('../rate-limit');
const { wasCompleted, markCompleted, claimRateCount, hasSendAttempt,
  reserveSendAttempt, releaseRejectedSend, wasRateBlocked, markRateBlocked } = require('./inbound-completion');
const { getPendingReply, savePendingReply, getRecordedRating, replyKey } = require('./inbound-reply');
const { getOrCreateSession, getSessionByPhone, setSessionRestaurant,
  updateSessionConversationHistory } = require('../whatsapp-sessions');
const { getAllActiveRestaurants } = require('../restaurant-registry');
const { getWhatsAppProvider } = require('../whatsapp-sender');
const { processWithAI, cleanHistoryForStorage } = require('../../_services/whatsapp/conversation');
const { handleKeyword } = require('../../_services/whatsapp/keyword-handler');
const { isRateLimited } = require('../../_services/whatsapp/rate-limiter');
const { findPendingFeedbackForPhone, processFeedbackReply } = require('../../_services/feedbackService');
const { handleSurveyReply } = require('../../_services/surveyReplyHandler');
const { extractMemoriesFromWhatsApp } = require('../../_services/memoryExtractor');
const { simulateTypingDelay } = require('../whatsapp-interactions');
const { avaliarEnvio } = require('./send-result');
const { isPaused } = require('../../_services/whatsapp/handoff');
const { inboundIdentity, lockKey, resolveReceiver, normalizedReceiver,
  demoConversationId } = require('./receiver-identity');
const { randomUUID } = require('node:crypto');
const { lerNota } = require('../rating-reply');

const logger = createSecureLogger('MessageProcessor');

function ratingReplyText(purpose, result, language) {
  const pt = language === 'pt' || language === 'pt-BR';
  if (purpose === 'feedback') {
    if (!result.rating) return pt ? 'Obrigado pelo seu feedback! Agradecemos o seu tempo.'
      : language === 'es' ? '¡Gracias por tu opinion! Apreciamos que te hayas tomado el tiempo.'
        : 'Thank you for your feedback! We appreciate you taking the time to share your thoughts.';
    return pt
      ? `Obrigado pelo seu feedback! Voce nos avaliou ${result.rating}/5.${result.comment ? ' Agradecemos seu comentario.' : ''} Esperamos te ver novamente!`
      : language === 'es'
        ? `¡Gracias por tu opinion! Nos diste ${result.rating}/5.${result.comment ? ' Apreciamos tus comentarios.' : ''} ¡Esperamos verte pronto!`
        : `Thank you for your feedback! You rated us ${result.rating}/5.${result.comment ? ' We appreciate your comments.' : ''} We look forward to welcoming you again!`;
  }
  const stars = '\u2B50'.repeat(result.rating);
  return result.comment
    ? pt ? `Obrigado pela avaliacao! ${stars} (${result.rating}/5)\nSeu comentario foi registrado. Esperamos te ver novamente!`
      : language === 'es' ? `¡Gracias por tu valoracion! ${stars} (${result.rating}/5)\nTu comentario fue registrado. ¡Esperamos verte pronto!`
        : `Thank you for your rating! ${stars} (${result.rating}/5)\nYour comment has been recorded. We hope to see you again!`
    : pt ? `Obrigado pela avaliacao! ${stars} (${result.rating}/5)\nEsperamos te ver novamente!`
      : language === 'es' ? `¡Gracias por tu valoracion! ${stars} (${result.rating}/5)\n¡Esperamos verte pronto!`
        : `Thank you for your rating! ${stars} (${result.rating}/5)\nWe hope to see you again!`;
}

/**
 * Envia e OLHA o resultado.
 *
 * Os adapters não lançam quando o envio falha — devolvem `{ success: false }`.
 * Até jul/2026 nenhum dos 7 pontos de envio checava isso, então uma falha
 * (janela de 24h fechada, token recusado, número sem WhatsApp) deixava o
 * cliente sem resposta e ninguém sabendo. Este invólucro transforma cada falha
 * numa linha `[SEND_FAIL]` com categoria e ação, e devolve se entregou — quem
 * chama decide o que fazer com isso.
 *
 * Nunca lança: uma falha de envio não pode derrubar o resto do processamento
 * (o histórico ainda precisa ser gravado, o lock ainda precisa ser solto).
 */
async function enviarComGuarda(adapter, to, texto, ondeFoi, receiverContext, attempt) {
  if (attempt) {
    await savePendingReply(attempt.identity, attempt.messageId, texto, ondeFoi,
      attempt.restaurantId || null);
    await reserveSendAttempt(attempt.identity, attempt.messageId);
  }
  let resultado;
  try {
    resultado = await adapter.sendMessage(to, texto, receiverContext);
  } catch (err) {
    resultado = { success: false, error: err && err.message };
  }

  const v = avaliarEnvio(resultado);
  if (attempt && !v.entregue && resultado?.definitiveFailure === true) {
    await releaseRejectedSend(attempt.identity, attempt.messageId);
  }
  if (!v.entregue) {
    const linha = `${v.resumo} origem=${ondeFoi}`;
    // Alertável vira error (o cron de saúde e o Sentry pescam por nível);
    // o resto vira info, pra não treinar ninguém a ignorar vermelho.
    if (v.alertavel) logger.error(linha); else logger.info(linha);
  }
  return { ...v, uncertain: !v.entregue && resultado?.definitiveFailure !== true };
}

/**
 * Process an incoming WhatsApp message through the unified pipeline.
 *
 * @param {import('./channel-adapter').ChannelAdapter} adapter - The channel adapter
 * @param {Object} msg - Parsed message from adapter.parseIncoming()
 * @param {Object} [options]
 * @param {string} [options.oppositeProvider] - Skip if restaurant uses this provider ('meta'|'twilio')
 * @returns {Promise<{response?: string, handled: boolean}>}
 */
async function processMessage(adapter, msg, options = {}) {
  const { from, messageId, text, mediaContext, interactiveSelection, phoneNumberId, preprocessReply } = msg;
  const providerName = adapter.providerName;
  const identity = inboundIdentity(providerName, phoneNumberId, from);
  if (!identity || typeof messageId !== 'string' || !messageId.trim()) {
    logger.error(`[${providerName}] Invalid receiver or guest identity; inbound message blocked`);
    return { handled: true, skipped: 'invalid_receiver' };
  }
  let activeRestaurants;
  try {
    activeRestaurants = await getAllActiveRestaurants({ fresh: true });
  } catch (error) {
    logger.error(`[${providerName}] Registry unavailable:`, error.message);
    return { handled: false, retryable: true, skipped: 'registry_unavailable' };
  }
  if (activeRestaurants.length === 0) {
    logger.error(`[${providerName}] Registry has no active restaurants`);
    return { handled: false, retryable: true, skipped: 'registry_empty' };
  }
  const route = resolveReceiver(identity, activeRestaurants);
  if (!route) {
    logger.error(`[${providerName}] Unmapped receiving account; inbound message blocked`);
    return { handled: true, skipped: 'unknown_receiver' };
  }
  const receiverContext = { provider: identity.provider, receiver: identity.receiver };
  const sendAttempt = { identity, messageId };
  const processingKey = lockKey(identity);
  const lockOwner = randomUUID();

  // Privacy: customer message bodies often contain PII (names, dietary needs,
  // celebration context, sometimes credit-card last-4 typed in panic). Never
  // log the content — only enough metadata to triage problems. The previous
  // version logged the first 40 chars verbatim, which leaked PII into every
  // Vercel log line and any downstream log aggregator.
  const textLen = typeof text === 'string' ? text.length : 0;
  logger.info(`[${providerName}] processMessage ENTRY receiver=${identity.receiver} msgId=${String(messageId).slice(-8)} textLen=${textLen}`);

  // Serialize the entire read/modify/write of this account's conversation.
  // Never fall back to an in-process lock: separate Vercel Lambdas would race.
  let lockAcquired = await acquireProcessingLock(processingKey, 125,
    { ownerToken: lockOwner, requireDurable: true });
  if (!lockAcquired) {
    // Return a retryable webhook status quickly instead of burning 45 seconds
    // in a Lambda while another invocation owns this same conversation.
    for (let attempt = 0; attempt < 2 && !lockAcquired; attempt++) {
      await new Promise(r => setTimeout(r, 750));
      lockAcquired = await acquireProcessingLock(processingKey, 125,
        { ownerToken: lockOwner, requireDurable: true });
    }
  }
  if (!lockAcquired) {
    logger.error(`[${providerName}] Durable inbound lock unavailable`);
    return { handled: false, retryable: true, skipped: 'lock_unavailable' };
  }

  try {

  // 1. Mark as read (fire-and-forget)
  adapter.markAsRead(messageId, receiverContext).catch(() => {});

  // Only a COMPLETED message is duplicate. A failed attempt must be retried.
  if (messageId && await wasCompleted(identity, messageId)) {
    logger.info(`[${providerName}] Duplicate message ${messageId}, skipping`);
    return { handled: true };
  }
  if (await hasSendAttempt(identity, messageId)) {
    // The provider may have accepted the reply even if our completion write
    // failed. Never replay a potentially delivered message or its AI tools.
    logger.error(`[${providerName}] Inbound send state uncertain; manual reconciliation required`,
      { messageId: String(messageId).slice(-8) });
    return { handled: false, retryable: false, skipped: 'send_uncertain' };
  }
  if (await wasRateBlocked(identity, messageId)) {
    await markCompleted(identity, messageId);
    return { handled: true, skipped: 'rate_limited' };
  }
  const pendingReply = await getPendingReply(identity, messageId);
  if (pendingReply) {
    // Reuse the exact planned reply: AI tools, ratings and session mutations
    // already happened on the first attempt and must not run a second time.
    const boundRestaurantId = pendingReply.restaurant_id;
    if (boundRestaurantId) {
      let stillOwned = route.restaurant
        ? route.restaurant.id === boundRestaurantId
        : route.picker.some(r => r.id === boundRestaurantId);
      if (!stillOwned && providerName === 'meta' &&
          identity.receiver === normalizedReceiver('meta', process.env.WHATSAPP_PHONE_NUMBER_ID) &&
          !route.restaurant?.whatsapp_phone_number_id) {
        // A demo is deliberately inactive in the registry. An explicit,
        // current-route session may still replay its saved reply, but an old
        // owner or expired demo must not leak through this shortcut.
        const scoped = await getSessionByPhone(from, identity, { strict: true });
        if (scoped?.restaurant_id === boundRestaurantId &&
            scoped.conversation_id === demoConversationId(boundRestaurantId, route)) {
          const { supabaseAdmin } = require('../supabase');
          const { data: demo, error } = await supabaseAdmin.schema('restaurant')
            .from('restaurant_config').select('is_demo,demo_expires_at')
            .eq('id', boundRestaurantId).maybeSingle();
          if (error) return { handled: false, retryable: true, skipped: 'demo_lookup_failed' };
          stillOwned = demo?.is_demo === true &&
            (!demo.demo_expires_at || Date.parse(demo.demo_expires_at) > Date.now());
        }
      }
      if (!stillOwned) {
        logger.error(`[${providerName}] Pending reply belongs to the prior receiver owner`);
        return { handled: false, retryable: false, skipped: 'pending_tenant_changed' };
      }
    }
    const replay = await enviarComGuarda(adapter, from, pendingReply.reply_text,
      pendingReply.purpose, receiverContext, sendAttempt);
    if (!replay.entregue) {
      return { handled: false, retryable: !replay.uncertain, skipped: 'pending_reply_send_failed' };
    }
    await markCompleted(identity, messageId);
    return { handled: true, skipped: 'pending_reply_replayed' };
  }

  const outcome = await (async () => {

  // 3. Rate limit
  // await obrigatório: a contagem agora vive no Postgres (compartilhada entre
  // Lambdas). Sem o await isto seria uma Promise — sempre truthy — e TODA
  // mensagem seria descartada como se tivesse estourado o limite.
  if ((await claimRateCount(identity, messageId)) && await isRateLimited(processingKey)) {
    logger.info(`[${providerName}] Rate limited ${from}`);
    await markRateBlocked(identity, messageId);
    return { handled: true };
  }

  if (preprocessReply) {
    const sent = await enviarComGuarda(adapter, from, preprocessReply, 'media_reply', receiverContext, sendAttempt);
    return { handled: sent.entregue, retryable: !sent.entregue && !sent.uncertain,
      skipped: sent.entregue ? 'media_reply' : 'media_reply_failed' };
  }

  // (Keyword handling moved below session mgmt — keywords like RELATORIO and
  //  STOP need restaurant_id, which isn't available until step 7+8 completes.)

  // (Feedback/pesquisa movidos para DEPOIS do roteamento — passo 8c. Rodavam
  //  aqui, antes de o restaurante ser conhecido, e as duas consultas buscavam
  //  só por telefone via supabaseAdmin: um "5" mandado para o restaurante B
  //  virava avaliação do A. Ver bug #66.)

  // 7. Session management (with one retry on transient failure).
  // 35s per attempt: supabase-js has a 28s fetch timeout, +buffer for
  // cold Lambda TLS handshake. 2 attempts = up to 70s + 1.5s delay,
  // still within our 120s Lambda maxDuration budget.
  let session;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      session = await Promise.race([
        getOrCreateSession(from, `${providerName}-${Date.now()}`, identity),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Session timeout')), 35000)),
      ]);
      if (session) break;
    } catch (err) {
      logger.error(`[${providerName}] Session attempt ${attempt + 1} failed:`, err.message);
    }
    if (attempt === 0 && !session) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!session) {
    return { handled: false, retryable: true, skipped: 'session_unavailable' };
  }

  if (session.inbound_provider !== identity.provider || session.inbound_receiver !== identity.receiver) {
    logger.error(`[${providerName}] Session receiver mismatch; inbound message blocked`);
    return { handled: true, skipped: 'session_scope_mismatch' };
  }

  // A scoped session may be bound only to the restaurant owned by this
  // receiving account, an eligible shared-number choice, or an explicitly
  // prelinked demo on this same account. Never trust a stale tenant ID.
  const eligibleRestaurantIds = route.restaurant
    ? [route.restaurant.id]
    : route.picker.map(r => r.id);
  if (session.restaurant_id && !eligibleRestaurantIds.includes(session.restaurant_id)) {
    const isExplicitDemo = session.conversation_id === demoConversationId(session.restaurant_id, route) &&
      providerName === 'meta' &&
      identity.receiver === normalizedReceiver('meta', process.env.WHATSAPP_PHONE_NUMBER_ID) &&
      !route.restaurant?.whatsapp_phone_number_id;
    if (!isExplicitDemo) {
      logger.warn(`[${providerName}] Receiver ownership changed; clearing stale tenant context`);
      const { resetSessionRestaurant } = require('../whatsapp-sessions');
      const reset = await resetSessionRestaurant(session.id);
      if (!reset) return { handled: false, retryable: true, skipped: 'tenant_reset_failed' };
      session = reset;
    }
  }
  if (session.restaurant_id && interactiveSelection?.id?.startsWith('restaurant_') &&
      interactiveSelection.id.slice('restaurant_'.length) !== session.restaurant_id) {
    logger.warn(`[${providerName}] Stale restaurant picker reply blocked`);
    return { handled: true, skipped: 'stale_restaurant_selection' };
  }

  // 8. Restaurant routing
  // Skip if session already has restaurant_id set (Supabase JOIN may return null for restaurant
  // object even when FK is set, so check restaurant_id as the authoritative signal)
  if (!session.restaurant && !session.restaurant_id) {
    try {
      if (activeRestaurants.length === 0) {
        // No restaurants configured or registry down — don't proceed to AI with broken context
        logger.error('[MessageProcessor] No active restaurants in registry — cannot route message');
        return { handled: false, retryable: true, skipped: 'registry_empty' };
      }

      // Route by phone_number_id first: if this WhatsApp number belongs to one specific restaurant
      // (each restaurant can have their own number), skip the picker entirely.
      const directMatch = route.restaurant;

      if (directMatch) {
        // Dedicated number — route directly without picker
        const updated = await setSessionRestaurant(session.id, directMatch.id);
        // Supabase JOIN on restaurant_registry consistently returns null even when FK is set.
        // Always force-inject directMatch so in-memory session always has restaurant context.
        if (!updated) return { handled: false, retryable: true, skipped: 'route_write_failed' };
        session = { ...updated, restaurant_id: directMatch.id, restaurant: directMatch };
        logger.info(`[MessageProcessor] Routed to ${directMatch.restaurant_name} via ${directMatch.whatsapp_phone_number_id ? 'phone_number_id' : 'env var'}`);
      } else {
        // Multiple restaurants on shared number — show interactive picker
        if (interactiveSelection?.id?.startsWith('restaurant_')) {
          // Customer just picked a restaurant from the list
          const selectedId = interactiveSelection.id.replace('restaurant_', '');
          const selectedRestaurant = route.picker.find(r => r.id === selectedId);
          if (selectedRestaurant) {
            const updated = await setSessionRestaurant(session.id, selectedRestaurant.id);
            if (!updated) return { handled: false, retryable: true, skipped: 'route_write_failed' };
            session = updated;
            sendAttempt.restaurantId = selectedRestaurant.id;
            // Send restaurant-specific greeting, localised to restaurant language
            const rLang = selectedRestaurant.language || 'pt';
            let greetingMsg = rLang === 'es'
              ? `¡Hola! Soy el asistente de ${selectedRestaurant.restaurant_name}. ¿En qué puedo ayudarte? 😊`
              : rLang === 'en'
                ? `Hi! I'm the assistant for ${selectedRestaurant.restaurant_name}. How can I help you? 😊`
                : `Oi! Sou o assistente do ${selectedRestaurant.restaurant_name}. Como posso te ajudar? 😊`;
            try {
              const { supabaseAdmin } = require('../supabase');
              const { data: rConfig } = await supabaseAdmin
                .schema('restaurant')
                .from('restaurant_config')
                .select('agent_greeting')
                .eq('id', selectedRestaurant.id)
                .maybeSingle();
              if (rConfig?.agent_greeting) greetingMsg = rConfig.agent_greeting;
            } catch (e) { /* non-fatal */ }
            const greeting = await enviarComGuarda(adapter, from, greetingMsg, 'saudacao', receiverContext, sendAttempt);
            return { handled: greeting.entregue, retryable: !greeting.entregue && !greeting.uncertain };
          }
        }

        // Send restaurant picker list
        await reserveSendAttempt(identity, messageId);
        const picker = await sendRestaurantPicker(adapter, from, route.picker, receiverContext);
        if (!picker.entregue) {
          // The interactive sender does not expose a reliable rejection class.
          // Preserve the send reservation rather than risk a duplicate picker.
          logger.error(`[${providerName}] Picker delivery uncertain; manual reconciliation required`);
        }
        return { handled: picker.entregue, retryable: false };
      }
    } catch (err) {
      logger.error('Restaurant routing error:', err.message);
      // Never fall into AI after a failed picker/greeting reservation or send.
      return { handled: false, retryable: true, skipped: 'route_unavailable' };
    }
  }

  // 8b. Re-hydrate session.restaurant when restaurant_id is set but JOIN returned null.
  //     The Supabase JOIN on restaurant_registry consistently returns null even when the FK is
  //     set. For fresh sessions the routing block above forces-injects the restaurant object.
  //     For returning sessions (session already has restaurant_id from a prior message), the
  //     routing block is skipped, leaving session.restaurant null and the AI without context.
  if (session.restaurant_id && !session.restaurant) {
    try {
      const allRestaurants = await getAllActiveRestaurants();
      const found = allRestaurants.find(r => r.id === session.restaurant_id);
      if (found) {
        session = { ...session, restaurant: found };
        logger.info(`[${providerName}] Re-hydrated session.restaurant for ${found.restaurant_name}`);
      } else {
        // 8b-bis. SESSÃO ÓRFÃ.
        //
        // Não está no registry ativo. Pode ser um demo (inserido inativo de
        // propósito, ver demo-whatsapp-link.js) ou um restaurante que
        // DESAPARECEU — caso típico: o cron apagou o demo expirado.
        //
        // Eu havia assumido que uma FK `ON DELETE SET NULL` limparia isso
        // sozinha. ERRADO: sondei produção e NÃO existe FK entre
        // whatsapp_sessions.restaurant_id e restaurant_registry — um insert com
        // id inexistente é aceito (HTTP 201). Logo a limpeza tem de ser aqui.
        //
        // Sem isto, a sessão segue apontando para um id morto: processWithAI não
        // acha a config, cai num prompt genérico, e o dono conversa com uma IA
        // que não é a dele — sem nenhum erro visível.
        let existe = false;
        try {
          const { supabaseAdmin } = require('../supabase');
          const { data } = await supabaseAdmin
            .schema('restaurant')
            .from('restaurant_config')
            .select('id')
            .eq('id', session.restaurant_id)
            .maybeSingle();
          existe = Boolean(data);
        } catch (e) {
          // Não deu para confirmar a ausência → não limpa. Preferir uma sessão
          // possivelmente órfã a apagar o vínculo de um restaurante real por
          // causa de uma falha de leitura.
          logger.warn(`[${providerName}] Não foi possível checar se o restaurante ainda existe:`, e.message);
          existe = true;
        }

        if (existe) {
          // Caso legítimo: demo vinculado (inativo no registry, vivo no config).
          logger.info(`[${providerName}] restaurant_id fora do registry ativo, mas existe no config — segue (demo)`);
        } else {
          logger.warn(`[${providerName}] Restaurante ${session.restaurant_id} não existe mais — limpando sessão órfã`);
          try {
            const { clearSession } = require('../whatsapp-sessions');
            await clearSession(session.id);
          } catch (e) {
            logger.error(`[${providerName}] Falha ao limpar sessão órfã — a próxima mensagem repetirá isto`, {
              erro: e?.message || String(e),
            });
          }
          // Segue sem restaurante: o roteamento normal reassume na próxima.
          session = { ...session, restaurant_id: null, restaurant: null };
        }
      }
    } catch (err) {
      logger.warn(`[${providerName}] Failed to re-hydrate session.restaurant (non-fatal):`, err.message);
    }
  }

  sendAttempt.restaurantId = session.restaurant_id || session.restaurant?.id || null;

  // 8c. Template keyword handling (MODIFY, CANCEL, CONFIRM, BOOK, HELP, STOP, RELATORIO).
  //     Runs AFTER session management so keywords that need restaurant_id (RELATORIO,
  //     STOP) have a valid session. Previously ran at step 4, before session mgmt —
  //     which caused RELATORIO to silently fail because restaurantId was always null.
  if (text && typeof text === 'string') {
    const normalizedText = text.trim().toUpperCase();
    try {
      const handled = await handleKeyword(normalizedText, from, session, {
        ...receiverContext,
        beforeReportSend: () => reserveSendAttempt(identity, messageId),
        releaseRejectedReport: () => releaseRejectedSend(identity, messageId),
        sendText: (body, purpose = 'keyword') =>
          enviarComGuarda(adapter, from, body, purpose, receiverContext, sendAttempt),
      });
      if (handled) {
        // The outer finally releases the account-scoped lock on this early exit.
        return { handled: true };
      }
    } catch (err) {
      logger.error(`[${providerName}] Keyword handler error:`, err.message);
      const uncertain = await hasSendAttempt(identity, messageId);
      return { handled: false, retryable: !uncertain, skipped: 'keyword_send_failed' };
    }
  }

  // 8d. Feedback e pesquisa — DEPOIS do roteamento (bug #66).
  //     (Era "8c" e colidia com o bloco de keywords acima; renumerado.)
  //
  // Rodavam antes de o restaurante ser conhecido, e as duas consultas buscavam
  // só por telefone via supabaseAdmin (que ignora RLS). Um cliente com pesquisa
  // pendente no restaurante A que mandasse "5" para o B tinha a nota gravada em
  // A — e o B nunca via. Agora o restaurante da conversa é passado às duas, que
  // filtram por ele.
  //
  // TROCA CONSCIENTE: num número COMPARTILHADO por vários restaurantes, uma
  // mensagem que caia no seletor retorna antes daqui, então a nota não é lida
  // nesta mensagem. Não é perda definitiva — a pesquisa segue pendente dentro
  // das 48h e a próxima mensagem, já com restaurante resolvido, a captura.
  // Preferir isso a gravar na casa errada: nota no lugar errado é dado falso
  // nos dois restaurantes e ninguém percebe.
  const restauranteDaConversa = session.restaurant_id || session.restaurant?.id || null;
  const ratingKey = replyKey(identity, messageId);
  const ratingLanguage = activeRestaurants.find(r => r.id === restauranteDaConversa)?.language ||
    session.restaurant?.language || 'en';
  // The rating row records this exact inbound key in the same database write.
  // A crash between saving the rating and reserving its reply is recoverable.
  if (lerNota(text || '').nota !== null) {
    let recorded;
    try {
      recorded = await getRecordedRating(identity, messageId, restauranteDaConversa);
    } catch (err) {
      logger.error('Recorded rating recovery failed:', err.message);
      return { handled: false, retryable: true, skipped: 'rating_recovery_unavailable' };
    }
    if (recorded) {
      const reply = ratingReplyText(recorded.purpose, recorded, ratingLanguage);
      const sent = await enviarComGuarda(adapter, from, reply, recorded.purpose, receiverContext, sendAttempt);
      return { handled: sent.entregue, retryable: !sent.entregue && !sent.uncertain,
        skipped: sent.entregue ? 'rating_reply_recovered' : 'rating_reply_failed' };
    }
  }
  let pendingFeedback = null;
  try {
    pendingFeedback = await findPendingFeedbackForPhone(from, restauranteDaConversa);
  } catch (err) {
    logger.error('Feedback lookup failed:', err.message);
    return { handled: false, retryable: true, skipped: 'feedback_lookup_failed' };
  }

  if (pendingFeedback) {
    // Silêncio aqui PERDE a avaliação de um cliente real: ele mandou a nota,
    // o registro falhou, e a resposta cai no fluxo normal como se fosse uma
    // mensagem qualquer. O cliente não recebe agradecimento e o restaurante
    // nunca vê a nota — sem nenhum sinal de que existiu.
    let result;
    try {
      result = await processFeedbackReply(pendingFeedback.restaurantId, from, text, ratingKey);
    } catch (err) {
      logger.error('Falha ao registrar resposta de feedback — aguardando retry', {
        restaurantId: pendingFeedback.restaurantId,
        de: from,
        erro: err?.message || String(err),
      });
      return { handled: false, retryable: true, skipped: 'feedback_write_failed' };
    }
    if (result) {
      const thankYou = ratingReplyText('feedback', result, ratingLanguage);
      const sent = await enviarComGuarda(adapter, from, thankYou, 'feedback', receiverContext, sendAttempt);
      return { handled: sent.entregue, retryable: !sent.entregue && !sent.uncertain,
        skipped: sent.entregue ? undefined : 'feedback_ack_failed' };
    }
  }

  let surveyResult = null;
  try {
    surveyResult = await handleSurveyReply(from, text, restauranteDaConversa, ratingKey);
  } catch (err) {
    logger.error('Survey reply failed:', err.message);
    return { handled: false, retryable: true, skipped: 'survey_write_failed' };
  }
  if (surveyResult) {
    const thankYou = ratingReplyText('pesquisa', surveyResult, ratingLanguage);
    const sent = await enviarComGuarda(adapter, from, thankYou, 'pesquisa', receiverContext, sendAttempt);
    return { handled: sent.entregue, retryable: !sent.entregue && !sent.uncertain,
      skipped: sent.entregue ? undefined : 'survey_ack_failed' };
  }


  // 9. Provider guard — skip if restaurant uses the other provider
  if (options.oppositeProvider && session?.restaurant?.id) {
    try {
      const provider = await getWhatsAppProvider(session.restaurant.id);
      if (provider === options.oppositeProvider) {
        logger.info(`Restaurant uses ${provider}, not ${providerName} — skipping`);
        return { handled: true };
      }
    } catch (err) {
      logger.warn('Provider check failed (non-fatal):', err.message);
    }
  }

  // 9c. TRANSBORDO: a conversa está com um humano — a IA não fala.
  //
  // O portão fica aqui, DEPOIS do roteamento e das palavras-chave e ANTES de
  // qualquer trabalho pago (reação, LLM, tools). Palavra-chave continua valendo
  // de propósito: se o cliente mandar STOP ou pedir relatório, isso é comando de
  // sistema e não conversa, e não faz sentido segurar.
  //
  // A pausa expira sozinha — isPaused compara com o relógio a cada leitura, em
  // vez de confiar num booleano gravado, então a retomada não depende de nenhum
  // cron existir. O silêncio é intencional: mandar "ainda estamos vendo" a cada
  // mensagem enquanto o host não responde é ruído para o cliente e não acelera
  // nada. A mensagem de que alguém foi chamado já saiu quando a tool rodou.
  if (isPaused(session)) {
    logger.info(`[${providerName}] Sessão em transbordo humano até ${session.handoff_paused_until} — IA em silêncio`);
    return { ok: true, skipped: 'handoff_paused' };
  }

  // 10. Add processing reaction
  adapter.addReaction(from, messageId, '\uD83D\uDC40', receiverContext).catch(() => {}); // eye emoji

  // 11. AI processing
  const conversationHistory = Array.isArray(session.conversation_history) ? session.conversation_history : [];

  // Enrich button replies with structured context so the AI can act on them directly
  let aiMessage = mediaContext ? `${mediaContext}\n${text}` : text;
  if (interactiveSelection?.id) {
    if (interactiveSelection.id.startsWith('confirm_reservation_')) {
      const reservationId = interactiveSelection.id.replace('confirm_reservation_', '');
      aiMessage = `[BUTTON_ACTION: confirm_reservation id=${reservationId}] ${text}`;
    } else if (interactiveSelection.id.startsWith('cancel_reservation_')) {
      const reservationId = interactiveSelection.id.replace('cancel_reservation_', '');
      aiMessage = `[BUTTON_ACTION: cancel_reservation id=${reservationId}] ${text}`;
    } else if (interactiveSelection.id.startsWith('modify_reservation_')) {
      const reservationId = interactiveSelection.id.replace('modify_reservation_', '');
      aiMessage = `[BUTTON_ACTION: modify_reservation id=${reservationId}] ${text}`;
    } else if (interactiveSelection.id === 'action_make_reservation') {
      aiMessage = `[BUTTON_ACTION: make_reservation] ${text || 'Quero fazer uma reserva'}`;
    } else if (interactiveSelection.id === 'action_change_reservation') {
      aiMessage = `[BUTTON_ACTION: change_reservation] ${text || 'Quero alterar uma reserva'}`;
    } else if (interactiveSelection.id === 'action_cancel_reservation') {
      aiMessage = `[BUTTON_ACTION: cancel_reservation] ${text || 'Quero cancelar uma reserva'}`;
    }
  }

  let response;
  try {
    response = await processWithAI(aiMessage, session, conversationHistory, {
      providerName,
      receiver: identity.receiver,
      messageId,
    });
  } catch (err) {
    logger.error(`[${providerName}] AI error:`, err.message);
    response = 'Desculpe, tive dificuldade em processar sua mensagem. Por favor, tente novamente.';
  }

  // 12. Remove processing reaction
  adapter.removeReaction(from, messageId, receiverContext).catch(() => {});

  // 13. ENVIAR ANTES DE GRAVAR.
  //
  // A ordem era o inverso: gravava o par user+assistant no histórico e só
  // depois mandava. Quando o envio falhava — janela de 24h fechada, token
  // recusado, número sem WhatsApp — o cliente não recebia nada e o histórico
  // ficava com uma resposta do assistente que NUNCA existiu. Nas mensagens
  // seguintes a IA relia esse turno fantasma como se já tivesse respondido, e
  // o restaurante via uma conversa aparentemente completa com um cliente que
  // sumiu sem explicação.
  //
  // Agora: envia, e o que se grava depende do resultado. O turno do CLIENTE
  // entra de qualquer jeito — ele falou de verdade, e perder isso apagaria o
  // contexto da próxima mensagem.
  await simulateTypingDelay(response.length);
  const envio = await enviarComGuarda(adapter, from, response, 'resposta-ia', receiverContext, sendAttempt);

  const newPair = cleanHistoryForStorage(
    envio.entregue
      ? [{ role: 'user', content: text }, { role: 'assistant', content: response }]
      : [{ role: 'user', content: text }],
  );
  const updatedHistory = cleanHistoryForStorage([
    ...conversationHistory,
    ...newPair,
  ]);
  try {
    await updateSessionConversationHistory(session.id, updatedHistory, {
      appendMessages: newPair,
    });
  } catch (err) {
    logger.error('Failed to save history (non-fatal):', err.message);
  } finally {
    // Saída normal de TODA mensagem, então soltar o lock sem await deixa o
    // caminho quente inteiro sujeito ao freeze da lambda: quando o DELETE não
    // landa, a mensagem seguinte espera o TTL de 30s à toa.
    // The outer finally also releases on every early routing/feedback exit.
  }

  // 14. Memory extraction — só sobre conversa que aconteceu.
  //
  // AGUARDADA com teto de 6s, mesmo teto que manager-agent.js usa na operação
  // idêntica (extractFactsFromConversation). Era fire-and-forget e morria no
  // freeze: a resposta ao cliente já saiu daqui, quem esperava era só o 200 para
  // a Meta. Aguardar não arrisca re-entrega — o orçamento de retry de 20s da Meta
  // é absorvido pelo dedup no Redis (ver comentário em api/whatsapp-webhook.js),
  // então retry do mesmo messageId vira no-op.
  if (envio.entregue && session?.restaurant?.id && updatedHistory.length >= 4) {
    await Promise.race([
      extractMemoriesFromWhatsApp(session.restaurant.id, from, updatedHistory, session.id)
        .catch(err => logger.warn('Memory extraction failed (non-fatal):', err.message)),
      new Promise((resolve) => setTimeout(resolve, 6000)),
    ]);
  }

  // 17. Welcome buttons — DISABLED.
  //     Firing on every conversationHistory.length===0 produced a "2 bot replies"
  //     UX complaint: AI's text reply + "O que você gostaria de fazer?" button card
  //     arrived together on every new session, which the user read as two agents
  //     responding (the AI greeting already offers reservation/change/cancel paths).
  //     Sessions expire every ~30min so the buttons fired constantly, not just
  //     on true first-contact. The AI reply alone is sufficient.
  //
  //     To re-enable for a single scenario (e.g. only on first-ever contact from
  //     a new phone), gate on customer_history lookups rather than session state.

  return { response, handled: envio.entregue, retryable: !envio.entregue && !envio.uncertain,
    restaurantId: session?.restaurant_id || session?.restaurant?.id || null };
  })();
  if ((outcome.handled || outcome.skipped === 'handoff_paused') && messageId) {
    await markCompleted(identity, messageId);
  }
  return outcome;
  } finally {
    await releaseProcessingLock(processingKey, lockOwner).catch(() => {});
  }
}

/**
 * Send quick-reply buttons after the first greeting so the customer can
 * tap instead of type for the most common actions.
 *
 * @param {import('./channel-adapter').ChannelAdapter} adapter
 * @param {string} from
 * @param {object} session
 */
async function sendWelcomeButtons(adapter, from, session) {
  const lang = session?.restaurant?.language || 'pt';

  let bodyText, buttons;
  if (lang === 'en') {
    bodyText = 'What would you like to do? 😊';
    buttons = [
      { id: 'action_make_reservation',   title: '📅 New reservation' },
      { id: 'action_change_reservation', title: '✏️ Change booking' },
      { id: 'action_cancel_reservation', title: '❌ Cancel booking' },
    ];
  } else if (lang === 'es') {
    bodyText = '¿Qué te gustaría hacer? 😊';
    buttons = [
      { id: 'action_make_reservation',   title: '📅 Nueva reserva' },
      { id: 'action_change_reservation', title: '✏️ Cambiar reserva' },
      { id: 'action_cancel_reservation', title: '❌ Cancelar reserva' },
    ];
  } else {
    bodyText = 'O que você gostaria de fazer? 😊';
    buttons = [
      { id: 'action_make_reservation',   title: '📅 Nova reserva' },
      { id: 'action_change_reservation', title: '✏️ Alterar reserva' },
      { id: 'action_cancel_reservation', title: '❌ Cancelar reserva' },
    ];
  }

  try {
    await adapter.sendButtons(from, bodyText, buttons);
    logger.info(`[${adapter.providerName}] Welcome buttons sent to ${from}`);
  } catch (err) {
    logger.warn('Welcome buttons failed (non-fatal):', err.message);
  }
}

/**
 * Send an interactive restaurant picker list to the customer.
 * Used when multiple restaurants share one WhatsApp number.
 *
 * @param {import('./channel-adapter').ChannelAdapter} adapter
 * @param {string} from
 * @param {Array} restaurants - List from getAllActiveRestaurants()
 */
async function sendRestaurantPicker(adapter, from, restaurants, receiverContext) {
  const sections = [];
  const chunkSize = 10;
  for (let i = 0; i < restaurants.length; i += chunkSize) {
    const chunk = restaurants.slice(i, i + chunkSize);
    sections.push({
      title: sections.length === 0 ? 'Restaurantes' : `Mais restaurantes`,
      rows: chunk.map(r => ({
        id: `restaurant_${r.id}`,
        title: r.restaurant_name,
        description: r.restaurant_type && r.city
          ? `${r.restaurant_type} \u00B7 ${r.city}`
          : (r.restaurant_type || r.city || ''),
      })),
    });
  }
  const result = await adapter.sendInteractiveList(
    from,
    'Ol\u00E1! Com qual restaurante voc\u00EA gostaria de falar?',
    'Ver restaurantes',
    sections,
    receiverContext,
  );
  const delivery = avaliarEnvio(result);
  if (delivery.entregue) logger.info(`[MessageProcessor] Sent restaurant picker (${restaurants.length} options)`);
  else logger.error(`${delivery.resumo} origem=restaurant-picker`);
  return delivery;
}

module.exports = { processMessage };
