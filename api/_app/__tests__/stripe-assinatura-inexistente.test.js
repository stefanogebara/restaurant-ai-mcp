/**
 * O CONSERTO DE 25/08/2026 — assinaturas que só existem no nosso banco.
 *
 * O cron diário /api/report-usage falhava todo dia em duas linhas:
 *   No such subscription: 'sub_audit_test'              (restaurante de teste)
 *   No such subscription: 'sub_1TEuTiKf4yCMjmH5mMm8AJvx' (trial de 07/03, 0 uso)
 *
 * `resource_missing` caía no catch genérico e virava `errors++`. Como o Stripe
 * responde a mesma coisa todo dia, eram duas linhas de ERRO fixas e eternas no
 * log — o tipo de ruído que ensina todo mundo a não ler o log de erro.
 *
 * O conserto faz o que o webhook `customer.subscription.deleted` faria se
 * tivesse chegado: marca a linha como canceled e ela sai da consulta de amanhã.
 *
 * A TRAVA é a parte que mais importa. Uma STRIPE_SECRET_KEY trocada entre test
 * e live faz TODAS as assinaturas responderem `resource_missing`; sem a trava
 * este "conserto" cancelaria a base inteira numa madrugada, em silêncio. Por
 * isso o último teste vale mais que os outros dois.
 */

var mockUpdate = jest.fn();
var mockIn = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('stripe', () => jest.fn(() => ({
  subscriptions: { retrieve: jest.fn() },
  billing: { meterEvents: { create: jest.fn() } },
})));

const { reconcileMissingSubscriptions } = require('../_lib/stripe-usage-reporter');

beforeEach(() => {
  jest.clearAllMocks();
  mockIn = jest.fn().mockResolvedValue({ error: null });
  mockUpdate = jest.fn().mockReturnValue({ in: mockIn });
  mockSupabaseAdmin.from.mockReturnValue({ update: mockUpdate });
});

describe('reconcileMissingSubscriptions', () => {
  test('não toca no banco quando nada sumiu', async () => {
    const n = await reconcileMissingSubscriptions([], 7);
    expect(n).toBe(0);
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
  });

  test('marca como canceled a minoria que o Stripe garante não existir', async () => {
    // O caso real de produção: 2 linhas podres de 7 assinaturas consideradas.
    const n = await reconcileMissingSubscriptions(
      ['sub_audit_test', 'sub_1TEuTiKf4yCMjmH5mMm8AJvx'], 7);

    expect(n).toBe(2);
    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('subscriptions');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled' }));
    expect(mockIn).toHaveBeenCalledWith('subscription_id',
      ['sub_audit_test', 'sub_1TEuTiKf4yCMjmH5mMm8AJvx']);
  });

  test('ABORTA sem tocar em nada quando a maioria some de uma vez (chave errada)', async () => {
    // 7 de 7: não é linha velha, é STRIPE_SECRET_KEY de test batendo em live.
    const todas = Array.from({ length: 7 }, (_, i) => `sub_${i}`);
    const n = await reconcileMissingSubscriptions(todas, 7);

    expect(n).toBe(0);
    // A trava vale por NÃO escrever. Se um dia este expect cair, a base inteira
    // é cancelada silenciosamente na primeira troca de chave.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('4 de 7 (57%) já é acidente — a trava pega antes de virar dano', async () => {
    const n = await reconcileMissingSubscriptions(['a', 'b', 'c', 'd'], 7);
    expect(n).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('3 de 7 (43%) ainda é faxina legítima', async () => {
    const n = await reconcileMissingSubscriptions(['a', 'b', 'c'], 7);
    expect(n).toBe(3);
    expect(mockUpdate).toHaveBeenCalled();
  });

  test('erro do banco não é contado como reconciliado', async () => {
    mockIn.mockResolvedValue({ error: { message: 'DB down' } });
    const n = await reconcileMissingSubscriptions(['sub_audit_test'], 7);
    expect(n).toBe(0);
  });
});
