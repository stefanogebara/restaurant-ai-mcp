'use strict';

/**
 * O vigia de cron precisa cobrir o motor da própria agente.
 *
 * ACHADO (01/08/2026): `/api/cron/health` avalia 23 jobs e o cron `health-alert`
 * manda WhatsApp quando algum envelhece — mas NENHUM cron de prospecção estava
 * registrado. Eles gravam em `cron_runs` faithfully (prospect-flush: 114
 * execuções em 3 dias) e ninguém olhava. Justamente os que precisavam: o
 * incidente do Coco Bambu foi um lead 15h sem resposta com o painel verde.
 *
 * A parte sutil é a TOLERÂNCIA. getStatus marca stale em 2× o intervalo, mas
 * vários jobs não rodam 24/7:
 *   prospect-flush  de 15 em 15 min, só das 12h às 22h UTC
 *                   → folga legítima de 14h toda madrugada
 *   prospect-nudge  de hora em hora, 13h-21h UTC, só seg-sex
 *                   → folga de 64h entre sexta e segunda
 * Declarar o intervalo nominal (15min, 60min) faria o alerta gritar todo dia de
 * madrugada e todo fim de semana — e alarme que grita à toa é alarme desligado.
 * Então o intervalo declarado aqui é "maior folga legítima ÷ 2".
 */

const { CRON_JOBS, getStatus } = require('../cron/health');

const acha = (nome) => CRON_JOBS.find((j) => j.name === nome);
const HORA = 60;

describe('registro do vigia cobre a prospecção', () => {
  test.each([
    'prospect-flush',
    'prospect-nudge',
    'prospect-handoff-digest',
    'prospect-score-outcomes',
  ])('%s está registrado', (nome) => {
    expect(acha(nome)).toBeDefined();
  });
});

/** Simula "agora - horas" e pergunta o status. */
function statusApos(horas, intervalMinutes) {
  return getStatus(new Date(Date.now() - horas * 3600 * 1000).toISOString(), intervalMinutes);
}

describe('tolerância respeita a folga legítima de cada agendamento', () => {
  test('prospect-flush: 14h de madrugada é saudável, 20h parado é stale', () => {
    const { intervalMinutes } = acha('prospect-flush');
    // Roda das 12h às 22h UTC. A maior folga honesta é 22:00 -> 12:00 do dia seguinte.
    expect(statusApos(14, intervalMinutes)).toBe('healthy');
    expect(statusApos(20, intervalMinutes)).toBe('stale');
  });

  test('prospect-nudge: fim de semana inteiro é saudável, 4 dias é stale', () => {
    const { intervalMinutes } = acha('prospect-nudge');
    // Roda 13-21 UTC seg-sex. Sexta 21:40 → segunda 13:40 = 64h.
    expect(statusApos(64, intervalMinutes)).toBe('healthy');
    expect(statusApos(96, intervalMinutes)).toBe('stale');
  });

  test('os diários seguem a convenção de 1440 já usada pelos outros', () => {
    expect(acha('prospect-handoff-digest').intervalMinutes).toBe(24 * HORA);
    expect(acha('prospect-score-outcomes').intervalMinutes).toBe(24 * HORA);
  });

  test('nenhum job novo tolera mais de 4 dias — vigia frouxo demais não vigia', () => {
    for (const j of CRON_JOBS) {
      // 10080 = semanal, e os semanais são legítimos; o resto tem que ser menor.
      if (j.intervalMinutes >= 10080) continue;
      expect(j.intervalMinutes * 2).toBeLessThanOrEqual(4 * 24 * HORA);
    }
  });
});

describe('o que já funcionava não pode quebrar', () => {
  test('jobs antigos continuam registrados', () => {
    for (const n of ['check-late-reservations', 'send-campaigns', 'health-alert']) {
      expect(acha(n)).toBeDefined();
    }
  });

  test('nenhum nome duplicado (duplicata mascara um job morto)', () => {
    const nomes = CRON_JOBS.map((j) => j.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  test('todo job tem intervalo positivo', () => {
    for (const j of CRON_JOBS) expect(j.intervalMinutes).toBeGreaterThan(0);
  });
});
