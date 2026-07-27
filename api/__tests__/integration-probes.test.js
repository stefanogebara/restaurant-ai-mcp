'use strict';

/**
 * Sondas de integração — contrato:
 *  1. nenhuma resposta pode conter segredo, nem quando o fornecedor devolve
 *     a chave dentro da mensagem de erro;
 *  2. "não configurado" nunca vira alarme (senão o vermelho perde o sentido);
 *  3. uma sonda que quebra não derruba as outras.
 */

const {
  NIVEIS, DIAS_AVISO_EXPIRACAO,
  redigir, resumir, sondarTokenMeta, sondarNumeroWhatsApp, sondarSupabase, sondarIntegracoes,
} = require('../_lib/integration-probes');

const AGORA = Date.parse('2026-07-27T12:00:00Z');
const emDias = (n) => Math.floor((AGORA + n * 86400000) / 1000);

/** fetch falso: devolve o corpo pedido, com status opcional. */
function mockFetch(corpo, status = 200) {
  return jest.fn().mockResolvedValue({ status, json: async () => corpo });
}

describe('redigir — segredo nunca chega na resposta', () => {
  test.each([
    ['chave OpenAI', 'Incorrect API key provided: sk-proj-AbC123XyZ987654321qwerty'],
    ['chave publicável', 'bad key pk_live_51RJHzCKf4yCMjmH5oSeIBG6aexjz'],
    ['segredo de webhook', 'signature mismatch for whsec_9aBcD3fGh1JkLmNoPqRsTuVw'],
    ['token da Meta', 'Invalid OAuth token EAAG1234567890abcdefghijklmnopqrstuvwx'],
    ['cabeçalho Bearer', 'rejected: Bearer abc123def456ghi789jkl'],
    ['JWT do Supabase', 'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZSJ9.xyz'],
  ])('%s é redigido', (_rotulo, mensagem) => {
    const saida = redigir(mensagem);
    expect(saida).toContain('[redigido]');
    // O trecho longo do segredo não pode sobreviver em lugar nenhum.
    const segredo = mensagem.match(/\S{20,}/)[0];
    expect(saida).not.toContain(segredo);
  });

  test('texto sem segredo passa intacto — redigir não pode cegar o diagnóstico', () => {
    expect(redigir('rate limit exceeded, try again in 30s'))
      .toBe('rate limit exceeded, try again in 30s');
  });

  test('trunca mensagem gigante (fornecedor às vezes devolve HTML inteiro)', () => {
    expect(redigir('x'.repeat(5000)).length).toBeLessThanOrEqual(300);
  });

  test('null e undefined não explodem', () => {
    expect(redigir(null)).toBe('');
    expect(redigir(undefined)).toBe('');
  });
});

describe('token da Meta — o que já expirou em silêncio uma vez', () => {
  const env = { WHATSAPP_ACCESS_TOKEN: 'token-de-teste' };

  test('System User (expires_at 0) é o estado desejado: ok e sem contagem', async () => {
    global.fetch = mockFetch({ data: { is_valid: true, expires_at: 0 } });
    const r = await sondarTokenMeta(env, AGORA);
    expect(r.nivel).toBe(NIVEIS.OK);
    expect(r.detalhe).toMatch(/não expira/i);
  });

  test('expira dentro da janela de aviso → atenção, não falha (ainda funciona)', async () => {
    global.fetch = mockFetch({ data: { is_valid: true, expires_at: emDias(DIAS_AVISO_EXPIRACAO - 1) } });
    const r = await sondarTokenMeta(env, AGORA);
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.dias_restantes).toBe(DIAS_AVISO_EXPIRACAO - 1);
  });

  test('expira longe → ok', async () => {
    global.fetch = mockFetch({ data: { is_valid: true, expires_at: emDias(45) } });
    expect((await sondarTokenMeta(env, AGORA)).nivel).toBe(NIVEIS.OK);
  });

  test('is_valid false → falha (o caso de 09/mai/2026, 3 semanas sem ninguém ver)', async () => {
    global.fetch = mockFetch({ data: { is_valid: false } });
    expect((await sondarTokenMeta(env, AGORA)).nivel).toBe(NIVEIS.FALHA);
  });

  test('erro da Meta com o token dentro da mensagem sai redigido', async () => {
    global.fetch = mockFetch({ error: { message: 'Invalid OAuth access token EAAG1234567890abcdefghijklmnop' } });
    const r = await sondarTokenMeta(env, AGORA);
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).not.toContain('EAAG1234567890abcdefghijklmnop');
  });

  test('sem token configurado NÃO é falha — é ausência, e diz qual variável falta', async () => {
    const r = await sondarTokenMeta({}, AGORA);
    expect(r.nivel).toBe(NIVEIS.NAO_CONFIGURADO);
    expect(r.detalhe).toContain('WHATSAPP_ACCESS_TOKEN');
  });
});

