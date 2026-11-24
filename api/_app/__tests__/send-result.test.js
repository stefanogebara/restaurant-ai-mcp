'use strict';

/**
 * Falha de envio precisa virar um diagnóstico, não um silêncio.
 *
 * Bug real (jul/2026): nenhum dos 7 `sendMessage` do processador checava o
 * retorno. `sendViaMeta` e `sendViaTwilio` NÃO lançam — devolvem
 * `{ success: false, error }`. Então quando o envio falhava (janela de 24h
 * fechada, token recusado, número sem WhatsApp) o cliente não recebia nada, o
 * histórico gravava a resposta do assistente como se tivesse saído, e o único
 * rastro era um log genérico dentro do sender. Nenhum alerta, nenhum retry.
 *
 * Este módulo classifica a falha, porque a CATEGORIA muda o que o dono faz:
 * janela de 24h fechada é operação normal do WhatsApp (precisa de template),
 * token recusado é o produto fora do ar.
 */

const { avaliarEnvio, CATEGORIAS } = require('../_lib/channels/send-result');

describe('envio bem-sucedido', () => {
  test('success true → entregue, sem alerta', () => {
    const r = avaliarEnvio({ success: true, messageId: 'wamid.X' });
    expect(r.entregue).toBe(true);
    expect(r.alertavel).toBe(false);
  });
});

describe('classificação por código da Meta — a categoria decide a ação', () => {
  test('131047: janela de 24h fechada — normal, exige template, NÃO é incidente', () => {
    // O cliente não escreve há mais de 24h. É regra da Meta, não defeito.
    // Alertar aqui todo dia treinaria o dono a ignorar o alerta.
    const r = avaliarEnvio({ success: false, code: 131047, error: 'Re-engagement message' });
    expect(r.categoria).toBe(CATEGORIAS.JANELA_24H);
    expect(r.entregue).toBe(false);
    expect(r.alertavel).toBe(false);
    expect(r.acao).toMatch(/template/i);
  });

  test('190: token recusado — o produto está fora do ar, alerta', () => {
    const r = avaliarEnvio({ success: false, code: 190, error: 'Invalid OAuth access token' });
    expect(r.categoria).toBe(CATEGORIAS.CREDENCIAL);
    expect(r.alertavel).toBe(true);
    expect(r.acao).toMatch(/token/i);
  });

  test('131026: número não recebe WhatsApp — problema do destinatário, não alerta', () => {
    const r = avaliarEnvio({ success: false, code: 131026, error: 'Message undeliverable' });
    expect(r.categoria).toBe(CATEGORIAS.DESTINATARIO);
    expect(r.alertavel).toBe(false);
  });

  test('131031: conta bloqueada pela Meta — alerta', () => {
    const r = avaliarEnvio({ success: false, code: 131031, error: 'Account locked' });
    expect(r.categoria).toBe(CATEGORIAS.CONTA);
    expect(r.alertavel).toBe(true);
  });

  test('80007: limite de chamadas — passageiro, alerta porque some mensagem', () => {
    const r = avaliarEnvio({ success: false, code: 80007, error: 'rate limit hit' });
    expect(r.categoria).toBe(CATEGORIAS.LIMITE);
    expect(r.alertavel).toBe(true);
  });

  test('código desconhecido cai em desconhecido e ALERTA — na dúvida, avisa', () => {
    const r = avaliarEnvio({ success: false, code: 999999, error: 'algo novo' });
    expect(r.categoria).toBe(CATEGORIAS.DESCONHECIDO);
    expect(r.alertavel).toBe(true);
  });
});

describe('sem código — cai no texto do erro', () => {
  test('"not configured" é configuração, não incidente de runtime', () => {
    const r = avaliarEnvio({ success: false, error: 'WhatsApp not configured' });
    expect(r.categoria).toBe(CATEGORIAS.CONFIGURACAO);
  });

  test('texto de janela de 24h é reconhecido mesmo sem código', () => {
    const r = avaliarEnvio({ success: false, error: 'Re-engagement message outside 24 hour window' });
    expect(r.categoria).toBe(CATEGORIAS.JANELA_24H);
  });

  test('texto de token é reconhecido mesmo sem código', () => {
    const r = avaliarEnvio({ success: false, error: 'Error validating access token: session expired' });
    expect(r.categoria).toBe(CATEGORIAS.CREDENCIAL);
    expect(r.alertavel).toBe(true);
  });
});

describe('entrada capenga não pode derrubar o caminho da mensagem', () => {
  test.each([
    ['null', null],
    ['undefined', undefined],
    ['objeto vazio', {}],
    ['string solta', 'boom'],
  ])('%s → não entregue, alertável, sem exceção', (_rotulo, entrada) => {
    const r = avaliarEnvio(entrada);
    expect(r.entregue).toBe(false);
    expect(r.alertavel).toBe(true);
  });

  test('adapter que devolve undefined (não implementa o contrato) é tratado como falha', () => {
    // Um adapter novo que esqueça de retornar não pode passar por "entregue".
    expect(avaliarEnvio(undefined).entregue).toBe(false);
  });
});

describe('a linha de log é feita pra ser grepada', () => {
  test('resumo traz a marca [SEND_FAIL], a categoria e a ação', () => {
    const r = avaliarEnvio({ success: false, code: 190, error: 'Invalid OAuth access token' });
    expect(r.resumo).toContain('[SEND_FAIL]');
    expect(r.resumo).toContain(CATEGORIAS.CREDENCIAL);
  });

  test('sucesso não produz resumo — silêncio quando está tudo bem', () => {
    expect(avaliarEnvio({ success: true }).resumo).toBeNull();
  });

  test('o resumo NÃO vaza o token que veio na mensagem de erro da Meta', () => {
    const r = avaliarEnvio({
      success: false, code: 190,
      error: 'Invalid OAuth access token EAAG1234567890abcdefghijklmnopqrst',
    });
    expect(r.resumo).not.toContain('EAAG1234567890abcdefghijklmnopqrst');
  });
});
