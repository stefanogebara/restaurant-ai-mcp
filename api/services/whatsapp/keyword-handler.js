// Template response keyword handling for WhatsApp

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const { getSessionByPhone } = require('../../_lib/whatsapp-sessions');
const { handleOptOut } = require('../campaignService');
const { sendWhatsAppMessage } = require('./message-sender');
const { sendWeeklyReportViaWhatsApp } = require('../pdfReportService');

/**
 * Handle template response keywords (MODIFY, CANCEL, CONFIRM, BOOK, HELP, STOP).
 * Supports English, Portuguese (pt-BR), and Spanish.
 *
 * @param {string} normalizedText - Uppercased, trimmed message text
 * @param {string} from - Sender's WhatsApp number
 * @returns {boolean} true if the keyword was handled, false if not a keyword
 */
async function handleKeyword(normalizedText, from) {
  if (normalizedText === 'MODIFY' || normalizedText === 'MODIFICAR') {
    await sendWhatsAppMessage(from,
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
    await sendWhatsAppMessage(from,
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
    await sendWhatsAppMessage(from,
      normalizedText === 'CONFIRMAR'
        ? 'Otimo! A sua reserva foi confirmada. Esperamos ve-lo em breve!\n\n' +
          'Responda AJUDA se precisar de assistencia.'
        : 'Great! Your reservation has been confirmed. We look forward to seeing you!\n\n' +
          'Reply HELP if you need any assistance.'
    );
    return true;
  }

  if (normalizedText === 'BOOK' || normalizedText === 'RESERVAR') {
    await sendWhatsAppMessage(from,
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
    await sendWhatsAppMessage(from,
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
      const session = await getSessionByPhone(from);
      const restaurantId = session?.restaurant?.id;
      const language = session?.restaurant?.agent_language || 'pt-BR';

      // Acknowledge immediately, send report asynchronously
      await sendWhatsAppMessage(from,
        language === 'pt-BR'
          ? 'Gerando seu relatório semanal... 📊 Você receberá em instantes.'
          : 'Generating your weekly report... 📊 You will receive it in a moment.'
      );

      if (restaurantId) {
        // AWAITED. Fire-and-forget doesn't work on Vercel — the Lambda dies
        // the moment the outer webhook sends 200 OK, killing this promise.
        // Previously: user saw "Gerando..." but never received the PDF.
        // PDF generation (Gotenberg HTML→PDF + storage upload + WhatsApp send)
        // typically takes 8-15s, well within the whatsapp-webhook's 120s
        // maxDuration. Meta webhook-retry dedup prevents double-processing.
        try {
          const r = await sendWeeklyReportViaWhatsApp(restaurantId, from, language);
          if (!r?.success) {
            logger.error('RELATORIO send failed', { restaurantId, error: r?.error });
            await sendWhatsAppMessage(from,
              language === 'pt-BR'
                ? 'Desculpe, não consegui gerar o relatório agora. Tente novamente em alguns minutos.'
                : 'Sorry, I couldn\'t generate the report right now. Please try again in a few minutes.'
            ).catch(() => {});
          }
        } catch (err) {
          logger.error('RELATORIO exception', { restaurantId, error: err.message });
        }
      } else {
        logger.warn('RELATORIO keyword: no restaurant found in session', { from });
      }
    } catch (e) {
      logger.error('RELATORIO keyword handling error:', e.message);
    }
    return true;
  }

  // Opt-out keywords for marketing campaigns
  if (normalizedText === 'STOP' || normalizedText === 'UNSUBSCRIBE' || normalizedText === 'PARAR') {
    // Opt out from all restaurants (best-effort per-restaurant scoping)
    try {
      const session = await getSessionByPhone(from);
      const restaurantId = session?.restaurant?.id;
      if (restaurantId) {
        await handleOptOut(restaurantId, from);
      }
    } catch (e) {
      logger.error('Opt-out handling error:', e.message);
    }
    await sendWhatsAppMessage(from,
      normalizedText === 'PARAR'
        ? 'Voce foi removido da nossa lista de marketing. Nao recebera mais mensagens promocionais.'
        : 'You have been unsubscribed from marketing messages. You will no longer receive promotional messages from us.'
    );
    return true;
  }

  return false;
}

module.exports = { handleKeyword };