describe('saúde do número — qualidade RED antecede suspensão', () => {
  const env = { WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' };
  const sondar = () => sondarNumeroWhatsApp(env, 'whatsapp_reservas', 'WHATSAPP_PHONE_NUMBER_ID');

  test('GREEN → ok', async () => {
    global.fetch = mockFetch({ display_phone_number: '+55 11 9999-9999', quality_rating: 'GREEN' });
    expect((await sondar()).nivel).toBe(NIVEIS.OK);
  });

  test('YELLOW → atenção: ainda entrega, mas a próxima parada é RED', async () => {
    global.fetch = mockFetch({ display_phone_number: '+55 11 9999-9999', quality_rating: 'YELLOW' });
    const r = await sondar();
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.qualidade).toBe('YELLOW');
  });

  test('RED → falha: a Meta está prestes a limitar o número', async () => {
    global.fetch = mockFetch({ display_phone_number: '+55 11 9999-9999', quality_rating: 'RED' });
    const r = await sondar();
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/suspender|limitar/i);
  });

  test('número de prospecção ausente é ausência, não defeito', async () => {
    const r = await sondarNumeroWhatsApp({ WHATSAPP_ACCESS_TOKEN: 't' }, 'whatsapp_prospeccao', 'PROSPECTING_PHONE_NUMBER_ID');
    expect(r.nivel).toBe(NIVEIS.NAO_CONFIGURADO);
  });
});

describe('supabase — se cai, nada no produto funciona', () => {
  test('select ok → ok', async () => {
    const cliente = { from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) };
    const r = await sondarSupabase({ SUPABASE_URL: 'u' }, { supabaseAdmin: cliente });
    expect(r.nivel).toBe(NIVEIS.OK);
  });

  test('cliente não inicializado é FALHA (não "não configurado") — a URL existe mas a chave não', async () => {
    const r = await sondarSupabase({ SUPABASE_URL: 'u' }, {});
    expect(r.nivel).toBe(NIVEIS.FALHA);
  });
});

describe('falsos positivos que a primeira versão da sonda produziu em produção', () => {
  const { sondarResend, sondarAnthropic } = require('../_lib/integration-probes');

  test('Resend com chave restrita a envio é OK, não falha', () => {
    // A chave de produção é de ENVIO (menor privilégio, correto), então
    // GET /domains devolve 401 "restricted to only send emails". A v1 da sonda
    // leu isso como chave morta e pintou "e-mails quebrados" — não estavam.
    global.fetch = mockFetch({ message: 'This API key is restricted to only send emails' }, 401);
    return sondarResend({ RESEND_API_KEY: 'k' }).then((r) => {
      expect(r.nivel).toBe(NIVEIS.OK);
      expect(r.detalhe).toMatch(/restrita a envio/i);
    });
  });

  test('Resend com 401 de verdade continua sendo falha', () => {
    global.fetch = mockFetch({ message: 'API key is invalid' }, 401);
    return sondarResend({ RESEND_API_KEY: 'k' }).then((r) => {
      expect(r.nivel).toBe(NIVEIS.FALHA);
    });
  });

  test('Anthropic morta é ATENÇÃO, não falha — ela é reserva, o primário é OpenRouter', async () => {
    // Na 1ª execução em produção a Anthropic deu 401 e o veredito geral virou
    // "vermelho", quando o agente estava atendendo cliente normalmente pelo
    // OpenRouter. Métrica de emergência que grita sem emergência é ruído.
    global.fetch = mockFetch({ error: { message: 'API key is invalid' } }, 401);
    const r = await sondarAnthropic({ ANTHROPIC_API_KEY: 'k' });
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.detalhe).toMatch(/upsell/i); // diz o que REALMENTE quebra
  });
});

describe('resumir — o veredito que o fundador lê primeiro', () => {
  const s = (nome, nivel) => ({ nome, nivel, detalhe: '' });

  test('uma falha derruba o geral, mesmo com o resto verde', () => {
    const r = resumir([s('a', NIVEIS.OK), s('b', NIVEIS.OK), s('c', NIVEIS.FALHA)]);
    expect(r.geral).toBe(NIVEIS.FALHA);
    expect(r.quebradas).toEqual(['c']);
  });

  test('atenção sem falha → geral atenção', () => {
    expect(resumir([s('a', NIVEIS.OK), s('b', NIVEIS.ATENCAO)]).geral).toBe(NIVEIS.ATENCAO);
  });

  test('não-configurado NÃO polui o veredito — Twilio ausente é escolha, não defeito', () => {
    const r = resumir([s('a', NIVEIS.OK), s('twilio', NIVEIS.NAO_CONFIGURADO)]);
    expect(r.geral).toBe(NIVEIS.OK);
    expect(r.nao_configurado).toBe(1);
    expect(r.quebradas).toEqual([]);
  });
});

describe('sondarIntegracoes — diagnóstico parcial vale mais que 500', () => {
  test('uma sonda que estoura não derruba as outras', async () => {
    // fetch quebra pra todo mundo; o Supabase (que não usa fetch) segue de pé.
    global.fetch = jest.fn().mockRejectedValue(new Error('rede caiu'));
    const cliente = { from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) };

    const r = await sondarIntegracoes({
      env: { WHATSAPP_ACCESS_TOKEN: 't', SUPABASE_URL: 'u' },
      agoraMs: AGORA,
      deps: { supabaseAdmin: cliente },
    });

    expect(r.sondas.length).toBeGreaterThan(5);
    expect(r.sondas.find((x) => x.nome === 'supabase').nivel).toBe(NIVEIS.OK);
    expect(r.resumo.falha).toBeGreaterThan(0);
    expect(r.verificado_em).toBe(new Date(AGORA).toISOString());
  });

  test('ambiente vazio: tudo "não configurado", nenhum falso vermelho', async () => {
    global.fetch = jest.fn();
    const r = await sondarIntegracoes({ env: {}, agoraMs: AGORA });
    expect(global.fetch).not.toHaveBeenCalled(); // sem chave, nem chama o fornecedor
    expect(r.resumo.falha).toBe(0);
    expect(r.resumo.geral).toBe(NIVEIS.OK);
  });
});
