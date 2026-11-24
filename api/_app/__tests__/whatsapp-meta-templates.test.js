'use strict';

const {
  buildMetaTemplateAttempts,
  getTemplateLanguageCandidates,
} = require('../_lib/whatsapp-meta-templates');

const diagnostic = (language, status = 'APPROVED') => ({
  name: 'seatable_connection_test', language, status,
});

describe('WhatsApp diagnostic template selection', () => {
  test.each([
    ['pt-BR', ['pt_BR', 'pt']],
    ['en', ['en', 'en_US']],
    ['es', ['es', 'es_ES']],
  ])('only considers the %s language family', (language, expected) => {
    expect(getTemplateLanguageCandidates(language)).toEqual(expected);
  });

  test('uses the one-variable diagnostic approved in the restaurant language', () => {
    expect(buildMetaTemplateAttempts({
      templates: [diagnostic('pt_BR'), diagnostic('en_US')],
      restaurantLanguage: 'pt-BR',
      restaurantName: 'Casa da Rosa',
    })).toEqual([{
      templateName: 'seatable_connection_test',
      language: 'pt_BR',
      bodyParameters: ['Casa da Rosa'],
    }]);
  });

  test.each(['en', 'es'])('does not send Portuguese to a %s restaurant', (language) => {
    expect(buildMetaTemplateAttempts({
      templates: [diagnostic('pt_BR')],
      restaurantLanguage: language,
      restaurantName: 'Casa da Rosa',
    })).toEqual([]);
  });

  test('never substitutes an approved survey, promotion, or unapproved diagnostic', () => {
    expect(buildMetaTemplateAttempts({
      templates: [
        { name: 'seatable_feedback_request', language: 'pt_BR', status: 'APPROVED' },
        { name: 'seatable_promotion', language: 'pt_BR', status: 'APPROVED' },
        diagnostic('pt_BR', 'PENDING'),
      ],
      restaurantLanguage: 'pt-BR',
      restaurantName: 'Casa da Rosa',
    })).toEqual([]);
  });

  test('does not guess when the account returns no approved templates', () => {
    expect(buildMetaTemplateAttempts({ templates: [], restaurantLanguage: 'pt-BR', restaurantName: 'Casa' })).toEqual([]);
  });
});
