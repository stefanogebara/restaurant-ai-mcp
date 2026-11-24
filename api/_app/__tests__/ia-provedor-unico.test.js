'use strict';

/**
 * Rodar com UM provedor de IA é uma escolha, não um defeito.
 *
 * Decisão do fundador (30/jul): o OpenRouter é o provedor primário e não haverá
 * chave de reserva da Anthropic. A chave antiga estava revogada há meses e o
 * único efeito visível era o painel acusando amarelo eternamente — alerta que se
 * aprende a ignorar é pior que alerta que não existe (regra 2 do módulo de
 * sondas, a mesma que já vale para o Twilio).
 *
 * Dois invariantes, e o primeiro é o perigoso:
 *
 *  1. ANTHROPIC_API_KEY NÃO pode estar em CRITICAL_VARS. Esse módulo LANÇA em
 *     produção quando falta uma crítica, e roda no import — então listar uma
 *     variável opcional ali derruba toda função que o importa. Remover a
 *     variável da Vercel sem este conserto seria um apagão.
 *  2. A sonda reporta a ausência como "não configurado", nunca como falha ou
 *     atenção; mas uma chave PRESENTE e recusada continua sendo aviso (aí
 *     alguém quis reserva e ela não funciona).
 */

const { CRITICAL_VARS } = require('../_lib/validate-env');
const { sondarAnthropic, NIVEIS, resumir } = require('../_lib/integration-probes');

describe('ANTHROPIC_API_KEY não é crítica', () => {
  test('não aparece em CRITICAL_VARS', () => {
    expect(CRITICAL_VARS).not.toContain('ANTHROPIC_API_KEY');
  });

  test('OPENROUTER_API_KEY continua crítica — é o provedor primário', () => {
    // O inverso importa tanto quanto: sem OpenRouter agora não há IA nenhuma.
    expect(CRITICAL_VARS).toContain('OPENROUTER_API_KEY');
  });
});

describe('a sonda trata ausência como escolha', () => {
  let fetchOriginal;
  beforeEach(() => { fetchOriginal = global.fetch; });
  afterEach(() => { global.fetch = fetchOriginal; });

  test('sem a chave: "não configurado", e NENHUMA chamada de rede', async () => {
    global.fetch = jest.fn();
    const r = await sondarAnthropic({});
    expect(r.nivel).toBe(NIVEIS.NAO_CONFIGURADO);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.detalhe).toMatch(/por opção/);
  });

  test('não configurado NÃO deixa o veredito geral amarelo', () => {
    // O ponto da mudança: o painel precisa ficar verde quando tudo que existe
    // está saudável e o que falta é deliberado.
    const resumo = resumir([
      { nome: 'a', nivel: NIVEIS.OK },
      { nome: 'ia_reserva_anthropic', nivel: NIVEIS.NAO_CONFIGURADO },
    ]);
    expect(resumo.geral).toBe(NIVEIS.OK);
    expect(resumo.nao_configurado).toBe(1);
    expect(resumo.atencao).toBe(0);
    expect(resumo.falha).toBe(0);
  });

  test('chave PRESENTE e recusada continua sendo atenção', async () => {
    // Não configurar é escolha; configurar errado é problema.
    global.fetch = jest.fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'API key is invalid.' } }),
    }));
    const r = await sondarAnthropic({ ANTHROPIC_API_KEY: 'sk-ant-morta' });
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.detalhe).toMatch(/sem reserva/i);
  });

  test('chave presente e válida é ok', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, json: async () => ({ data: [] }),
    }));
    const r = await sondarAnthropic({ ANTHROPIC_API_KEY: 'sk-ant-viva' });
    expect(r.nivel).toBe(NIVEIS.OK);
  });
});
