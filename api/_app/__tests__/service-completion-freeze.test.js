/**
 * Guarda de regressão para a corrida com o freeze da lambda em
 * service-completion-core.
 *
 * Os passos 3 (upsert de customer_ltv) e 4 (webhook service.completed) eram
 * fire-and-forget, e entre eles e o `res.json()` dos dois callers
 * (pos/service-completion.js, square-webhook.js) não havia um único await —
 * a lambda congelava antes do primeiro roundtrip.
 *
 * Para walk-in de POS SEM reserva o insert de LTV é a ÚNICA coisa que cria a
 * linha no ledger: o cron noturno update-churn-scores reconstrói a partir de
 * `reservations` e nunca enxerga esse cliente. Perder era permanente.
 *
 * Os testes abaixo afirmam ORDENAÇÃO — os dois writes precisam ter completado
 * quando recordServiceCompletion resolve. Com o código fire-and-forget antigo
 * as flags ainda estão false nesse ponto, e os testes falham.
 */

var mockLtvWriteCompleted = false;
var mockDispatchCompleted = false;

// Resolve só num macrotask posterior: uma chamada não-aguardada não tem como
// ter terminado quando a função sob teste retorna.
function mockDeferred(value, onDone) {
  return new Promise((resolve) => {
    setTimeout(() => {
      onDone();
      resolve(value);
    }, 0);
  });
}

function mockMakeBuilder({ terminal, thenable }) {
  const b = {};
  for (const m of ['insert', 'select', 'eq', 'update', 'upsert', 'order', 'limit', 'delete']) {
    b[m] = jest.fn(() => b);
  }
  b.single = jest.fn(() => terminal());
  b.maybeSingle = jest.fn(() => terminal());
  // `await builder` (sem .single()) — caminho do insert de LTV
  b.then = (res, rej) => thenable().then(res, rej);
  return b;
}

var mockSupabaseAdmin = {
  from: jest.fn((table) => {
    if (table === 'service_records') {
      return mockMakeBuilder({
        terminal: () => Promise.resolve({ data: { id: 1, service_id: 'svc_test' }, error: null }),
        thenable: () => Promise.resolve({ data: null, error: null }),
      });
    }
    // revenue_records (insert e checagem de idempotência)
    return mockMakeBuilder({
      terminal: () => Promise.resolve({ data: { id: 'rev_1' }, error: null }),
      thenable: () => Promise.resolve({ data: null, error: null }),
    });
  }),
  schema: jest.fn(() => ({
    from: jest.fn(() =>
      mockMakeBuilder({
        // leitura: cliente novo (walk-in), sem linha prévia -> cai no insert
        terminal: () => Promise.resolve({ data: null, error: null }),
        // escrita: o insert de LTV, deferido para provar a ordenação
        thenable: () => mockDeferred({ data: null, error: null }, () => { mockLtvWriteCompleted = true; }),
      }),
    ),
  })),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/validation', () => ({
  validatePhoneNumber: () => ({ valid: true }),
}));
jest.mock('../_lib/secure-id', () => ({
  generateSecureServiceId: () => 'svc_test',
}));
jest.mock('../_services/webhookDispatcher', () => ({
  dispatchEvent: jest.fn(() => mockDeferred(undefined, () => { mockDispatchCompleted = true; })),
}));

const { recordServiceCompletion } = require('../_lib/pos/service-completion-core');

const VALID = {
  restaurantId: 'rest_1',
  customerPhone: '+5511999999999',
  customerName: 'Walk-in do POS',
  partySize: 2,
  totalBill: 180.5,
};

beforeEach(() => {
  mockLtvWriteCompleted = false;
  mockDispatchCompleted = false;
  jest.clearAllMocks();
});

describe('recordServiceCompletion — não perde trabalho no freeze da lambda', () => {
  test('o upsert de customer_ltv completa ANTES de a função resolver', async () => {
    const result = await recordServiceCompletion({ ...VALID });

    expect(result.ok).toBe(true);
    // O ponto do teste: fire-and-forget deixaria isto em false.
    expect(mockLtvWriteCompleted).toBe(true);
  });

  test('o webhook service.completed é despachado ANTES de a função resolver', async () => {
    const result = await recordServiceCompletion({ ...VALID });

    expect(result.ok).toBe(true);
    expect(mockDispatchCompleted).toBe(true);
  });

  test('devolve service_id e revenue_id no caminho feliz', async () => {
    const result = await recordServiceCompletion({ ...VALID });

    expect(result).toMatchObject({ ok: true, service_id: 'svc_test', revenue_id: 'rev_1' });
  });

  test('falha de LTV segue non-fatal — o service record ainda vale', async () => {
    mockSupabaseAdmin.schema.mockImplementationOnce(() => ({
      from: jest.fn(() =>
        mockMakeBuilder({
          terminal: () => Promise.reject(new Error('ltv indisponível')),
          thenable: () => Promise.reject(new Error('ltv indisponível')),
        }),
      ),
    }));

    const result = await recordServiceCompletion({ ...VALID });

    expect(result.ok).toBe(true);
    expect(result.service_id).toBe('svc_test');
  });
});
