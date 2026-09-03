var mockSchemaFrom = jest.fn();
var mockSupabaseAdmin = {
  from: jest.fn(),
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};

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

const handler = require('../_crons/update-churn-scores');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

function mockChain(data, error = null) {
  const c = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data, error }),
  };
  return c;
}

function mockUpsertChain(error = null) {
  return {
    from: jest.fn().mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error }),
    }),
  };
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/update-churn-scores', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 200 with no restaurants', async () => {
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, updated: 0 }));
  });

  test('processes restaurants and upserts LTV records', async () => {
    // Mock restaurant_config query
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: [{ id: 'rest-1' }], error: null }),
    });
    // Mock reservations query (from public schema)
    mockSupabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  { customer_phone: '+5511999', customer_name: 'Ana', customer_email: 'a@b.com', date: '2026-03-01', party_size: 2 },
                  { customer_phone: '+5511999', customer_name: 'Ana', customer_email: 'a@b.com', date: '2026-02-01', party_size: 3 },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });
    // Mock schema upsert for customer_ltv
    mockSupabaseAdmin.schema.mockReturnValue({
      from: jest.fn().mockImplementation((table) => {
        if (table === 'restaurant_config') {
          return { select: jest.fn().mockResolvedValue({ data: [{ id: 'rest-1' }], error: null }) };
        }
        // customer_ltv
        return { upsert: jest.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  /**
   * O CONSERTO DE 24/08/2026. O cron não completava desde 11/08: estourava o
   * teto de 60s da Vercel porque gravava UM upsert POR CLIENTE, com await
   * sequencial. Em produção eram 583 clientes distintos — 583 idas ao banco.
   *
   * O orçamento de tempo que já existia (TIME_BUDGET_MS) não protegia: ele é
   * conferido ENTRE restaurantes, então um único restaurante grande atravessa
   * o limite inteiro sem ninguém olhar.
   *
   * Este teste falha na versão antiga: com 250 clientes ela chamaria upsert
   * 250 vezes, cada uma com um OBJETO.
   */
  test('grava em LOTE, não um upsert por cliente', async () => {
    const CLIENTES = 250;
    const reservas = Array.from({ length: CLIENTES }, (_, i) => ({
      customer_phone: `+55119${String(i).padStart(6, '0')}`,
      customer_name: `Cliente ${i}`,
      customer_email: `c${i}@x.com`,
      date: '2026-03-01',
      party_size: 2,
    }));

    mockSupabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: reservas, error: null }),
            }),
          }),
        }),
      }),
    });

    const upsertSpy = jest.fn().mockResolvedValue({ error: null });
    mockSupabaseAdmin.schema.mockReturnValue({
      from: jest.fn().mockImplementation((table) => {
        if (table === 'restaurant_config') {
          return { select: jest.fn().mockResolvedValue({ data: [{ id: 'rest-1' }], error: null }) };
        }
        return { upsert: upsertSpy };
      }),
    });

    await handler({ headers: { authorization: 'Bearer test-cron-secret' } }, mockRes());

    // 250 clientes em lotes de 100 => 3 chamadas, nunca 250.
    expect(upsertSpy).toHaveBeenCalledTimes(3);
    for (const [payload] of upsertSpy.mock.calls) {
      expect(Array.isArray(payload)).toBe(true);
    }
    const enviados = upsertSpy.mock.calls.reduce((s, [p]) => s + p.length, 0);
    expect(enviados).toBe(CLIENTES); // nenhum cliente se perde no fatiamento
  });

  test('returns 500 on database error', async () => {
    mockSupabaseAdmin.schema.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
      }),
    });
    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
