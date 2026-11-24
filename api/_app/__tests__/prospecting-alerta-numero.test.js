'use strict';

/**
 * Aviso ao fundador sobre a saúde do número.
 *
 * ORIGEM (12/08/2026). O disjuntor de falhas já existia e funciona: passou de
 * 5% de falhas reputacionais em 24h, ele DESLIGA o disparo sozinho. O que ele
 * não fazia era avisar — gravava evento e log, e o fundador só descobriria
 * abrindo o cockpit, com a prospecção parada no meio-tempo.
 *
 * Desligar sozinho sem avisar é a versão cara do "estado que ninguém observa":
 * o número é o ativo que sustenta a operação inteira.
 */

const {
  deveAvisarDoNumero, buildAlertaNumero, AVISO_TAXA, AVISO_MIN_ENVIOS, COOLDOWN_MS,
} = require('../_lib/prospecting/alerta-numero');

const AGORA = Date.parse('2026-08-12T18:00:00.000Z');
const H = 60 * 60 * 1000;

describe('quando avisar', () => {
  test('taxa acima do limiar e volume suficiente → avisa', () => {
    const r = deveAvisarDoNumero({ taxaReputacional: 0.04, total: 100, nowMs: AGORA });
    expect(r).toEqual({ avisar: true, nivel: 'aviso', motivo: 'taxa_subindo' });
  });

  test('o limiar do aviso fica ABAIXO do disjuntor, senão não daria tempo', () => {
    // O disjuntor corta em 0.05. Avisar só em 0.05 seria avisar junto da parada.
    expect(AVISO_TAXA).toBeLessThan(0.05);
    expect(deveAvisarDoNumero({ taxaReputacional: AVISO_TAXA - 0.001, total: 100, nowMs: AGORA }).avisar).toBe(false);
    expect(deveAvisarDoNumero({ taxaReputacional: AVISO_TAXA, total: 100, nowMs: AGORA }).avisar).toBe(true);
  });

  test('volume baixo não vira alarme: 1 falha em 3 envios é 33% e não diz nada', () => {
    const r = deveAvisarDoNumero({ taxaReputacional: 0.33, total: 3, nowMs: AGORA });
    expect(r).toEqual({ avisar: false, nivel: null, motivo: 'volume_baixo' });
    expect(AVISO_MIN_ENVIOS).toBeGreaterThan(3);
  });

  test('cooldown de 12h evita alerta a cada recibo', () => {
    // checkFailedRateBreaker roda a CADA falha recebida da Meta. Sem cooldown,
    // uma rajada de 20 falhas mandaria 20 mensagens.
    const r = deveAvisarDoNumero({
      taxaReputacional: 0.04, total: 100, ultimoAvisoMs: AGORA - 2 * H, nowMs: AGORA,
    });
    expect(r.motivo).toBe('cooldown');
    expect(COOLDOWN_MS).toBe(12 * H);
  });

  test('passado o cooldown, avisa de novo', () => {
    const r = deveAvisarDoNumero({
      taxaReputacional: 0.04, total: 100, ultimoAvisoMs: AGORA - 13 * H, nowMs: AGORA,
    });
    expect(r.avisar).toBe(true);
  });
});

describe('o disjuntor sempre avisa', () => {
  test('ignora cooldown: a prospecção PAROU, isso sempre vale mensagem', () => {
    const r = deveAvisarDoNumero({
      taxaReputacional: 0.09, total: 100, disjuntorDisparou: true,
      ultimoAvisoMs: AGORA - 1000, nowMs: AGORA,
    });
    expect(r).toEqual({ avisar: true, nivel: 'disjuntor', motivo: 'disparou' });
  });

  test('ignora volume mínimo: se desligou, desligou', () => {
    const r = deveAvisarDoNumero({
      taxaReputacional: 0.5, total: 6, disjuntorDisparou: true, nowMs: AGORA,
    });
    expect(r.nivel).toBe('disjuntor');
  });
});

describe('não avisa à toa', () => {
  test('taxa saudável, nada acontece', () => {
    expect(deveAvisarDoNumero({ taxaReputacional: 0.01, total: 200, nowMs: AGORA }).motivo).toBe('taxa_ok');
  });

  test('sem taxa (leitura falhou) não inventa alarme', () => {
    expect(deveAvisarDoNumero({ taxaReputacional: undefined, total: 100, nowMs: AGORA }).avisar).toBe(false);
    expect(deveAvisarDoNumero({}).avisar).toBe(false);
  });
});

describe('o texto diz o que fazer, não só o que houve', () => {
  const dados = { taxaReputacional: 0.062, total: 130, falhas: 8, capAtual: 150 };

  test('disjuntor: diz que PAROU e que voltar no mesmo volume derruba de novo', () => {
    const a = buildAlertaNumero({ ...dados, nivel: 'disjuntor' });
    expect(a.whatsapp).toMatch(/DESLIGADO/);
    expect(a.text).toMatch(/6\.2%/);
    expect(a.text).toMatch(/8 de 130/);
    expect(a.text).toMatch(/reduzir o limite di[áa]rio/i);
    expect(a.text).toContain('150');           // o cap atual, pra decidir sem abrir o painel
    expect(a.subject).toMatch(/desligado/i);
  });

  test('aviso: diz onde o disjuntor corta, pra dar noção de quanto falta', () => {
    const a = buildAlertaNumero({ ...dados, taxaReputacional: 0.035, nivel: 'aviso' });
    expect(a.whatsapp).toMatch(/3\.5%/);
    expect(a.text).toMatch(/5\.0%/);           // o limite do disjuntor
    expect(a.text).toMatch(/reduzir o limite di[áa]rio/i);
    expect(a.whatsapp).not.toMatch(/DESLIGADO/);
  });

  test('sem cap conhecido, não inventa número', () => {
    const a = buildAlertaNumero({ ...dados, capAtual: null, nivel: 'aviso' });
    expect(a.text).not.toMatch(/limite di[áa]rio est[áa] em/i);
  });

  test('os dois níveis produzem os quatro campos de envio', () => {
    for (const nivel of ['aviso', 'disjuntor']) {
      const a = buildAlertaNumero({ ...dados, nivel });
      for (const campo of ['whatsapp', 'subject', 'text', 'html']) {
        expect(typeof a[campo]).toBe('string');
        expect(a[campo].length).toBeGreaterThan(10);
      }
    }
  });
});
