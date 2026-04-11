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
const { isMessageDuplicate } = require('../rate-limit');
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
  const { from, messageId, text, mediaContext, interactiveSelection } = msg;
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

  // 5. Feedback reply detection
  try {
    const pendingFeedback = await findPendingFeedbackForPhone(from);
    if (pendingFeedback) {
      const result = await processFeedbackReply(pendingFeedback.restaurantId, from, text);
      if (result) {
        const thankYou = result.rating
          ? `Thank you for your feedback! You rated us ${result.rating}/5.${result.comment ? ' We appreciate your comments.' : ''} We look forward to welcoming you again!`
          : 'Thank you for your feedback! We appreciate you taking the time to share your thoughts.';
        await adapter.sendMessage(from, thankYou);
        return { handled: true };
      }
    }
  } catch (err) {
    logger.error('Feedback reply check failed:', err.message);
  }

  // 6. Survey reply detection
  try {
    const surveyResult = await handleSurveyReply(from, text);
    if (surveyResult) {
      const stars = '\u2B50'.repeat(surveyResult.rating);
      const thankYou = surveyResult.comment
        ? `Obrigado pela avaliacao! ${stars} (${surveyResult.rating}/5)\nSeu comentario foi registrado. Esperamos ve-lo novamente!`
        : `Obrigado pela avaliacao! ${stars} (${surveyResult.rating}/5)\nEsperamos ve-lo novamente!`;
      await adapter.sendMessage(from, thankYou);
      return { handled: true };
    }
  } catch (err) {
    logger.error('Survey reply check failed:', err.message);
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

  // 8. Restaurant routing
  if (!session.restaurant) {
    try {
      const activeRestaurants = await Promise.race([
        getAllActiveRestaurants(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Restaurant lookup timeout')), 20000)),
      ]);

      if (activeRestaurants.length === 1) {
        const updated = await setSessionRestaurant(session.id, activeRestaurants[0].id);
        if (updated) session = updated;
      } else if (activeRestaurants.length > 1) {
        // Interactive restaurant selection
        if (interactiveSelection?.id?.startsWith('restaurant_')) {
          const selectedId = interactiveSelection.id.replace('restaurant_', '');
          const selectedRestaurant = activeRestaurants.find(r => r.id === selectedId);
          if (selectedRestaurant) {
            const updated = await setSessionRestaurant(session.id, selectedRestaurant.id);
            if (updated) session = updated;
            // Load greeting
            let greetingMsg = `Oi! Sou o assistente do ${selectedRestaurant.restaurant_name}. Como posso te ajudar?`;
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

        // Send interactive list (Meta only)
        const sections = [];
        const chunkSize = 10;
        for (let i = 0; i < activeRestaurants.length; i += chunkSize) {
          const chunk = activeRestaurants.slice(i, i + chunkSize);
          sections.push({
            title: sections.length === 0 ? 'Restaurantes' : `Mais (${sections.length + 1})`,
            rows: chunk.map(r => ({
              id: `restaurant_${r.id}`,
              title: r.restaurant_name,
              description: r.restaurant_type && r.city
                ? `${r.restaurant_type} \u00B7 ${r.city}`
                : (r.restaurant_type || r.city || ''),
            })),
          });
        }
        await adapter.sendInteractiveList(from, 'Ol\u00E1! Com qual restaurante voc\u00EA gostaria de falar?', 'Ver restaurantes', sections);
        return { handled: true };
      }
    } catch (err) {
      logger.error('Restaurant routing error (non-fatal):', err.message);
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
    if (interactiveSelection.id.startsWith('cancel_reservation_')) {
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

  const bodyText = lang === 'en'
    ? 'What would you like to do? 😊'
    : 'O que você gostaria de fazer? 😊';

  const buttons = lang === 'en'
    ? [
        { id: 'action_make_reservation',   title: '📅 New reservation' },
        { id: 'action_change_reservation', title: '✏️ Change booking' },
        { id: 'action_cancel_reservation', title: '❌ Cancel booking' },
      ]
    : [
        { id: 'action_make_reservation',   title: '📅 Nova reserva' },
        { id: 'action_change_reservation', title: '✏️ Alterar reserva' },
        { id: 'action_cancel_reservation', title: '❌ Cancelar reserva' },
      ];

  try {
    await adapter.sendButtons(from, bodyText, buttons);
    logger.info(`[${adapter.providerName}] Welcome buttons sent to ${from}`);
  } catch (err) {
    logger.warn('Welcome buttons failed (non-fatal):', err.message);
  }
}

module.exports = { processMessage };
