'use strict';

/**
 * A agenda do cron de disparo precisa caber DENTRO da janela do sequencer.
 *
 * São duas fontes de verdade sobre horário e elas não se conhecem: o cron do
 * vercel.json decide QUANDO a função é chamada, e dentroDaJanelaDisparo decide
 * se ela pode enviar. Se a agenda vazar para fora da janela, a execução extra
 * roda todo dia útil só para descobrir que não pode fazer nada.
 *
 * ACHADO (05/08/2026): a primeira versão agendava 13-20 UTC. A janela termina
 * às 17h BRT, então o slot das 20:10 UTC (17:10 BRT) caía fora. Nada quebra,
 * ninguém percebe: só uma invocação queimada por dia e um "rodou, enviou 0" no
 * log que parece defeito e não é.
 *
 * O oposto também é defeito e este teste pega: agenda que cobre MENOS que a
 * janela desperdiça horário bom de envio em silêncio.
 */

const fs = require('fs');
const path = require('path');
const { dentroDaJanelaDisparo } = require('../_lib/prospecting/prospect-hours');

const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
const entrada = (vercel.crons || []).find((c) => c.path.startsWith('/api/cron/') && c.path.includes('job=prospect-dispatch'));

/** "10 13-19 * * 1-5" → [13,14,...,19] */
function horasDe(schedule) {
  const campoHora = String(schedule).split(/\s+/)[1];
  const [de, ate] = campoHora.split('-').map(Number);
  return Array.from({ length: (ate ?? de) - de + 1 }, (_, i) => de + i);
}

// Quarta-feira, dia útil qualquer: o que se testa aqui é a HORA.
const emQuarta = (hUtc) => `2026-08-05T${String(hUtc).padStart(2, '0')}:10:00.000Z`;

describe('agenda do disparo x janela do sequencer', () => {
  test('o cron está registrado no vercel.json', () => {
    expect(entrada).toBeDefined();
  });

  test('toda hora agendada cai DENTRO da janela de disparo', () => {
    const fora = horasDe(entrada.schedule).filter((h) => !dentroDaJanelaDisparo(emQuarta(h)));
    expect(fora).toEqual([]);
  });

  test('a agenda não deixa hora boa de fora (a hora seguinte ao fim já é fora da janela)', () => {
    const horas = horasDe(entrada.schedule);
    const depoisDoFim = Math.max(...horas) + 1;
    expect(dentroDaJanelaDisparo(emQuarta(depoisDoFim))).toBe(false);
  });

  test('roda só em dia útil (abordagem fria no fim de semana queima o número)', () => {
    expect(String(entrada.schedule).trim().split(/\s+/)[4]).toBe('1-5');
  });
});
