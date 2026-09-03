'use strict';

/**
 * A checagem de posse do verify-session — que nunca rodou.
 *
 * O endpoint recebe um `session_id` do Stripe e devolve e-mail, valor,
 * subscription e plano daquela sessão de checkout. Para impedir que o usuário
 * A leia a sessão do usuário B, ele carrega o restaurante do usuário logado e
 * compara o e-mail do dono com o e-mail da sessão.
 *
 * O select pedia `customer_email`. Essa coluna NÃO EXISTE em restaurant_config
 * (a real é `email`). Em PostgREST uma coluna inexistente derruba o select, o
 * cliente do Supabase devolve `data: null` SEM lançar, `restaurant` ficava
 * null, e o bloco de posse era pulado inteiro. O 403 nunca disparou:
 * qualquer usuário autenticado lia qualquer sessão pelo id.
 *
 * Os ids do Stripe são longos e aleatórios, então enumerar é impraticável —
 * mas um id vazado numa URL ou log ficava legível para qualquer conta logada.
 *
 * Confirmado contra produção: `select customer_email from
 * restaurant.restaurant_config` → ERROR 42703.
 */

const mockRetrieve = jest.fn();
const mockVerifyJWT = jest.fn();
let mockRestaurante = null;
let mockErroRestaurante = null;
const mockSelects = [];

jest.mock('stripe', () => jest.fn(() => ({
  checkout: { sessions: { retrieve: mockRetrieve } },
})));
jest.mock('../_lib/auth', () => ({ verifyJWT: mockVerifyJWT }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn(() => false) }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => {
        const q = {
          select(cols) { mockSelects.push(cols); return q; },
          eq() { return q; },
          limit() { return q; },
          single() { return Promise.resolve({ data: mockRestaurante, error: mockErroRestaurante }); },
        };
        return q;
      },
    }),
  },
}));

const handler = require('../verify-session');

function req(sessionId = 'cs_test_abc') {
  return { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { session_id: sessionId } };
}
function res() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

const SESSAO = {
  payment_status: 'paid',
  customer: 'cus_1',
  customer_details: { email: 'dono@mocoto.com.br' },
  subscription: 'sub_1',
  amount_total: 49700,
  currency: 'brl',
  line_items: { data: [{ price: { id: 'price_x' } }] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSelects.length = 0;
  mockRestaurante = null;
  mockErroRestaurante = null;
  mockVerifyJWT.mockResolvedValue({ sub: 'user-1' });
  mockRetrieve.mockResolvedValue(SESSAO);
});

describe('verify-session — a sessão do Stripe só é lida pelo dono', () => {
  test('pede a coluna que EXISTE: email, não customer_email', async () => {
    mockRestaurante = { email: 'dono@mocoto.com.br' };
    await handler(req(), res());
    expect(mockSelects).toContain('email');
    expect(mockSelects.join(' ')).not.toMatch(/customer_email/);
  });

  test('dono cujo e-mail bate com a sessão → 200', async () => {
    mockRestaurante = { email: 'dono@mocoto.com.br' };
    const r = res();
    await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  // O caso que nunca funcionou. Antes, `restaurant` era null e isto virava 200.
  test('e-mail de OUTRO dono → 403, sem vazar a sessão', async () => {
    mockRestaurante = { email: 'outro@restaurante.com' };
    const r = res();
    await handler(req('cs_live_de_outra_pessoa'), r);
    expect(r.status).toHaveBeenCalledWith(403);
    const corpo = r.json.mock.calls[0][0];
    expect(corpo).not.toHaveProperty('customer_email');
    expect(corpo).not.toHaveProperty('subscription_id');
  });

  test('comparação de e-mail ignora maiúsculas', async () => {
    mockRestaurante = { email: 'Dono@Mocoto.com.br' };
    const r = res();
    await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  // Foi assim que o bug viveu: falha de consulta virando acesso liberado.
  test('falha ao carregar o restaurante → 403, nunca 200', async () => {
    mockErroRestaurante = { code: '42703', message: 'column "customer_email" does not exist' };
    const r = res();
    await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  // Usuário logado mas ainda sem restaurante (pré-onboarding) não pode ser
  // bloqueado — é justamente quem acabou de pagar e está voltando do Stripe.
  test('usuário sem restaurante ainda (PGRST116) segue normalmente', async () => {
    mockErroRestaurante = { code: 'PGRST116', message: 'no rows' };
    const r = res();
    await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('sem JWT → 401 antes de tocar no Stripe', async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const r = res();
    await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
