'use strict';

/**
 * Nudge não fala com robô — e, na dúvida, FALA.
 *
 * Eval-001 (31/07): 8 de 25 threads eram nudge de "retomar a conversa" contra um
 * autoatendimento. A instrução do nudge presume um papo que nunca existiu
 * ("como foi o movimento de ontem?" pra quem só mandou cardápio e link de
 * iFood). Estado 'recusou'/'porteiro' já é filtrado pelo selectNudgeStates; o
 * que passava era lead em 'conversando' cuja thread inteira é máquina.
 *
 * A assimetria de custo manda no desenho: não nudgear um dono real perde um
 * lead; nudgear um robô gasta tokens. Por isso o gate só bloqueia com `true`
 * EXPLÍCITO — o chamador só afirma isso tendo visto a thread INTEIRA (o cron
 * compara hist.length com HIST_LIMITE). `null` ("não sei") sempre libera.
 */

const {
  elegivelParaNudge, NUDGE_JANELA_MS, WHATSAPP_JANELA_MS,
} = require('../_lib/prospecting/prospect-nudge');

const AGORA = Date.UTC(2026, 6, 31, 15, 0, 0);
// Silêncio dentro da janela de 24h da Meta e acima do mínimo de nudge.
const ULTIMO_INBOUND = AGORA - Math.max(NUDGE_JANELA_MS + 60_000, 1);

const base = (extra = {}) => ({
  lastMsg: { direcao: 'out' },
  lastInboundAtMs: ULTIMO_INBOUND,
  nudgeEmMs: null,
  tersosSeguidos: 0,
  nudgeCount: 0,
  nowMs: AGORA,
  ...extra,
});

describe('pré-condição: sem o gate, este lead seria nudgeado', () => {
  test('cenário base é elegível', () => {
    // Sem esta âncora, os testes abaixo poderiam passar por outro motivo
    // (silêncio curto, fora da janela) e não pelo gate novo.
    expect(ULTIMO_INBOUND).toBeGreaterThan(AGORA - WHATSAPP_JANELA_MS);
    expect(elegivelParaNudge(base())).toEqual({ eligible: true, reason: 'ok' });
  });
});

describe('gate de thread sem humano', () => {
  test('thread comprovadamente só-máquina NÃO recebe nudge', () => {
    const r = elegivelParaNudge(base({ somenteMaquina: true }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('sem_humano_na_thread');
  });

  test('thread com humano recebe normalmente', () => {
    expect(elegivelParaNudge(base({ somenteMaquina: false })).eligible).toBe(true);
  });

  test('NA DÚVIDA (null) o nudge SAI — não bloquear é o lado barato do erro', () => {
    // É o caso de histórico truncado: pode ter humano lá atrás que não vimos.
    expect(elegivelParaNudge(base({ somenteMaquina: null })).eligible).toBe(true);
  });

  test('parâmetro ausente se comporta como null (compatibilidade)', () => {
    expect(elegivelParaNudge(base()).eligible).toBe(true);
  });

  test('só bloqueia com booleano true — valores truthy frouxos não bloqueiam', () => {
    // Guarda contra o chamador passar algo como 'sim'/1 e mudar o
    // comportamento sem querer: o gate exige o tipo certo.
    for (const v of ['true', 1, {}, []]) {
      expect(elegivelParaNudge(base({ somenteMaquina: v })).eligible).toBe(true);
    }
  });
});

describe('as guardas antigas continuam mandando primeiro', () => {
  test('inbound pendente barra antes do gate novo', () => {
    const r = elegivelParaNudge(base({ lastMsg: { direcao: 'in' }, somenteMaquina: true }));
    expect(r.reason).toBe('inbound_pendente');
  });

  test('silêncio curto barra antes do gate novo', () => {
    const r = elegivelParaNudge(base({ lastInboundAtMs: AGORA - 1000, somenteMaquina: true }));
    expect(r.reason).toBe('silencio_curto');
  });

  test('fora da janela de 24h barra antes do gate novo', () => {
    const r = elegivelParaNudge(base({
      lastInboundAtMs: AGORA - WHATSAPP_JANELA_MS - 1000, somenteMaquina: true,
    }));
    expect(r.reason).toBe('fora_janela_24h');
  });
});
