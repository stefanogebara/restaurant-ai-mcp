'use strict';

/**
 * O filtro de "próximas reservas" — o gêmeo de LEITURA do bug de fuso do #76.
 *
 * Em produção (25/ago) os seeds do demo nasciam certos no banco — 21:30,
 * 22:00, 22:30 de hoje, no fuso de São Paulo — e o painel abria vazio mesmo
 * assim. A causa era esta função: `api/demo/index.js` a chamava SEM o fuso, e
 * o fallback comparava os horários (que estão na parede do restaurante)
 * contra o relógio do servidor. A lambda roda em UTC, então às 20:27 em São
 * Paulo o filtro virava `time >= 23:27` e descartava as quatro.
 *
 * A função não tinha teste nenhum.
 */

var mockOr = jest.fn();
var mockOrder2 = jest.fn().mockResolvedValue({ data: [], error: null });
var mockOrder1 = jest.fn(() => ({ order: mockOrder2 }));
var mockIn = jest.fn(() => ({ order: mockOrder1 }));
var mockEq = jest.fn(() => ({ or: mockOr }));
var mockSelect = jest.fn(() => ({ eq: mockEq }));

jest.mock('../_lib/db/clients', () => ({
  supabase: { from: jest.fn(() => ({ select: mockSelect })) },
  handleSupabaseResponse: jest.fn((data) => ({ success: true, reservations: data || [] })),
}));
jest.mock('../_lib/secure-id', () => ({ generateSecureReservationId: () => 'r-1' }));
jest.mock('../_lib/validation', () => ({ sanitizeSearchQuery: (s) => s }));

const { getUpcomingReservations } = require('../_lib/db/reservations');

/** Devolve a string passada ao `.or()` — é ali que mora a regra. */
function filtroConstruido() {
  return mockOr.mock.calls[0][0];
}

describe('getUpcomingReservations — o filtro de "hoje e daqui pra frente"', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOr.mockReturnValue({ in: mockIn });
  });

  test('com fuso: a hora de corte é a do RESTAURANTE, não a do servidor', async () => {
    // 2026-08-25T23:27Z = 20:27 em São Paulo.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T23:27:00Z'));
    try {
      await getUpcomingReservations('r-1', 'America/Sao_Paulo');
      const filtro = filtroConstruido();
      expect(filtro).toContain('date.eq.2026-08-25');
      expect(filtro).toContain('time.gte.20:27');
      // 23:27 é o relógio da lambda. Se aparecer aqui, as reservas da noite
      // de hoje seriam descartadas uma a uma — o bug de produção.
      expect(filtro).not.toContain('23:27');
    } finally {
      jest.useRealTimers();
    }
  });

  // O caso concreto: com fuso, as 4 reservas de hoje passam pelo corte.
  test('com fuso, as reservas da noite de hoje sobrevivem ao corte', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T23:27:00Z'));
    try {
      await getUpcomingReservations('r-1', 'America/Sao_Paulo');
      const corte = filtroConstruido().match(/time\.gte\.(\d{2}:\d{2})/)[1];
      const daNoite = ['20:00', '21:30', '22:00', '22:30'];
      // 20:00 é a que já começou (check-in); as três futuras têm que passar.
      expect(daNoite.filter((t) => t >= corte)).toEqual(['21:30', '22:00', '22:30']);
    } finally {
      jest.useRealTimers();
    }
  });

  // O fallback existe só para não quebrar chamador antigo, mas antes ele
  // misturava DUAS fontes de verdade: toISOString() (UTC) para a data e
  // toTimeString() (hora local do servidor) para a hora. Numa lambda UTC os
  // dois coincidem por acidente; numa máquina de dev no Brasil discordam em
  // 3h, e a data de um fuso vai comparada com a hora de outro.
  test('sem fuso: o fallback é internamente coerente — UTC nos dois', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T23:27:00Z'));
    try {
      await getUpcomingReservations('r-1');
      const filtro = filtroConstruido();
      expect(filtro).toContain('date.eq.2026-08-25');
      expect(filtro).toContain('time.gte.23:27');
    } finally {
      jest.useRealTimers();
    }
  });

  test('o corte usa a data local, não a UTC, quando os dias divergem', async () => {
    // 2026-08-26T02:00Z ainda é dia 25 (23:00) em São Paulo.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T02:00:00Z'));
    try {
      await getUpcomingReservations('r-1', 'America/Sao_Paulo');
      const filtro = filtroConstruido();
      expect(filtro).toContain('date.gt.2026-08-25');
      expect(filtro).toContain('time.gte.23:00');
      expect(filtro).not.toContain('2026-08-26');
    } finally {
      jest.useRealTimers();
    }
  });
});
