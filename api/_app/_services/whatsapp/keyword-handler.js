// Template response keyword handling for WhatsApp

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const { handleOptOut } = require('../campaignService');
const { sendWeeklyReportViaWhatsApp } = require('../pdfReportService');
const { supabaseAdmin } = require('../../_lib/supabase');

async function isVerifiedReportManager(restaurantId, from) {
  if (!restaurantId || !from) return false;
  const { data, error } = await supabaseAdmin.schema('restaurant').from('restaurant_config')
    .select('manager_phone,manager_whatsapp_verified').eq('id', restaurantId).maybeSingle();
  return !error && data?.manager_whatsapp_verified === true &&
    !!data?.manager_phone &&
    String(data.manager_phone).replace(/\D/g, '') === String(from).replace(/\D/g, '');
}

/**
 * Handle template response keywords (MODIFY, CANCEL, CONFIRM, BOOK, HELP, STOP, RELATORIO).
 * Supports English, Portuguese (pt-BR), and Spanish.
 *
 * Called AFTER session management in message-processor.js so keywords that need
 * restaurant_id (RELATORIO, STOP) have a valid session object.
 *
 * @param {string} normalizedText - Uppercased, trimmed message text
 * @param {string} from - Sender's WhatsApp number
 * @param {object} [session] - Active session (optional; RELATORIO + STOP need it)
 * @returns {boolean} true if the keyword was handled, false if not a keyword
 */
