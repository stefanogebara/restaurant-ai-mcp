/**
 * Cycle-11 runtime guards (pure logic).
 *
 * The gym showed (cycles 7-10) that tool-without-text and mangled phone digits
 * survive every prompt formulation — they are runtime variance, so they get
 * deterministic code guards. These tests pin those guards' contracts:
 *  - optout/handoff actions ALWAYS carry a companion bubble;
 *  - phone-like digit runs absent from the conversation are flagged (± the 55
 *    country prefix), and offending bubbles can be stripped.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const {
  interpretResponse, findForeignPhones, stripForeignPhoneBubbles,
} = require('../_lib/prospecting/prospect-agent');

describe('companion-text guard — tool actions never go out silent', () => {
  test('marcar_optout without text gets the deterministic goodbye', () => {
    const acao = interpretResponse({ content: [{ type: 'tool_use', name: 'marcar_optout', input: {} }] });
    expect(acao.tipo).toBe('optout');
    expect(acao.texto).toMatch(/não te mando mais nada/);
  });

  test('escalar_humano without text gets the deterministic promise', () => {
    const acao = interpretResponse({ content: [{ type: 'tool_use', name: 'escalar_humano', input: { motivo: 'preço' } }] });
    expect(acao.tipo).toBe('handoff');
    expect(acao.texto).toMatch(/confirmar direitinho/);
  });

  test('model-provided text is kept, never overwritten', () => {
    const acao = interpretResponse({
      content: [
        { type: 'text', text: 'tranquilo, abraço!' },
        { type: 'tool_use', name: 'marcar_optout', input: {} },
      ],
    });
    expect(acao.texto).toBe('tranquilo, abraço!');
  });
});

describe('findForeignPhones — mangled-digit detection', () => {
  test('flags a phone the conversation never mentioned', () => {
    expect(findForeignPhones('me chama no 11 98877-6655', 'historico sem numero'))
      .toEqual(['11988776655']);
  });

  test('accepts a number the lead wrote, regardless of formatting', () => {
    expect(findForeignPhones('anoto o (11) 98877-6655 então', 'lead: fala com ele no 11 98877 6655'))
      .toEqual([]);
  });

  test('± the 55 country prefix is the same number', () => {
    expect(findForeignPhones('liga pra +55 11 91018-9842', 'bot: nos chame aqui (11) 91018-9842')).toEqual([]);
    expect(findForeignPhones('anota o 11 91018-9842', 'contato: +55 11 91018 9842')).toEqual([]);
  });

  test('prices, times and short numbers never trigger', () => {
    expect(findForeignPhones('fica R$ 1.497/mês, uns R$ 16 por dia, te chamo às 14h40', 'sem numeros')).toEqual([]);
  });

  test('spaced-out digits still resolve to one run', () => {
    expect(findForeignPhones('anota: 11 9 8877 6655', 'outro papo')).toEqual(['11988776655']);
  });
});

describe('stripForeignPhoneBubbles — surgical removal', () => {
  test('drops only the offending bubble', () => {
    const texto = 'oi tudo bem\n\nchama no 11988776655\n\nfechado?';
    expect(stripForeignPhoneBubbles(texto, ['11988776655'])).toBe('oi tudo bem\n\nfechado?');
  });

  test('no offenders → untouched', () => {
    expect(stripForeignPhoneBubbles('oi\n\ntudo bem', [])).toBe('oi\n\ntudo bem');
  });
});

describe('tool-argument guard — registrar numero must come from the conversation', () => {
  // The guard lives in generateReply post-processing; its decision logic is
  // findForeignPhones over the tool arg. These pin the arg-level contract.
  test('an invented arg number is foreign to the conversation', () => {
    expect(findForeignPhones('11 96666-5544', 'lead: quem decide é o Beto, sócio')).toEqual(['11966665544']);
  });

  test('an arg echoing the lead-provided number is accepted', () => {
    expect(findForeignPhones('+55 11 98877-6655', 'lead: anota o zap dele 11 98877-6655')).toEqual([]);
  });
});

describe('companion-text guard — registrar/agendar also never silent', () => {
  test('registrar without text acks with the referred name', () => {
    const acao = interpretResponse({ content: [{ type: 'tool_use', name: 'registrar_responsavel', input: { numero: '11 98877-6655', nome: 'Beto' } }] });
    expect(acao.texto).toMatch(/já chamo Beto/);
  });

  test('agendar without text confirms the lead-provided slot', () => {
    const acao = interpretResponse({ content: [{ type: 'tool_use', name: 'agendar_demo', input: { resumo_disponibilidade: 'segunda 10h' } }] });
    expect(acao.texto).toMatch(/segunda 10h/);
  });

  test('agendar without any slot falls back to asking for one', () => {
    const acao = interpretResponse({ content: [{ type: 'tool_use', name: 'agendar_demo', input: {} }] });
    expect(acao.texto).toMatch(/qual dia e horário/);
  });
});

const { pareceAutoAtendimento, deveEnviarPorta } = require('../_lib/prospecting/prospect-state');

describe('gatekeeper door — auto-attendant detection (real first-dispatch fixtures)', () => {
  const BOTS = [
    'Refúgio Restaurante agradece sua preferência! Em alguns instantes nossa equipe vai lhe atender!',
    'Seja bem vindo ao TUJU! Agradecemos seu contato e vamos te responder o quanto antes.',
    'Bem vindo a Bela Tucci🍝🍷 Faça seu pedido através do link https://oia.99app.com/x',
    'Nossos horários de funcionamento: Terça a sexta — 12h às 15h. Reservas exclusivamente pelo link:',
    'Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.',
    'Estamos desativando esse número e para mais informações nos chame aqui (11) 91018-9842 💛',
  ];
  test.each(BOTS)('flags: %s', (txt) => {
    expect(pareceAutoAtendimento(txt)).toBe(true);
  });

  test('human replies never match', () => {
    for (const txt of [
      'E aí, pode sim', 'quanto custa isso?', 'vocês insistem hein kkk',
      'Sou o responsável', 'não tô interessado não, obrigado',
      'quem decide é o Beto, fala com ele',
    ]) expect(pareceAutoAtendimento(txt)).toBe(false);
  });
});

describe('gatekeeper door — thread qualification (once by construction)', () => {
  const tpl = { direcao: 'out', tipo: 'template', corpo: '[template:olimpia_apresentacao]' };
  const bot = { direcao: 'in', tipo: 'text', corpo: 'Agradecemos seu contato. Nosso horário de atendimento: 12h às 23h' };
  const humano = { direcao: 'in', tipo: 'text', corpo: 'oi, quem fala?' };
  const porta = { direcao: 'out', tipo: 'text', corpo: 'oi! não é pedido não — é sobre parceria 🙂 quem cuida das reservas ou parcerias por aí?' };

  test('template out + only bot noise in → send the door-line', () => {
    expect(deveEnviarPorta([tpl, bot])).toBe(true);
    expect(deveEnviarPorta([tpl, bot, bot])).toBe(true);
  });

  test('any human voice disqualifies (the LLM owns the conversation)', () => {
    expect(deveEnviarPorta([tpl, bot, humano])).toBe(false);
    expect(deveEnviarPorta([tpl, humano])).toBe(false);
  });

  test('a previous non-template outbound disqualifies (door-line is once)', () => {
    expect(deveEnviarPorta([tpl, bot, porta, bot])).toBe(false);
  });

  test('no inbound at all → nothing to answer', () => {
    expect(deveEnviarPorta([tpl])).toBe(false);
    expect(deveEnviarPorta([])).toBe(false);
  });
});

test('delivery-menu bots match too (Mica Izakaya real fixture)', () => {
  expect(pareceAutoAtendimento('Olá! Tudo bem?😊 Um minuto e já te atendemos! Aproveitamos para informar Entregas - 99Food, iFood')).toBe(true);
});
