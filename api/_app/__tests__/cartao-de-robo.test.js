'use strict';

const { cartaoDeRobo } = require('../_lib/prospecting/cartao-de-robo');

const bot = { direcao: 'in', tipo: 'text', corpo: 'Olá! Obrigado por entrar em contato. Nosso horário de funcionamento é de terça a domingo, das 12h às 23h.' };
const cartao = { direcao: 'in', tipo: 'contacts', corpo: '[Contato compartilhado: +5511900000000 | Comercial]' };
const gente = { direcao: 'in', tipo: 'text', corpo: 'oi, pode mandar pra ela sim, ela cuida disso' };
const nosso = { direcao: 'out', tipo: 'text', corpo: 'oi! quem cuida de parcerias por aí?' };

describe('cartaoDeRobo', () => {
  test('robô e depois cartão: veio de robô', () => {
    expect(cartaoDeRobo([bot, nosso, cartao])).toBe(true);
  });
  test('um humano apareceu antes: a pergunta de confirmação vale', () => {
    expect(cartaoDeRobo([bot, gente, nosso, cartao])).toBe(false);
  });
  test('só o cartão, sem nada antes: não dá pra afirmar que é robô', () => {
    expect(cartaoDeRobo([nosso, cartao])).toBe(false);
  });
  test('último inbound não é cartão: não se aplica', () => {
    expect(cartaoDeRobo([bot, nosso, bot])).toBe(false);
  });
});
