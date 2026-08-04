'use strict';

/**
 * O travessão é a assinatura de texto de máquina.
 *
 * CASO REAL (04/08/2026): a mensagem de abertura do fundador saiu com dois
 * travessões — "fundador do Racha — o pagar a conta..." e "em 1 minuto — pode
 * ser?". Ninguém digita assim no WhatsApp do celular: o teclado nem tem a
 * tecla. Quem recebe não pensa "que pontuação elegante", pensa "isso é robô".
 *
 * A limpeza mora no ÚNICO ponto por onde passa todo texto livre da Olímpia
 * (sendReply), porque a maior parte das frases é gerada pelo modelo na hora —
 * corrigir só as strings do código deixaria o buraco aberto onde ele mais
 * aparece.
 */

const { semTravessao } = require('../_lib/prospecting/sem-travessao');

describe('semTravessao: tira a assinatura de robô do texto', () => {
  test('travessão entre orações vira vírgula (a mensagem que saiu de verdade)', () => {
    expect(semTravessao('fundador do Racha — o "pagar a conta na mesa por QR"'))
      .toBe('fundador do Racha, o "pagar a conta na mesa por QR"');
  });

  test('travessão no fim de pergunta some sem deixar vírgula solta', () => {
    expect(semTravessao('ver do seu celular em 1 minuto — pode ser?'))
      .toBe('ver do seu celular em 1 minuto, pode ser?');
  });

  test('depois de pontuação o travessão apenas some (nada de "!,")', () => {
    expect(semTravessao('beleza! — te mando agora')).toBe('beleza! te mando agora');
    expect(semTravessao('opa, — vamos lá')).toBe('opa, vamos lá');
  });

  test('travessão de diálogo abrindo linha é removido', () => {
    expect(semTravessao('— oi, tudo bem?')).toBe('oi, tudo bem?');
    expect(semTravessao('primeira\n— segunda')).toBe('primeira\nsegunda');
  });

  test('meia-risca (en dash) recebe o mesmo tratamento', () => {
    expect(semTravessao('teste – aqui')).toBe('teste, aqui');
  });

  test('travessão colado sem espaços também vira vírgula', () => {
    expect(semTravessao('Racha—o app')).toBe('Racha, o app');
  });

  test('travessão no fim do texto não deixa vírgula pendurada', () => {
    expect(semTravessao('deixa comigo —')).toBe('deixa comigo');
  });

  test('vários travessões na mesma frase', () => {
    expect(semTravessao('a — b — c')).toBe('a, b, c');
  });

  // O que NÃO pode ser tocado: o hífen é pontuação legítima e aparece em
  // telefone, palavra composta e link. Confundir os dois quebraria o número
  // que o lead precisa discar.
  test('hífen comum fica intacto: telefone, palavra composta, link', () => {
    const intacto = 'liga no 11 97711-7070 sobre o auto-atendimento: seatable.one/e-book';
    expect(semTravessao(intacto)).toBe(intacto);
  });

  test('texto sem travessão volta idêntico (inclusive emoji e acento)', () => {
    const s = 'opa! consigo te mostrar na prática 🙂 é rapidinho, à vontade';
    expect(semTravessao(s)).toBe(s);
  });

  test('entrada vazia ou nula devolve string vazia', () => {
    expect(semTravessao('')).toBe('');
    expect(semTravessao(null)).toBe('');
    expect(semTravessao(undefined)).toBe('');
  });

  test('não colapsa quebra de parágrafo (o multipart depende dela)', () => {
    expect(semTravessao('bolha um — final\n\nbolha dois'))
      .toBe('bolha um, final\n\nbolha dois');
  });
});
