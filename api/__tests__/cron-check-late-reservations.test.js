var mockFrom = jest.fn();
var mockSchema = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: mockSchema,
};

// O cron busca o fuso de cada restaurante em
//   supabaseAdmin.schema('restaurant').from('restaurant_config')
//
// Lia de restaurant_info até 02/08/2026 — tabela legada que ficou com ZERO
// linhas. O mapa vinha vazio, TODO restaurante caía no default 'UTC', e para
// São Paulo (UTC−3) isso fazia a reserva parecer 3h mais velha: cliente
// marcado como no-show até 3 horas antes de estar atrasado.
//
// O mock registra de QUAL tabela veio a consulta, para que um retorno à tabela
// errada quebre o teste em vez de passar silenciosamente.
var tabelasDeFusoConsultadas = [];
var fusosMock = [{ id: 'rest-1', timezone: 'UTC' }];

function defaultSchemaMock() {
  return {
    from: jest.fn((tabela) => {
      tabelasDeFusoConsultadas.push(tabela);
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            // Tabela errada devolve vazio, igual à produção — é o que torna o
            // bug reproduzível em vez de mascarado pelo mock.
            data: tabela === 'restaurant_config' ? fusosMock : [],
            error: null,
          }),
        }),
      };
    }),
  };
}

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../cron/check-late-reservations');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => {
  jest.clearAllMocks();
  tabelasDeFusoConsultadas = [];
  fusosMock = [{ id: 'rest-1', timezone: 'UTC' }];
  mockSchema.mockImplementation(defaultSchemaMock);
});

/** Monta o mock de reservas + mesas usado pelos casos de no-show. */
function comReservas(reservas) {
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              is: jest.fn().mockResolvedValue({ data: reservas, error: null }),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }),
      };
    }
    if (table === 'tables') {
      return { update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) };
    }
    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data: null, error: null }) };
  });
}

describe('cron/check-late-reservations', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with 0 no-shows when no late reservations', async () => {
    // V.2 chain: select → in → eq → is (no .lte — that filtered local
    // time-of-day against UTC wall clock, which was the timezone bug).
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.marked_as_no_show).toBe(0);
  });

  test('marks late reservations as no-show and releases tables', async () => {
    const lateRes = [{
      id: 'uuid-1', reservation_id: 'RES-001', customer_name: 'Ana',
      time: '18:00', table_ids: ['t1'], restaurant_id: 'rest-1', status: 'confirmed', date: '2026-04-08',
    }];

    // For the SELECT query — V.2 chain is select→in→eq→is (no .lte).
    mockFrom.mockImplementation((table) => {
      if (table === 'reservations') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockResolvedValue({ data: lateRes, error: null }),
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      if (table === 'tables') {
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data: null, error: null }) };
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.marked_as_no_show).toBe(1);
  });

  test('busca o fuso em restaurant_config, nunca em restaurant_info', async () => {
    // PRECISA de reserva: sem nenhuma, restaurantIds fica vazio e a consulta de
    // fuso nem roda — o teste passaria vazio, provando nada. (Escrevi assim na
    // primeira versão e ele passava até contra o código bugado.)
    comReservas([{
      id: 'uuid-1', reservation_id: 'RES-001', customer_name: 'Ana',
      time: '18:00', table_ids: ['t1'], restaurant_id: 'rest-1', status: 'confirmed', date: '2026-04-08',
    }]);
    await handler({ headers: { authorization: 'Bearer test-cron-secret' } }, mockRes());

    expect(tabelasDeFusoConsultadas).toContain('restaurant_config');
    expect(tabelasDeFusoConsultadas).not.toContain('restaurant_info');
  });

  test('reserva de São Paulo ainda no horário NÃO vira no-show', async () => {
    // O caso que o bug quebrava. A reserva é daqui a pouco no fuso de SP; com
    // o default 'UTC' (o que acontecia com o mapa vazio) ela pareceria 3h mais
    // velha e cruzaria o limiar de 20 min — no-show antes da hora.
    const agora = new Date();
    const emSaoPaulo = new Date(agora.getTime() - 3 * 60 * 60 * 1000); // UTC-3
    const data = emSaoPaulo.toISOString().slice(0, 10);
    const hora = emSaoPaulo.toISOString().slice(11, 16); // "agora" no relógio local de SP

    fusosMock = [{ id: 'rest-sp', timezone: 'America/Sao_Paulo' }];
    comReservas([{
      id: 'uuid-sp', reservation_id: 'RES-SP', customer_name: 'Bruno',
      time: hora, table_ids: ['t9'], restaurant_id: 'rest-sp', status: 'confirmed', date: data,
    }]);

    const res = mockRes();
    await handler({ headers: { authorization: 'Bearer test-cron-secret' } }, res);
    expect(res.json.mock.calls[0][0].marked_as_no_show).toBe(0);
  });

  test('returns 500 on database fetch error', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockResolvedValue({ data: null, error: { message: 'Connection lost' } }),
          }),
        }),
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
