'use strict';

const { respostaDaConfirmacao } = require('../_lib/prospecting/confirmacao-indicacao');

describe('respostaDaConfirmacao — a casa respondeu se o número é mesmo da pessoa', () => {
  // As respostas REAIS do piloto de 29/09/2026 que morreram no portão.
  test.each([
    'É o responsável',
    'Entra em contato com você número',
    'Chamar esse número',
    'Bom dia, fala com esse contato!',
    'sim',
    'Isso mesmo',
    'é ele sim',
    'pode chamar',
  ])('SIM: %s', (t) => expect(respostaDaConfirmacao(t)).toBe('sim'));

  test.each([
    'não é ele',
    'número errado',
    'não',
    'foi engano, desculpa',
    'não conheço',
  ])('NÃO: %s', (t) => expect(respostaDaConfirmacao(t)).toBe('nao'));

  test.each([
    '',
    'boa tarde',
    'qual o horário de vocês?',
    'não é ele, é a Marina: 11 98888-7777',   // negação + afirmação: pro fundador
    'depois eu vejo',
  ])('ambíguo, fica com o fundador: %s', (t) => expect(respostaDaConfirmacao(t)).toBeNull());
});
