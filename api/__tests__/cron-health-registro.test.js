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

const fs = require('fs');
const path = require('path');
const { CRON_JOBS, getStatus } = require('../cron/health');

const acha = (nome) => CRON_JOBS.find((j) => j.name === nome);
const HORA = 60;

const CRONS_PROSPECCAO = [
  'prospect-flush',
  'prospect-nudge',
  'prospect-handoff-digest',
  'prospect-score-outcomes',
  'prospect-enrich',
];

describe('registro do vigia cobre a prospecção', () => {
  test.each(CRONS_PROSPECCAO)('%s está registrado', (nome) => {
    expect(acha(nome)).toBeDefined();
  });
});

describe('registro sem batimento é decoração', () => {
  /**
   * A armadilha que prospect-enrich caiu: estava agendado na vercel.json e
   * rodava, mas não chamava logCronRun. Registrado assim ele ficaria em
   * `never_run` para sempre — e `never_run` NÃO dispara alerta (health-alert.js
   * só olha `stale` e `errors_14d`). Watchdog silencioso é pior que nenhum,
   * porque parece cobertura.
   */
  test.each(CRONS_PROSPECCAO)('%s grava em cron_runs com o nome que registrou', (nome) => {
    const arquivo = path.join(__dirname, '..', 'cron', `${nome}.js`);
    const src = fs.readFileSync(arquivo, 'utf8');
    expect(src).toMatch(new RegExp(`logCron(Run|Error)\\(\\s*['"]${nome}['"]`));
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

  test('prospect-enrich roda 24/7, então tolera pouco: 1h ok, 3h stale', () => {
    const { intervalMinutes } = acha('prospect-enrich');
    expect(statusApos(1, intervalMinutes)).toBe('healthy');
    expect(statusApos(3, intervalMinutes)).toBe('stale');
  });

  test('todo job de prospecção cabe na janela de 14 dias que o vigia consulta', () => {
    // A varredura larga é capada em 1000 linhas pelo servidor (~64h hoje, e
    // encolhendo). Um job cujo gap legítimo passe disso sumiria do lastRunMap e
    // sairia como never_run — que não alerta. Foi o que pegou prospect-nudge:
    // 70h de tolerância contra uma janela de 64,8h, ou seja, jamais poderia ser
    // reportado stale. Com a repescagem por job, o limite real voltou a ser os
    // 14 dias da consulta; este teste guarda essa fronteira.
    for (const nome of CRONS_PROSPECCAO) {
      expect(acha(nome).intervalMinutes * 2).toBeLessThan(14 * 24 * HORA);
    }
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
