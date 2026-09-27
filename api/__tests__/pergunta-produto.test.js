'use strict';

const {
  perguntaSobreProduto, objecaoJaResolvido, introDaPrevia,
} = require('../_lib/prospecting/pergunta-produto');

describe('perguntaSobreProduto — a pergunta que vira prévia', () => {
  // As duas perguntas reais que ficaram sem prévia (diagnóstico 27/09/2026),
  // mais as formas comuns do mesmo pedido.
  test.each([
    'O q é Racha',
    'o que é isso?',
    'oq é esse racha?',
    'Vcs possuem totem?',
    'vocês têm maquininha própria?',
    'Do que se trata?',
    'como funciona?',
    'me explica melhor',
    'é o quê?',
    'pode mandar sim',
    'quero ver',
    'manda aí',
  ])('dispara: %s', (t) => expect(perguntaSobreProduto(t)).toBe(true));

  test.each([
    '',
    null,
    'bom dia',
    'Olá! Nosso horário é de 12h às 23h.',
    'não tenho interesse',
    'o dono não está',
    'obrigado',
  ])('não dispara: %s', (t) => expect(perguntaSobreProduto(t)).toBe(false));
});

describe('objecaoJaResolvido — "já resolvido" brando', () => {
  test.each([
    'a gente já divide a conta na maquininha, funciona bem',
    'Já temos sistema',
    'não trabalho com QR, cliente não usa',
    'aqui cliente não usa isso',
  ])('dispara: %s', (t) => expect(objecaoJaResolvido(t)).toBe(true));

  test.each([
    'não tenho interesse',
    'pode encerrar',
    'bom dia',
  ])('não dispara (recusa seca ou nada): %s', (t) => expect(objecaoJaResolvido(t)).toBe(false));
});

describe('introDaPrevia — o texto que acompanha o link', () => {
  test('tira a pergunta de sondagem do fim', () => {
    expect(introDaPrevia('É pagar a conta pelo QR, cada um a sua parte. Como vocês fecham a conta hoje?'))
      .toBe('É pagar a conta pelo QR, cada um a sua parte.');
  });
  test('tira link escrito pelo modelo', () => {
    expect(introDaPrevia('olha aqui https://x.y/z')).toBe('olha aqui');
  });
  test('só pergunta → null (o link vai sozinho)', () => {
    expect(introDaPrevia('quer ver?')).toBeNull();
  });
});

describe('veto de privacidade (revisão da PR #162)', () => {
  test.each([
    'o que é isso? como conseguiu meu número?',
    'quem te passou meu contato? do que se trata?',
    'já tenho parceiro, pode tirar meu número',
    'a gente já divide, não me manda mais nada',
  ])('não força prévia: %s', (t) => {
    expect(perguntaSobreProduto(t)).toBe(false);
    expect(objecaoJaResolvido(t)).toBe(false);
  });
});

test('introDaPrevia tira pergunta com emoji no fim', () => {
  expect(introDaPrevia('é pelo QR da mesa. quer ver? 🙂')).toBe('é pelo QR da mesa.');
});

describe('opt-out cobre pedido de remoção do número', () => {
  const { detectarOptout } = require('../_lib/prospecting/prospect-state');
  test.each(['já tenho parceiro, pode tirar meu número', 'apaga meu contato por favor', 'não me manda mais nada'])(
    'opt-out: %s', (t) => expect(detectarOptout(t)).toBe(true));
  test.each(['o dono tirou folga hoje', 'manda mais detalhes', 'como funciona?'])(
    'não é opt-out: %s', (t) => expect(detectarOptout(t)).toBe(false));
});
