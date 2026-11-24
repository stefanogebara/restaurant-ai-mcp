'use strict';

/**
 * Sem follow-up pra quem nunca recebeu a intro (27/09/2026: 12 de 15 toques 3
 * falhados iam pra leads cuja intro já tinha falhado).
 */

function fakeSupabase(rows, { erro = null } = {}) {
  const filtros = {};
  const api = {
    from: () => api,
    select: () => api,
    eq: (col, val) => { filtros[col] = val; return api; },
    limit: async () => {
      if (erro) return { data: null, error: { message: erro } };
      const out = rows.filter((r) => Object.entries(filtros).every(([c, v]) => r[c] === v));
      return { data: out, error: null };
    },
  };
  return api;
}

function carregar(rows, opts) {
  jest.resetModules();
  jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
  jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: fakeSupabase(rows, opts) }));
  return require('../_lib/prospecting/falha-de-entrega');
}

describe('templateFalhou', () => {
  test('intro falhada encerra a sequência', async () => {
    const { templateFalhou } = carregar([
      { lead_id: 'L1', direcao: 'out', tipo: 'template', status: 'failed', error_detail: '131026 Message undeliverable' },
    ]);
    await expect(templateFalhou('L1')).resolves.toMatch(/131026/);
  });

  test('intro entregue: a sequência segue', async () => {
    const { templateFalhou } = carregar([
      { lead_id: 'L1', direcao: 'out', tipo: 'template', status: 'read', error_detail: null },
    ]);
    await expect(templateFalhou('L1')).resolves.toBeNull();
  });

  test('falha de OUTRO lead não conta', async () => {
    const { templateFalhou } = carregar([
      { lead_id: 'L2', direcao: 'out', tipo: 'template', status: 'failed', error_detail: '131049' },
    ]);
    await expect(templateFalhou('L1')).resolves.toBeNull();
  });

  test('erro de leitura degrada aberto (não trava a sequência)', async () => {
    const { templateFalhou } = carregar([], { erro: 'timeout' });
    await expect(templateFalhou('L1')).resolves.toBeNull();
  });
});
