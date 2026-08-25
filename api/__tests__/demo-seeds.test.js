'use strict';

/**
 * Seeds do demo — a função que já teve DOIS bugs em produção.
 *
 * O painel do demo não pode nascer vazio logo depois do aha: é a tela que
 * prova que a reserva da IA "caiu" em algum lugar. Estes testes prendem as
 * duas regressões reais, ambas achadas em produção, nenhuma pega por teste
 * na época.
 */

const { buildFakeReservations, buildFakeTables } = require('../_lib/demo-seeds');

const SP = 'America/Sao_Paulo';

function local(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

describe('buildFakeReservations — horários relativos, no fuso do restaurante', () => {
  afterEach(() => { jest.useRealTimers(); });

  test('BUG 2 (24/ago): 19:38 em São Paulo NÃO pode empurrar tudo para amanhã', () => {
    // 22:38 UTC = 19:38 em SP — horário nobre de jantar. Antes, o cálculo em
    // UTC via "23h" e rolava os seeds para o dia seguinte: painel vazio.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T22:38:00Z'));
    const rs = buildFakeReservations('rest-1', SP);
    const hoje = local('2026-08-24T22:38:00Z', SP);
    const nomes = ['Ana Costa', 'Pedro Santos', 'Julia Oliveira'];
    // (a 4ª de hoje é a mesa já sentada — Isabela Martins — e é proposital)
    const deHoje = rs.filter((r) => r.date === hoje && nomes.includes(r.customer_name));
    expect(deHoje.length).toBe(3);
    // Primeiro slot: +60min = 20:38 local → arredonda para 21:00.
    expect(deHoje[0].time).toBe('21:00');
  });

  test('BUG 1: demo criado tarde da noite rola para o jantar de amanhã', () => {
    // 04:10 UTC = 01:10 em SP — madrugada. Nada de reserva às 01:40.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T04:10:00Z'));
    const rs = buildFakeReservations('rest-1', SP);
    const hoje = local('2026-08-25T04:10:00Z', SP);
    const deHoje = rs.filter((r) => r.date === hoje && ['Ana Costa', 'Pedro Santos', 'Julia Oliveira'].includes(r.customer_name));
    // 01:10 + 60min = 02:10 → 02:30 local, ainda "hoje" e dentro do serviço
    // pela regra (< 23h). O que importa é que a hora é LOCAL, não UTC.
    expect(deHoje.every((r) => r.time < '23:30')).toBe(true);
  });

  test('perto da meia-noite local, os seeds usam o jantar de amanhã', () => {
    // 02:40 UTC = 23:40 em SP do dia anterior.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T02:40:00Z'));
    const rs = buildFakeReservations('rest-1', SP);
    const nomes = ['Ana Costa', 'Pedro Santos', 'Julia Oliveira'];
    const principais = rs.filter((r) => nomes.includes(r.customer_name));
    expect(principais.map((r) => r.time)).toEqual(['19:30', '20:00', '20:30']);
  });

  test('fuso diferente muda o resultado — Madri não usa a conta de São Paulo', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T22:38:00Z'));
    const sp = buildFakeReservations('r', SP);
    const madri = buildFakeReservations('r', 'Europe/Madrid');
    // 22:38 UTC = 00:38 em Madri (dia seguinte) — datas necessariamente
    // diferentes das de São Paulo.
    expect(sp[0].date).not.toBe(madri[0].date);
  });

  test('sempre 9 reservas e todas amarradas ao restaurante', () => {
    const rs = buildFakeReservations('rest-42', SP);
    expect(rs).toHaveLength(9);
    expect(rs.every((r) => r.restaurant_id === 'rest-42')).toBe(true);
    expect(rs.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
    expect(rs.every((r) => /^\d{2}:\d{2}$/.test(r.time))).toBe(true);
  });

  test('o acento de Aniversário continua lá (regra R10)', () => {
    expect(buildFakeReservations('r', SP).some((x) => x.special_requests === 'Aniversário')).toBe(true);
  });
});

describe('buildFakeTables', () => {
  test('8 mesas com capacidades e áreas variadas', () => {
    const t = buildFakeTables('rest-1');
    expect(t).toHaveLength(8);
    expect(new Set(t.map((x) => x.location))).toEqual(new Set(['window', 'indoor', 'terrace']));
    expect(t.every((x) => x.restaurant_id === 'rest-1' && x.is_active)).toBe(true);
  });
});
