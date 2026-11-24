'use strict';

/**
 * Modo PORTEIRO + o token 'possuímos' na recusa suave.
 *
 * Contexto (auditoria 2026-07-23, 14 conversas travadas): 44,6% das primeiras
 * respostas do funil são robô; em 8 de 14 threads a agente fez pitch para um
 * autoresponder porque pareceAutoAtendimento() só era alcançável dentro do
 * branch 'ignorar'. ecoDeMaquina() liga a detecção à decisão.
 *
 * O piso de comprimento é a condição imposta na revisão: sem ele, "ok"/"sim"/
 * "bom dia" repetidos — que humano manda o tempo todo — parqueariam um lead vivo.
 */

const {
  ecoDeMaquina, semHumanoNaThread, detectarRecusaSuave, PORTEIRO_MAX,
  ECO_MIN_PALAVRAS, ECO_MIN_CHARS,
} = require('../_lib/prospecting/prospect-state');

const inbound = (corpo) => ({ direcao: 'in', tipo: 'text', corpo });
const outbound = (corpo) => ({ direcao: 'out', tipo: 'text', corpo });

describe('ecoDeMaquina — assinatura (a): auto-atendimento institucional', () => {
  test('saudação institucional do WhatsApp Business', () => {
    expect(ecoDeMaquina([inbound('Olá! Seja bem-vindo ao nosso restaurante 😊')])).toBe(true);
  });

  test('menu de bot / link de pedido', () => {
    expect(ecoDeMaquina([inbound('Estamos fechados no momento. HORÁRIOS: De 2ª a 4ª: 12h-15h')])).toBe(true);
    expect(ecoDeMaquina([inbound('Você gostaria de *falar com atendente* ou *saber sobre emprego*?')])).toBe(true);
  });

  test('texto humano comum não dispara', () => {
    expect(ecoDeMaquina([inbound('oi, quem fala?')])).toBe(false);
    expect(ecoDeMaquina([inbound('to sem tempo agora, me chama semana que vem')])).toBe(false);
  });
});

describe('ecoDeMaquina — assinatura (b): repetição literal', () => {
  const LONGA = 'Agradecemos muito o seu contato conosco, retornaremos assim que possível para você';

  test('mensagem longa repetida caractere por caractere = máquina', () => {
    expect(LONGA.length).toBeGreaterThanOrEqual(ECO_MIN_CHARS);
    expect(ecoDeMaquina([inbound(LONGA), outbound('oi!'), inbound(LONGA)])).toBe(true);
  });

  test('repetição ignora diferença de espaçamento e caixa', () => {
    expect(ecoDeMaquina([inbound(LONGA), inbound(`  ${LONGA.toUpperCase()}  `)])).toBe(true);
  });

  test('PISO: mensagem curta repetida NÃO é máquina (humano diz "ok" o dia todo)', () => {
    for (const curta of ['ok', 'sim', 'bom dia', 'obrigada', 'ok obrigada']) {
      expect(ecoDeMaquina([inbound(curta), outbound('...'), inbound(curta)])).toBe(false);
    }
  });

  test('PISO: qualifica por palavras OU por caracteres', () => {
    // 5+ palavras, poucos caracteres → conta como repetição
    const cincoPalavras = 'a b c d e f';
    expect(cincoPalavras.split(/\s+/).length).toBeGreaterThanOrEqual(ECO_MIN_PALAVRAS);
    expect(ecoDeMaquina([inbound(cincoPalavras), inbound(cincoPalavras)])).toBe(true);
  });

  test('primeira ocorrência (sem repetição anterior) não dispara', () => {
    expect(ecoDeMaquina([inbound(LONGA)])).toBe(false);
  });
});

describe('ecoDeMaquina — só o ÚLTIMO inbound decide', () => {
  test('humano respondendo depois do bot derruba a flag', () => {
    const hist = [
      inbound('Olá! Seja bem-vindo ao nosso restaurante 😊'),
      outbound('oi! quem cuida das parcerias aí?'),
      inbound('sou eu, o dono. pode falar'),
    ];
    expect(ecoDeMaquina(hist)).toBe(false);
  });

  test('ignora linhas sys e outbound ao procurar o último inbound', () => {
    const hist = [
      inbound('sou eu, o dono. pode falar'),
      { direcao: 'sys', tipo: 'evento', corpo: '🚪 alguma coisa' },
      outbound('perfeito!'),
    ];
    expect(ecoDeMaquina(hist)).toBe(false);
  });

  test('histórico vazio / sem inbound / corpo nulo não quebra', () => {
    expect(ecoDeMaquina([])).toBe(false);
    expect(ecoDeMaquina(null)).toBe(false);
    expect(ecoDeMaquina([outbound('só a gente falou')])).toBe(false);
    expect(ecoDeMaquina([{ direcao: 'in', tipo: 'image', corpo: null }])).toBe(false);
  });
});

describe('PORTEIRO_MAX', () => {
  test('parqueia após 2 pedidos de decisor', () => {
    expect(PORTEIRO_MAX).toBe(2);
  });
});

describe('semHumanoNaThread — o predicado do sweep (limpa o denominador)', () => {
  test('thread 100% autoresponder = sem humano', () => {
    expect(semHumanoNaThread([
      inbound('Olá! Seja bem-vindo ao nosso restaurante 😊'),
      outbound('quem cuida das parcerias?'),
      inbound('Estamos fechados no momento. HORÁRIOS: De 2ª a 4ª: 12h-15h'),
    ])).toBe(true);
  });

  test('mídia sem texto (lista de transmissão) conta como máquina', () => {
    expect(semHumanoNaThread([
      { direcao: 'in', tipo: 'image', corpo: null },
      { direcao: 'in', tipo: 'image', corpo: '' },
    ])).toBe(true);
  });

  test('UMA frase humana no meio já salva a thread', () => {
    expect(semHumanoNaThread([
      inbound('Olá! Seja bem-vindo ao nosso restaurante 😊'),
      inbound('opa, aqui é o Marcos, sou o gerente. do que se trata?'),
      inbound('Estamos fechados no momento. HORÁRIOS: 12h-15h'),
    ])).toBe(false);
  });

  test('PISO herdado: "ok" repetido é humano, não robô', () => {
    expect(semHumanoNaThread([inbound('ok'), inbound('ok'), inbound('ok')])).toBe(false);
  });

  test('thread sem nenhum inbound não é classificada como máquina', () => {
    expect(semHumanoNaThread([outbound('template'), outbound('bump')])).toBe(false);
    expect(semHumanoNaThread([])).toBe(false);
  });
});

describe("recusa suave: token 'possuímos'", () => {
  test('"Já possuímos um sistema" agora é detectado (Banzeiro, 07/07)', () => {
    expect(detectarRecusaSuave('Já possuímos um sistema ☺️')).toBe(true);
  });

  test('variações de possuir', () => {
    expect(detectarRecusaSuave('já possui uma plataforma pra isso')).toBe(true);
    expect(detectarRecusaSuave('já possuímos ferramenta própria')).toBe(true);
  });

  test('não regride os casos que já funcionavam', () => {
    expect(detectarRecusaSuave('já temos um sistema de reservas')).toBe(true);
    expect(detectarRecusaSuave('não é o momento')).toBe(true);
  });

  test('intenção viva ainda cancela a recusa (não parquear comprador)', () => {
    // RECUSA_ENGAJADA: pergunta de preço junto = engajamento, não recusa
    expect(detectarRecusaSuave('já possuímos um sistema, mas quanto custa o de vocês?')).toBe(false);
  });
});
