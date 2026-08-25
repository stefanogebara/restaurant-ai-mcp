/**
 * Guarda de regressão: o registro de gasto de IA (`ai_spend`) não pode voltar
 * a ser fire-and-forget.
 *
 * Era disparado sem await logo antes de o handler responder. A perda não era
 * uniforme — handler curto (demo-chat, seo) congelava antes do insert landar,
 * chamador lento (prospecting, cron) seguia trabalhando e gravava. O painel de
 * custo passava a super-atribuir sistematicamente ao que é lento, e é dele que
 * sai a conclusão de "quem é o ralo do gasto de IA".
 *
 * O teste afirma ORDENAÇÃO: o insert precisa ter completado quando
 * messages.create resolve. Com o código antigo a flag ainda está false.
 *
 * Cobre também a armadilha sutil da correção: se algum ramo de registrarGasto
 * devolvesse `undefined` em vez de uma Promise, `Promise.race([undefined, teto])`
 * resolveria na hora e o await viraria decorativo — fire-and-forget de novo,
 * em silêncio.
 */

var mockSpendWriteCompleted = false;

function mockDeferred(value, onDone) {
  return new Promise((resolve) => {
    setTimeout(() => { onDone(); resolve(value); }, 0);
  });
}

var mockSupabaseAdmin = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      then: (res, rej) =>
        mockDeferred({ error: null }, () => { mockSpendWriteCompleted = true; }).then(res, rej),
    })),
  })),
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin,
  // ai-client importa withRetry daqui; passthrough para exercitar o caminho real
  withRetry: (fn) => fn(),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

process.env.OPENROUTER_API_KEY = 'test-key';

const { getAI } = require('../_lib/ai-client');

const OK_RESPONSE = {
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content: 'olá' }, finish_reason: 'stop' }],
    usage: { cost: 0.0123, prompt_tokens: 10, completion_tokens: 5 },
  }),
  text: async () => '',
};

beforeEach(() => {
  mockSpendWriteCompleted = false;
  global.fetch = jest.fn(async () => OK_RESPONSE);
});

describe('ai_spend — não perde a linha no freeze da lambda', () => {
  test('o insert de ai_spend completa ANTES de messages.create resolver', async () => {
    const res = await getAI().messages.create({
      model: 'test-model',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'oi' }],
    });

    expect(res).toBeTruthy();
    // O ponto do teste: fire-and-forget deixaria isto em false.
    expect(mockSpendWriteCompleted).toBe(true);
  });

  test('resposta sem `usage` não trava nem explode (ramo de early return)', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
      text: async () => '',
    }));

    const res = await getAI().messages.create({
      model: 'test-model',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'oi' }],
    });

    expect(res).toBeTruthy();
    expect(mockSpendWriteCompleted).toBe(false);
  });
});
