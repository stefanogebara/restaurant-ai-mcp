'use strict';

/**
 * Sábado é dia de trabalho para o ICP — a agente precisa RESPONDER nele.
 *
 * ACHADO (01/08/2026, ao investigar por que um inbound de sexta ficou 2 dias
 * sem resposta): a janela de resposta era seg-sex 9-19. Consequência real: um
 * dono de restaurante que responde a abordagem fria num sábado só é atendido
 * ~22h depois — o `reply_apos` cai no clamp de 22h (min entre "próxima abertura
 * = segunda 9h" e "last_in + 22h"). Para venda fria isso é o lead morto.
 *
 * O ICP é restaurante: trabalha sábado, e muitos FECHAM segunda. Herdar a
 * janela de escritório B2B era o pressuposto errado.
 *
 * O que NÃO muda: o DISPARO de intro fria continua seg-sex. Alargar a resposta
 * (reagir a quem falou com a gente) é diferente de alargar a abordagem fria
 * (interromper quem não pediu). São duas políticas e continuam separadas.
 */

const HORAS = require('../_lib/prospecting/prospect-hours');
const { dentroDoHorario, dentroDaJanelaDisparo, decisaoForaDeHorario, proximaAbertura } = HORAS;

// BRT = UTC-3 sem horário de verão. 2026-08-01 é sábado.
const SAB_11H = new Date('2026-08-01T14:00:00Z').getTime(); // sáb 11:00 BRT
const SAB_20H = new Date('2026-08-01T23:00:00Z').getTime(); // sáb 20:00 BRT
const DOM_11H = new Date('2026-08-02T14:00:00Z').getTime(); // dom 11:00 BRT
const SEX_20H = new Date('2026-07-31T23:00:00Z').getTime(); // sex 20:00 BRT
const SEX_1950 = new Date('2026-07-31T22:50:00Z').getTime(); // sex 19:50 BRT

afterEach(() => {
  delete process.env.PROSPECTING_REPLY_DAYS;
});

describe('janela de RESPOSTA', () => {
  test('sábado em horário comercial é janela de resposta', () => {
    expect(dentroDoHorario(SAB_11H)).toBe(true);
  });

  test('sábado fora do horário continua fora (não virou 24/7)', () => {
    expect(dentroDoHorario(SAB_20H)).toBe(false);
  });

  test('domingo continua fora — o dia de folga foi preservado de propósito', () => {
    expect(dentroDoHorario(DOM_11H)).toBe(false);
  });

  test('dia útil segue valendo (o que já funcionava não pode quebrar)', () => {
    expect(dentroDoHorario(new Date('2026-07-31T14:00:00Z').getTime())).toBe(true);
  });
});

describe('janela de DISPARO fria — continua seg-sex', () => {
  test('sábado NÃO é janela de disparo, mesmo dentro de 10-17', () => {
    expect(dentroDaJanelaDisparo(SAB_11H)).toBe(false);
  });

  test('dia útil dentro de 10-17 continua sendo', () => {
    expect(dentroDaJanelaDisparo(new Date('2026-07-31T14:00:00Z').getTime())).toBe(true);
  });

  test('PROSPECTING_REPLY_DAYS não vaza para o disparo', () => {
    // Um operador afrouxando a RESPOSTA não pode, sem perceber, passar a mandar
    // abordagem fria no domingo.
    process.env.PROSPECTING_REPLY_DAYS = '0,1,2,3,4,5,6';
    expect(dentroDoHorario(DOM_11H)).toBe(true);
    expect(dentroDaJanelaDisparo(DOM_11H)).toBe(false);
  });
});

describe('adiamento de inbound de sexta à noite', () => {
  test('cai no sábado de manhã, não na segunda', () => {
    const d = decisaoForaDeHorario(SEX_20H, SEX_1950);
    expect(d.acao).toBe('adiar');
    // sáb 09:00 BRT = 12:00Z — antes era segunda, então o clamp de 22h mandava
    // a resposta para sábado 17:50 BRT (quase no fim da janela de 24h da Meta).
    expect(d.replyApos).toBe('2026-08-01T12:00:00.000Z');
  });

  test('próxima abertura a partir de sexta à noite é sábado', () => {
    expect(proximaAbertura(SEX_20H)).toBe('2026-08-01T12:00:00.000Z');
  });

  test('a partir de sábado à noite a próxima abertura é segunda (domingo pulado)', () => {
    expect(proximaAbertura(SAB_20H)).toBe('2026-08-03T12:00:00.000Z');
  });
});

describe('override por env', () => {
  test('PROSPECTING_REPLY_DAYS restringe a resposta de volta a dias úteis', () => {
    process.env.PROSPECTING_REPLY_DAYS = '1,2,3,4,5';
    expect(dentroDoHorario(SAB_11H)).toBe(false);
  });

  test('valor inválido cai no padrão em vez de emudecer a agente', () => {
    // Um typo aqui silenciaria a agente em todos os dias — falhar fechado seria
    // o pior modo de falha possível para este parâmetro.
    process.env.PROSPECTING_REPLY_DAYS = 'sábado, talvez';
    expect(dentroDoHorario(SAB_11H)).toBe(true);
    expect(dentroDoHorario(new Date('2026-07-31T14:00:00Z').getTime())).toBe(true);
  });
});
