'use strict';

const { respostaDaConfirmacao } = require('../_lib/prospecting/confirmacao-indicacao');

describe('respostaDaConfirmacao — lista fechada: só confirmação inequívoca é sim', () => {
  // Respostas reais do piloto de 29/09/2026 que morreram no portão.
  test.each([
    'É o responsável',
    'Chamar esse número',
    'Bom dia, fala com esse contato!',
    'sim',
    'Isso mesmo',
    'é ele sim',
    'pode chamar',
    'Sim 👍',
  ])('SIM: %s', (t) => expect(respostaDaConfirmacao(t)).toBe('sim'));

  test.each([
    'não é ele',
    'número errado',
    'não',
    'foi engano',
    'não conheço',
  ])('NÃO: %s', (t) => expect(respostaDaConfirmacao(t)).toBe('nao'));

  // Tudo o que as duas revisões de segurança acharam lendo como sim — e mais.
  // Na dúvida, fica com o fundador (null).
  test.each([
    '', 'boa tarde', 'qual o horário de vocês?', 'depois eu vejo',
    'não é ele, é a Marina: 11 98888-7777',
    'não pode chamar', 'não liga pra ele', 'não fala com ele, fala comigo', 'chama ele não',
    'Pode chamar não', 'não entra em contato com ele', 'isso eu não sei',
    'certo, vou perguntar pra ele', 'sim, mas ele não quer',
    'n pode chamar', 'ñ pode chamar', 'num liga pra ele', 'jamais liga pra ele', 'nada de ligar pra ele',
    'chama ela n', 'não pode chamar', 'naõ pode chamar', 'nâo pode chamar',
    'é ele?', 'acho que é ele', 'pode chamar? acho que é', 'pode chamar mas ele saiu',
    'é ele sim, mas melhor falar comigo', 'é ele, mas espera', 'entra em contato comigo',
    'manda esse link aí', 'ele saiu, é ela agora',
    // A frase real truncada do piloto: sem sentido claro, vai pro fundador.
    'Entra em contato com você número',
  ])('fica com o fundador: %s', (t) => expect(respostaDaConfirmacao(t)).toBeNull());
});
