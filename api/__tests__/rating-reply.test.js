'use strict';

/**
 * "4 pessoas amanhã 20h" NÃO é uma avaliação 4 estrelas.
 *
 * Bug real (jul/2026): o parser de avaliação olhava só o PRIMEIRO caractere da
 * mensagem. Se fosse 1–5 e existisse uma pesquisa enviada nas últimas 48h, a
 * mensagem virava nota e a IA nunca via nada. O cliente que jantou ontem e hoje
 * escreve "4 pessoas amanhã 20h" — a frase mais comum do fluxo de reserva em
 * português — recebia "Obrigado pela avaliação! ⭐⭐⭐⭐" e perdia a reserva.
 *
 * A assimetria que define o desenho: classificar uma avaliação como conversa
 * custa uma resposta um pouco fora de tom (a IA responde e a vida segue).
 * Classificar uma reserva como avaliação custa a RESERVA, em silêncio. Então na
 * dúvida, não é nota.
 */

const { lerNota, pareceReserva } = require('../_lib/rating-reply');

describe('mensagens de reserva que começam com dígito — NENHUMA pode virar nota', () => {
  test.each([
    ['4 pessoas amanhã 20h', 'o caso que originou o bug'],
    ['2 pessoas', 'a forma mais curta'],
    ['5 lugares', 'sinônimo de pessoas'],
    ['3 adultos', 'outro substantivo de quantidade'],
    ['2 adultos e 1 criança', 'composto'],
    ['4 pessoas', 'sem data'],
    ['2 para hoje', 'quantidade + data, sem substantivo'],
    ['5 pessoas às 21h', 'quantidade + horário'],
    ['2 amanhã', 'quantidade + data'],
    ['4 mesa para sábado', 'menciona mesa'],
    ['3 pessoas, pode ser 20:30?', 'com horário no formato de dois pontos'],
    ['2 quero reservar', 'verbo de reserva explícito'],
    ['5 people tomorrow', 'inglês'],
    ['4 personas mañana', 'espanhol'],
    ['2 gente hoje a noite', 'coloquial'],
  ])('%s — %s', (texto) => {
    expect(lerNota(texto).nota).toBeNull();
    expect(pareceReserva(texto)).toBe(true);
  });

  test('número maior que 5 grudado no começo não é nota ("50 reais")', () => {
    // charAt(0) de "50 reais" é '5'. O dígito seguinte prova que 5 não é a
    // mensagem inteira — é o começo de outro número.
    expect(lerNota('50 reais').nota).toBeNull();
    expect(lerNota('12 pessoas').nota).toBeNull();
    expect(lerNota('20h').nota).toBeNull();
  });
});

describe('avaliações de verdade continuam sendo lidas', () => {
  test.each([
    ['5', 5, null],
    ['3', 3, null],
    ['5!', 5, null],
    ['4.', 4, null],
    ['  2  ', 2, null],
    ['5 - excelente', 5, 'excelente'],
    ['4, comida muito boa', 4, 'comida muito boa'],
    ['3. atendimento ok', 3, 'atendimento ok'],
    ['5 melhor rodízio da cidade', 5, 'melhor rodízio da cidade'],
    ['1 péssimo, não volto', 1, 'péssimo, não volto'],
  ])('%s → nota %i', (texto, nota, comentario) => {
    const r = lerNota(texto);
    expect(r.nota).toBe(nota);
    expect(r.comentario).toBe(comentario);
  });

  test('estrelas em emoji contam como nota', () => {
    expect(lerNota('⭐⭐⭐⭐').nota).toBe(4);
    expect(lerNota('⭐⭐⭐⭐⭐').nota).toBe(5);
    expect(lerNota('⭐').nota).toBe(1);
  });

  test('mais de 5 estrelas satura em 5 em vez de virar lixo', () => {
    expect(lerNota('⭐⭐⭐⭐⭐⭐⭐').nota).toBe(5);
  });
});

describe('nada que não seja nota vira nota', () => {
  test.each([
    ['oi', 'saudação'],
    ['', 'vazio'],
    ['   ', 'só espaço'],
    ['6', 'fora da escala'],
    ['0', 'fora da escala'],
    ['quero cancelar minha reserva', 'texto comum'],
    ['obrigado!', 'agradecimento'],
    ['9 de julho', 'começa com dígito fora da escala'],
  ])('%s — %s', (texto) => {
    expect(lerNota(texto).nota).toBeNull();
  });

  test('null e undefined não explodem', () => {
    expect(lerNota(null).nota).toBeNull();
    expect(lerNota(undefined).nota).toBeNull();
    expect(pareceReserva(null)).toBe(false);
  });
});

describe('casos de fronteira — a decisão consciente em cada um', () => {
  test('comentário com minutos NÃO é confundido com horário de reserva', () => {
    // "40 minutos" é reclamação sobre a espera, não pedido de mesa.
    expect(lerNota('1 péssimo, esperamos 40 minutos').nota).toBe(1);
  });

  test('comentário que MENCIONA horário é descartado — perder nota é barato', () => {
    // Falso negativo assumido: a mensagem vai pra IA, que responde. Melhor que
    // o inverso, que engole uma reserva.
    expect(lerNota('5 chegamos às 20h e foi ótimo').nota).toBeNull();
  });

  test('a palavra "reserva" no comentário já derruba a leitura como nota', () => {
    expect(lerNota('5 quero fazer outra reserva').nota).toBeNull();
  });
});
