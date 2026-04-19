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
const { isMessageDuplicate, acquireProcessingLock, releaseProcessingLock } = require('../rate-limit');
const { getOrCreateSession, setSessionRestaurant, updateSessionConversationHistory } = require('../whatsapp-sessions');
const { getAllActiveRestaurants } = require('../restaurant-registry');
const { getWhatsAppProvider } = require('../whatsapp-sender');
const { processWithAI, cleanHistoryForStorage } = require('../../services/whatsapp/conversation');
const { handleKeyword } = require('../../services/whatsapp/keyword-handler');
const { isRateLimited } = require('../../services/whatsapp/rate-limiter');
const { findPendingFeedbackForPhone, processFeedbackReply } = require('../../services/feedbackService');
const { handleSurveyReply } = require('../../services/surveyReplyHandler');
const { extractMemoriesFromWhatsApp } = require('../../services/memoryExtractor');
const { simulateTypingDelay } = require('../whatsapp-interactions');

const logger = createSecureLogger('MessageProcessor');

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
  const { from, messageId, text, mediaContext, interactiveSelection, phoneNumberId } = msg;
  const providerName = adapter.providerName;

  // 1. Mark as read (fire-and-forget)
  adapter.markAsRead(messageId).catch(() => {});

  // 2. Dedup check
  if (messageId && await isMessageDuplicate(messageId, 86400)) {
    logger.info(`[${providerName}] Duplicate message ${messageId}, skipping`);
    return { handled: true };
  }

  // 3. Rate limit
  if (isRateLimited(from)) {
    logger.info(`[${providerName}] Rate limited ${from}`);
    return { handled: true };
  }

  // 4. Keyword handling (template responses)
  const normalizedText = text.trim().toUpperCase();
  const keywordHandled = await handleKeyword(normalizedText, from);
  if (keywordHandled) {
    return { handled: true };
  }

  // 5+6. Feedback and survey reply detection (parallel — independent DB lookups)
  let pendingFeedback = null;
  let surveyResult = null;
  try {
    [pendingFeedback, surveyResult] = await Promise.all([
      findPendingFeedbackForPhone(from).catch(err => {
        logger.error('Feedback reply check failed:', err.message);
        return null;
      }),
      handleSurveyReply(from, text).catch(err => {
        logger.error('Survey reply check failed:', err.message);
        return null;
      }),
    ]);
  } catch (err) {
    logger.error('Feedback/survey parallel check failed:', err.message);
  }

  if (pendingFeedback) {
    const result = await processFeedbackReply(pendingFeedback.restaurantId, from, text).catch(() => null);
    if (result) {
      let feedbackLang = 'en';
      try {
        const activeRestaurants = await getAllActiveRestaurants();
        const restaurant = activeRestaurants.find(r => r.id === pendingFeedback.restaurantId);
        feedbackLang = restaurant?.language || 'en';
      } catch (_) { /* fall back to English */ }
      const thankYou = result.rating
        ? feedbackLang === 'pt' || feedbackLang === 'pt-BR'
          ? `Obrigado pelo seu feedback! Voce nos avaliou ${result.rating}/5.${result.comment ? ' Agradecemos seu comentario.' : ''} Esperamos te ver novamente!`
          : feedbackLang === 'es'
            ? `¡Gracias por tu opinion! Nos diste ${result.rating}/5.${result.comment ? ' Apreciamos tus comentarios.' : ''} ¡Esperamos verte pronto!`
            : `Thank you for your feedback! You rated us ${result.rating}/5.${result.comment ? ' We appreciate your comments.' : ''} We look forward to welcoming you again!`
        : feedbackLang === 'pt' || feedbackLang === 'pt-BR'
          ? 'Obrigado pelo seu feedback! Agradecemos o seu tempo.'
          : feedbackLang === 'es'
            ? '¡Gracias por tu opinion! Apreciamos que te hayas tomado el tiempo.'
            : 'Thank you for your feedback! We appreciate you taking the time to share your thoughts.';
      await adapter.sendMessage(from, thankYou);
      return { handled: true };
    }
  }

  if (surveyResult) {
    let surveyLang = 'en';
    try {
      const activeRestaurants = await getAllActiveRestaurants();
      const restaurant = activeRestaurants.find(r => r.id === surveyResult.restaurantId);
      surveyLang = restaurant?.language || 'en';
    } catch (_) { /* fall back to English */ }
    const stars = '\u2B50'.repeat(surveyResult.rating);
    const thankYou = surveyResult.comment
      ? surveyLang === 'pt' || surveyLang === 'pt-BR'
        ? `Obrigado pela avaliacao! ${stars} (${surveyResult.rating}/5)\nSeu comentario foi registrado. Esperamos te ver novamente!`
        : surveyLang === 'es'
          ? `¡Gracias por tu valoracion! ${stars} (${surveyResult.rating}/5)\nTu comentario fue registrado. ¡Esperamos verte pronto!`
          : `Thank you for your rating! ${stars} (${surveyResult.rating}/5)\nYour comment has been recorded. We hope to see you again!`
      : surveyLang === 'pt' || surveyLang === 'pt-BR'
        ? `Obrigado pela avaliacao! ${stars} (${surveyResult.rating}/5)\nEsperamos te ver novamente!`
        : surveyLang === 'es'
          ? `¡Gracias por tu valoracion! ${stars} (${surveyResult.rating}/5)\n¡Esperamos verte pronto!`
          : `Thank you for your rating! ${stars} (${surveyResult.rating}/5)\nWe hope to see you again!`;
    await adapter.sendMessage(from, thankYou);
    return { handled: true };
  }

  // 7. Session management
  let session;
  try {
    session = await Promise.race([
      getOrCreateSession(from, `${providerName}-${Date.now()}`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Session timeout')), 20000)),
    ]);
  } catch (err) {
    logger.error(`[${providerName}] Session failed:`, err.message);
    session = null;
  }

  if (!session) {
    await adapter.sendMessage(from, 'Desculpe, tive um problema ao iniciar nossa conversa. Por favor, tente novamente.');
    return { handled: true };
  }

  // 7b. Per-phone lock — prevents concurrent Lambdas from overwriting each other's history.
  // If another Lambda is already processing a message from this phone, wait 2s then re-read
  // fresh session state so we don't overwrite context with stale history.
  const lockAcquired = await acquireProcessingLock(from, 25);
  if (!lockAcquired) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const { getSessionByPhone } = require('../whatsapp-sessions');
      const fresh = await getSessionByPhone(from);
      if (fresh) session = { ...session, ...fresh };
    } catch (_) { /* non-fatal — use existing session */ }
  }

  // 8. Restaurant routing
  // Skip if session already has restaurant_id set (Supabase JOIN may return null for restaurant
  // object even when FK is set, so check restaurant_id as the authoritative signal)
  if (!session.restaurant && !session.restaurant_id) {
    try {
      const activeRestaurants = await Promise.race([
        getAllActiveRestaurants(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Restaurant lookup timeout')), 10000)),
      ]);

      if (activeRestaurants.length === 0) {
        // No restaurants configured or registry down — don't proceed to AI with broken context
        logger.error('[MessageProcessor] No active restaurants in registry — cannot route message');
        await adapter.sendMessage(from, 'Desculpe, nosso sistema está passando por manutenção. Por favor, tente novamente em alguns minutos. 🙏');
        return { handled: true };
      }

      // Route by phone_number_id first: if this WhatsApp number belongs to one specific restaurant
      // (each restaurant can have their own number), skip the picker entirely.
      let directMatch = null;
      if (phoneNumberId) {
        directMatch = activeRestaurants.find(r => r.whatsapp_phone_number_id === phoneNumberId);
      }
      // Env var override: TWILIO_RESTAURANT_ID / META_RESTAURANT_ID allow direct routing per
      // provider without needing the whatsapp_phone_number_id column set on every registry row.
      if (!directMatch) {
        const envRestaurantId = (providerName === 'twilio'
          ? process.env.TWILIO_RESTAURANT_ID
          : process.env.META_RESTAURANT_ID)?.trim();
        if (envRestaurantId) {
          directMatch = activeRestaurants.find(r => r.id === envRestaurantId);
        }
      }
      // Also check the env-level single-restaurant case (WHATSAPP_PHONE_NUMBER_ID points to one restaurant)
      const sharedPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const isSharedNumber = !directMatch && phoneNumberId && phoneNumberId === sharedPhoneNumberId;

      if (directMatch) {
        // Dedicated number — route directly without picker
        const updated = await setSessionRestaurant(session.id, directMatch.id);
        // Supabase JOIN on restaurant_registry consistently returns null even when FK is set.
        // Always force-inject directMatch so in-memory session always has restaurant context.
        session = { ...(updated || session), restaurant_id: directMatch.id, restaurant: directMatch };
        logger.info(`[MessageProcessor] Routed to ${directMatch.restaurant_name} via ${directMatch.whatsapp_phone_number_id ? 'phone_number_id' : 'env var'}`);
      } else if (activeRestaurants.length === 1 || (!isSharedNumber && !directMatch)) {
        // Only one active restaurant — auto-assign
        const chosen = activeRestaurants[0];
        const updated = await setSessionRestaurant(session.id, chosen.id);
        session = { ...(updated || session), restaurant_id: chosen.id, restaurant: chosen };
      } else {
        // Multiple restaurants on shared number — show interactive picker
        if (interactiveSelection?.id?.startsWith('restaurant_')) {
          // Customer just picked a restaurant from the list
          const selectedId = interactiveSelection.id.replace('restaurant_', '');
          const selectedRestaurant = activeRestaurants.find(r => r.id === selectedId);
          if (selectedRestaurant) {
            const updated = await setSessionRestaurant(session.id, selectedRestaurant.id);
            if (updated) session = updated;
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
            await adapter.sendMessage(from, greetingMsg);
            return { handled: true };
          }
        }

        // Send restaurant picker list
        await sendRestaurantPicker(adapter, from, activeRestaurants);
        return { handled: true };
      }
    } catch (err) {
      logger.error('Restaurant routing error:', err.message);
      // If routing fails entirely, bail gracefully rather than proceeding with no context
      if (!session.restaurant) {
        await adapter.sendMessage(from, 'Desculpe, tive um problema ao identificar o restaurante. Por favor, tente novamente. 🙏');
        return { handled: true };
      }
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
        logger.warn(`[${providerName}] restaurant_id ${session.restaurant_id} not in active registry`);
      }
    } catch (err) {
      logger.warn(`[${providerName}] Failed to re-hydrate session.restaurant (non-fatal):`, err.message);
    }
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

  // 10. Add processing reaction
  adapter.addReaction(from, messageId, '\uD83D\uDC40').catch(() => {}); // eye emoji

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
    response = await processWithAI(aiMessage, session, conversationHistory);
  } catch (err) {
    logger.error(`[${providerName}] AI error:`, err.message);
    response = 'Desculpe, tive dificuldade em processar sua mensagem. Por favor, tente novamente.';
  }

  // 12. Remove processing reaction
  adapter.removeReaction(from, messageId).catch(() => {});

  // 13. Save conversation history
  const updatedHistory = cleanHistoryForStorage([
    ...conversationHistory,
    { role: 'user', content: text },
    { role: 'assistant', content: response },
  ]);
  const cappedHistory = updatedHistory.slice(-20);
  try {
    await updateSessionConversationHistory(session.id, cappedHistory);
  } catch (err) {
    logger.error('Failed to save history (non-fatal):', err.message);
  } finally {
    releaseProcessingLock(from).catch(() => {});
  }

  // 14. Memory extraction (fire-and-forget)
  if (session?.restaurant?.id && updatedHistory.length >= 4) {
    extractMemoriesFromWhatsApp(session.restaurant.id, from, updatedHistory, session.id)
      .catch(err => logger.warn('Memory extraction failed (non-fatal):', err.message));
  }

  // 15. Typing delay
  await simulateTypingDelay(response.length);

  // 16. Send response
  await adapter.sendMessage(from, response);

  // 17. Welcome buttons — send on first message of a new session so the user
  //     can quickly tap to make/change/cancel a reservation without typing
  if (conversationHistory.length === 0 && session?.restaurant?.id) {
    sendWelcomeButtons(adapter, from, session).catch(() => {});
  }

  return { response, handled: true };
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
async function sendRestaurantPicker(adapter, from, restaurants) {
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
  await adapter.sendInteractiveList(
    from,
    'Ol\u00E1! Com qual restaurante voc\u00EA gostaria de falar?',
    'Ver restaurantes',
    sections,
  );
  logger.info(`[MessageProcessor] Sent restaurant picker (${restaurants.length} options) to ${from}`);
}

module.exports = { processMessage };