async function handleKeyword(normalizedText, from, session = null, context = {}) {
  // The processor supplies a sender bound to the verified receiving account.
  // A keyword must never fall back to the default Meta number.
  const sendText = async (body, purpose = 'keyword') => {
    if (typeof context.sendText !== 'function') throw new Error('Verified keyword sender unavailable');
    const result = await context.sendText(body, purpose);
    if (!result?.entregue) throw new Error('Keyword reply was not accepted');
  };
  if (normalizedText === 'MODIFY' || normalizedText === 'MODIFICAR') {
    await sendText(
      normalizedText === 'MODIFICAR'
        ? 'Para modificar a sua reserva, por favor diga-me:\n' +
          '- O seu nome\n' +
          '- O que gostaria de alterar (data, hora ou numero de pessoas)\n\n' +
          'Por exemplo: "Sou o Joao Silva e gostaria de mudar a minha reserva para as 20h"'
        : 'To modify your reservation, please tell me:\n' +
          '- Your name\n' +
          '- What you\'d like to change (date, time, or party size)\n\n' +
          'For example: "I\'m John Smith and I\'d like to change my reservation to 8pm"'
    );
    return true;
  }

  if (normalizedText === 'CANCEL' || normalizedText === 'CANCELAR') {
    await sendText(
      normalizedText === 'CANCELAR'
        ? 'Para cancelar a sua reserva, por favor confirme com:\n' +
          '- O seu nome\n' +
          '- A data da sua reserva\n\n' +
          'Por exemplo: "Por favor cancele a minha reserva. Sou o Joao Silva, reserva para 15 de Janeiro"'
        : 'To cancel your reservation, please confirm by providing:\n' +
          '- Your name\n' +
          '- The date of your reservation\n\n' +
          'For example: "Please cancel my reservation. I\'m John Smith, reservation was for January 15"'
    );
    return true;
  }

  if (normalizedText === 'CONFIRM' || normalizedText === 'CONFIRMAR') {
    await sendText(
      normalizedText === 'CONFIRMAR'
        ? 'Otimo! A sua reserva foi confirmada. Esperamos ve-lo em breve!\n\n' +
          'Responda AJUDA se precisar de assistencia.'
        : 'Great! Your reservation has been confirmed. We look forward to seeing you!\n\n' +
          'Reply HELP if you need any assistance.'
    );
    return true;
  }

  if (normalizedText === 'BOOK' || normalizedText === 'RESERVAR') {
    await sendText(
      normalizedText === 'RESERVAR'
        ? 'Terei todo o gosto em ajuda-lo a fazer uma nova reserva!\n\n' +
          'Por favor diga-me:\n' +
          '- Qual restaurante?\n' +
          '- Data e hora?\n' +
          '- Numero de pessoas?'
        : 'I\'d be happy to help you make a new reservation!\n\n' +
          'Please tell me:\n' +
          '- Which restaurant?\n' +
          '- Date and time?\n' +
          '- Number of guests?'
    );
    return true;
  }

  if (normalizedText === 'HELP' || normalizedText === 'AJUDA' || normalizedText === 'AYUDA') {
    await sendText(
      (normalizedText === 'AJUDA')
        ? 'Posso ajuda-lo com:\n' +
          '- Fazer uma nova reserva\n' +
          '- Modificar uma reserva existente\n' +
          '- Cancelar uma reserva\n\n' +
          'Diga-me o que precisa!'
        : 'I can help you with:\n' +
          '- Making a new reservation\n' +
          '- Modifying an existing reservation\n' +
          '- Canceling a reservation\n\n' +
          'Just tell me what you need!'
    );
    return true;
  }

  // Weekly PDF report on demand
  if (normalizedText === 'RELATORIO' || normalizedText === 'REPORT') {
    try {
      // Session is now passed in from message-processor (post step-8b), so
      // restaurant_id and restaurant config are guaranteed available here.
      const restaurantId = session?.restaurant_id || session?.restaurant?.id || null;
      const language = session?.restaurant?.agent_language || 'pt-BR';
      logger.info('[RELATORIO] start', { from, restaurantId });

      // Reports contain guest and revenue data. A restaurant-bound session is
      // not proof that the sender is the manager: any guest can open one.
      if (!(await isVerifiedReportManager(restaurantId, from))) {
        await sendText(language === 'pt-BR'
          ? 'O relatório está disponível apenas para o gestor verificado deste restaurante.'
          : 'Reports are available only to this restaurant’s verified manager.');
        return true;
      }

      // Only Meta supports the verified PDF sender on this inbound path.
      if (context.provider !== 'meta' || !/^\d{5,30}$/.test(context.receiver || '')) {
        await sendText(language === 'pt-BR'
          ? 'O relatório por PDF ainda não está disponível neste canal.'
          : 'PDF reports are not available on this channel yet.');
        return true;
      }
      if (restaurantId) {
        if (typeof context.beforeReportSend !== 'function') {
          throw new Error('Durable report send reservation unavailable');
        }
        // Do not send a separate acknowledgement. It made an accepted text
        // reply look complete even when the PDF had not been generated yet.
        // The document is the only outbound send for this inbound message.
        const r = await sendWeeklyReportViaWhatsApp(restaurantId, from, language,
          undefined, { phoneNumberId: context.receiver, beforeSend: context.beforeReportSend });
        if (!r?.success) {
          if (r?.definitiveFailure) await context.releaseRejectedReport?.();
          logger.error('RELATORIO send failed', { restaurantId, error: r?.error });
          throw new Error('Report was not delivered');
        }
      } else {
        logger.warn('RELATORIO keyword: no restaurant found in session', { from });
      }
    } catch (e) {
      logger.error('RELATORIO keyword handling error:', e.message);
      throw e;
    }
    return true;
  }

  // Opt-out keywords for marketing campaigns
  if (normalizedText === 'STOP' || normalizedText === 'UNSUBSCRIBE' || normalizedText === 'PARAR') {
    try {
      const restaurantId = session?.restaurant_id || session?.restaurant?.id;
      if (restaurantId) {
        await handleOptOut(restaurantId, from);
      }
    } catch (e) {
      logger.error('Opt-out handling error:', e.message);
    }
    await sendText(
      normalizedText === 'PARAR'
        ? 'Voce foi removido da nossa lista de marketing. Nao recebera mais mensagens promocionais.'
        : 'You have been unsubscribed from marketing messages. You will no longer receive promotional messages from us.'
    );
    return true;
  }

  return false;
}

module.exports = { handleKeyword, isVerifiedReportManager };
