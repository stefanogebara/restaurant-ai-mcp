'use strict';

const { buildVoiceConfirmation } = require('../_lib/reservation-validator');
const details = {
  customer_name: 'Teste Âmbar 110', party_size: 3, date: '2026-11-11', time: '20:00',
};
const languages = [
  {
    language: 'pt-BR', confirmed: /reserva.*confirmada/i, party: '3 pessoas', date: '11 de novembro de 2026', time: '20:00',
    accepted: 'Solicitamos o envio dos detalhes pelo WhatsApp. Se não chegarem, sua reserva continua válida. Até logo!',
    failed: 'Não consegui confirmar o envio pelo WhatsApp agora. Sua reserva está confirmada; guarde o dia e horário. Até logo!',
  },
  {
    language: 'en', confirmed: /reservation.*confirmed/i, party: 'party of 3', date: 'November 11, 2026', time: '8:00 PM',
    accepted: 'We requested your details by WhatsApp. If they do not arrive, your reservation is still confirmed. See you soon!',
    failed: 'I could not confirm the WhatsApp message was sent. Your reservation is confirmed; please keep the date and time. See you soon!',
  },
  {
    language: 'es', confirmed: /reserva.*confirmada/i, party: '3 personas', date: '11 de noviembre de 2026', time: '20:00',
    accepted: 'Solicitamos el envío de los detalles por WhatsApp. Si no llegan, su reserva sigue confirmada. ¡Hasta pronto!',
    failed: 'No pude confirmar el envío por WhatsApp. Su reserva está confirmada; guarde la fecha y la hora. ¡Hasta pronto!',
  },
];

function expectBookingFacts(message, copy) {
  expect(message).toMatch(copy.confirmed);
  for (const fact of ['Sandbox', details.customer_name, copy.party, copy.date, copy.time]) {
    expect(message).toContain(fact);
  }
}

describe.each(languages)('$language voice confirmation', copy => {
  test.each([false, true])('disabled notices omit all WhatsApp claims even with acceptance=%s', whatsappAccepted => {
    const message = buildVoiceConfirmation(details, {
      restaurant_name: 'Sandbox', agent_language: copy.language, whatsapp_enabled: false,
    }, 'RES-110', { whatsappAccepted });

    expectBookingFacts(message, copy);
    expect(message).not.toMatch(/WhatsApp|não consegui|could not|no pude/i);
    expect(message).toBe(message.trim());
  });

  describe.each([['enabled', true], ['legacy', undefined]])('%s notices', (_label, enabled) => {
    test.each([false, true])('preserve the actual acceptance=%s wording', whatsappAccepted => {
      const restaurant = { restaurant_name: 'Sandbox', agent_language: copy.language };
      if (enabled !== undefined) restaurant.whatsapp_enabled = enabled;
      const message = buildVoiceConfirmation(details, restaurant, 'RES-110', { whatsappAccepted });

      expectBookingFacts(message, copy);
      expect(message).toContain(whatsappAccepted ? copy.accepted : copy.failed);
      expect(message).not.toContain(whatsappAccepted ? copy.failed : copy.accepted);
    });
  });
});
