/**
 * Phase 1 — the prospect agent brain (pure logic).
 *
 * These guard the load-bearing behaviors ported from Olivia: deterministic
 * opt-out (LGPD), anti-invention persona, immutable fact merge, BR owner-number
 * extraction, the Anthropic-shaped response interpreter, business-hours gating,
 * and pacing. No network — generateReply is exercised with a mocked getAI().
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { deveResponder, detectarOptout, descreverAgora, estadoAposAcao } = require('../_lib/prospecting/prospect-state');
const { mergeFatos, formatarMemoria } = require('../_lib/prospecting/prospect-facts');
const { extrairNumeroDono, normalizarNumeroBr, extrairEmail, extrairDddBr } = require('../_lib/prospecting/prospect-extract');
const { dentroDoHorario, proximaAbertura, dentroDaJanelaDisparo, computeRetornoAt } = require('../_lib/prospecting/prospect-hours');
const { pacingDelayMs } = require('../_lib/prospecting/prospect-pacing');
const {
  buildSystemPrompt, interpretResponse, historyToMessages,
  COMPANION_TEXT, comContatoFundador, FOUNDER_WHATSAPP,
} = require('../_lib/prospecting/prospect-agent');

// ============================================================ state
describe('deveResponder / detectarOptout', () => {
  test('silent states do not respond', () => {
    for (const s of ['optout', 'handoff', 'agendado', 'pausada']) expect(deveResponder(s)).toBe(false);
    for (const s of [null, undefined, 'aguardando', 'conversando', 'agendando']) expect(deveResponder(s)).toBe(true);
  });

  test('detects unambiguous opt-out', () => {
    expect(detectarOptout('pode parar de mandar mensagem')).toBe(true);
    expect(detectarOptout('não quero')).toBe(true);
    expect(detectarOptout('me tira da lista por favor')).toBe(true);
    expect(detectarOptout('STOP')).toBe(true);
    expect(detectarOptout('sem interesse')).toBe(true);
  });

  test('ambiguous / negative-but-not-optout stays false (handled by LLM)', () => {
    expect(detectarOptout('não')).toBe(false);
    expect(detectarOptout('não sou o dono')).toBe(false);
    expect(detectarOptout('oi, tudo bem?')).toBe(false);
    expect(detectarOptout('')).toBe(false);
    expect(detectarOptout(null)).toBe(false);
  });

  test('"não quero X" onde X não é o contato NÃO é opt-out (gym 2026-07-07: dona engajada foi descadastrada)', () => {
    expect(detectarOptout('E se der ruim, como que eu paro essa IA? Não quero ela falando besteira pelo meu restaurante')).toBe(false);
    expect(detectarOptout('não quero perder reservas')).toBe(false);
    expect(detectarOptout('não quero pagar caro nisso')).toBe(false);
    expect(detectarOptout('não quero que o cliente espere')).toBe(false);
  });

  test('"não quero" mirando o próprio contato continua opt-out', () => {
    expect(detectarOptout('não quero')).toBe(true);
    expect(detectarOptout('não quero mais')).toBe(true);
    expect(detectarOptout('não quero receber mensagens')).toBe(true);
    expect(detectarOptout('não quero nada disso')).toBe(true);
    expect(detectarOptout('não quero saber')).toBe(true);
    expect(detectarOptout('não quero conversar')).toBe(true);
    expect(detectarOptout('não tenho interesse')).toBe(true);
  });

  test('descreverAgora is deterministic and in Brasília time', () => {
    const ms = Date.parse('2026-06-25T17:00:00Z'); // 14:00 BRT
    expect(descreverAgora(ms)).toBe(descreverAgora(ms));
    expect(descreverAgora(ms)).toMatch(/Brasília/);
    expect(descreverAgora(ms)).toMatch(/14:00/);
  });

  test('estadoAposAcao maps actions to next state', () => {
    expect(estadoAposAcao({ tipo: 'optout' })).toBe('optout');
    expect(estadoAposAcao({ tipo: 'handoff' })).toBe('handoff');
    expect(estadoAposAcao({ tipo: 'agendar' })).toBe('agendando');
    expect(estadoAposAcao({ tipo: 'responder' })).toBe('conversando');
    expect(estadoAposAcao({ tipo: 'ignorar' })).toBeNull();
    expect(estadoAposAcao({ tipo: 'nada' })).toBeNull();
  });
});

// ============================================================ facts
describe('mergeFatos (immutable)', () => {
  test('does not mutate prev; overwrites scalars; unions+dedups lists', () => {
    const prev = { email: 'a@x.com', objecoes: ['caro'] };
    const next = mergeFatos(prev, { email: 'b@x.com', objecoes: ['caro', 'já uso outro'], is_dono: true });
    expect(prev).toEqual({ email: 'a@x.com', objecoes: ['caro'] }); // unchanged
    expect(next.email).toBe('b@x.com');
    expect(next.objecoes).toEqual(['caro', 'já uso outro']);
    expect(next.is_dono).toBe(true);
  });

  test('empty merge returns equivalent copy (new array refs)', () => {
    const prev = { objecoes: ['x'] };
    const next = mergeFatos(prev, null);
    expect(next).toEqual(prev);
    expect(next.objecoes).not.toBe(prev.objecoes);
  });

  test('formatarMemoria renders only known facts, [] when empty', () => {
    expect(formatarMemoria(null, null)).toEqual([]);
    const lines = formatarMemoria({ is_dono: true, nome_responsavel: 'João' }, 'resumo x');
    expect(lines.join('\n')).toMatch(/É o dono/);
    expect(lines.join('\n')).toMatch(/João/);
    expect(lines.join('\n')).toMatch(/resumo x/);
  });
});

// ============================================================ extraction
describe('BR owner-number / email extraction', () => {
  test('shared contact card → E.164', () => {
    expect(extrairNumeroDono('[Contato compartilhado: 5511999998888]')).toBe('+5511999998888');
  });
  test('number (almost) alone in text → E.164', () => {
    expect(extrairNumeroDono('11 99999-8888')).toBe('+5511999998888');
    expect(extrairNumeroDono('Falar com Edson 11 99947-5069')).toBe('+5511999475069');
  });
  test('number mid-sentence → null (anti false-positive)', () => {
    expect(extrairNumeroDono('liguei pro 11 99999-8888 ontem pra resolver aquele problemão do fornecedor todo')).toBeNull();
  });
  test('normalizarNumeroBr rejects implausible numbers', () => {
    expect(normalizarNumeroBr('123')).toBeNull();
    expect(normalizarNumeroBr('+1 415 555 2671')).toBeNull(); // non-BR
    expect(normalizarNumeroBr('48 98005-3386')).toBe('+5548980053386');
  });
  test('extrairDddBr / extrairEmail', () => {
    expect(extrairDddBr('+5511999998888')).toBe('11');
    expect(extrairEmail('meu email é Joao@Test.COM ok?')).toBe('joao@test.com');
    expect(extrairEmail('sem email aqui')).toBeNull();
  });
});

// ============================================================ persona
describe('buildSystemPrompt', () => {
  const lead = { name: 'Cantina Bella', city: 'São Paulo', sector: 'restaurante italiano' };

  test('is deterministic and Seatable-branded', () => {
    const a = buildSystemPrompt(lead, descreverAgora(Date.parse('2026-06-25T17:00:00Z')));
    const b = buildSystemPrompt(lead, descreverAgora(Date.parse('2026-06-25T17:00:00Z')));
    expect(a).toBe(b);
    expect(a).toMatch(/Seatable/);
    expect(a).toMatch(/seatable\.one/);
    expect(a).toMatch(/Cantina Bella/);
    expect(a).toMatch(/São Paulo/);
  });

  test('carries the anti-invention rules and no fabricated cases by default', () => {
    const p = buildSystemPrompt(lead);
    expect(p).toMatch(/NUNCA invente/);
    expect(p).not.toMatch(/Já roda em/); // PROSPECTING_CASES unset → never invent customers
  });
});

// ============================================================ interpreter
describe('interpretResponse (Anthropic shape)', () => {
  const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
  const tool = (name, input) => ({ content: [{ type: 'tool_use', id: 't1', name, input }], stop_reason: 'tool_use' });

  test('plain text → responder', () => {
    expect(interpretResponse(text('Oi! Tudo bem?'))).toEqual({ tipo: 'responder', texto: 'Oi! Tudo bem?' });
  });
  test('tool_use maps to actions', () => {
    expect(interpretResponse(tool('marcar_optout', {})).tipo).toBe('optout');
    expect(interpretResponse(tool('ignorar', { motivo: 'figurinha' }))).toEqual({ tipo: 'ignorar', motivo: 'figurinha' });
    expect(interpretResponse(tool('escalar_humano', { motivo: 'preço' }))).toMatchObject({ tipo: 'handoff', motivo: 'preço' });
    expect(interpretResponse(tool('agendar_demo', { resumo_disponibilidade: 'amanhã à tarde' }))).toMatchObject({ tipo: 'agendar', resumo: 'amanhã à tarde' });
    expect(interpretResponse(tool('registrar_responsavel', { numero: '11999998888', nome: 'Ana' }))).toMatchObject({ tipo: 'registrar_responsavel', numero: '11999998888', nome: 'Ana' });
  });
  test('registrar_responsavel without number → handoff (anti-invention)', () => {
    expect(interpretResponse(tool('registrar_responsavel', {})).tipo).toBe('handoff');
  });
  test('agendar_retorno → dated-callback action (quando + non-empty confirmation)', () => {
    const r = interpretResponse(tool('agendar_retorno', { quando: 'amanhã de tarde' }));
    expect(r).toMatchObject({ tipo: 'agendar_retorno', quando: 'amanhã de tarde' });
    expect(r.texto).toBeTruthy(); // companion so the confirmation is never silent
  });
  test('criar_demo → criar_demo action; text passes through, else companion (never empty)', () => {
    // No lead-in text → deterministic companion so the turn is never silent.
    const bare = interpretResponse(tool('criar_demo', {}));
    expect(bare.tipo).toBe('criar_demo');
    expect(bare.texto).toBeTruthy();
    // Model wrote a lead-in bubble → passed through (responder strips any URL).
    const withText = {
      content: [
        { type: 'text', text: 'consigo montar sim' },
        { type: 'tool_use', id: 't1', name: 'criar_demo', input: {} },
      ],
      stop_reason: 'tool_use',
    };
    expect(interpretResponse(withText)).toEqual({ tipo: 'criar_demo', texto: 'consigo montar sim' });
  });
  test('truncated text-only → nada (never send a half message)', () => {
    expect(interpretResponse({ content: [{ type: 'text', text: 'meia frase' }], stop_reason: 'max_tokens' }).tipo).toBe('nada');
  });
  test('empty content → nada', () => {
    expect(interpretResponse({ content: [], stop_reason: 'end_turn' }).tipo).toBe('nada');
  });
});

// ============================================================ contato do fundador
// Regra (Stefano, 2026-07-20): pedir humano / indicar responsável / pedir contato
// NUNCA termina em beco sem saída — a resposta sai com o WhatsApp do fundador.
describe('contato do fundador em handoff/indicação', () => {
  const digits = (s) => String(s || '').replace(/\D+/g, '');
  const FD = digits(FOUNDER_WHATSAPP);
  const toolWithText = (name, input, texto) => ({
    content: [
      { type: 'text', text: texto },
      { type: 'tool_use', id: 't1', name, input },
    ],
    stop_reason: 'tool_use',
  });

  test('default é o número pessoal do Stefano', () => {
    expect(FD).toBe('5511999002121');
  });

  test('COMPANION_TEXT de handoff e indicação carregam o número', () => {
    expect(digits(COMPANION_TEXT.handoff)).toContain(FD);
    expect(digits(COMPANION_TEXT.registrar('Ana'))).toContain(FD);
    expect(digits(COMPANION_TEXT.registrar(null))).toContain(FD);
    expect(COMPANION_TEXT.registrar('Ana')).toMatch(/Ana/);
  });

  test('comContatoFundador: anexa quando falta, não duplica quando já tem (qualquer formatação)', () => {
    expect(comContatoFundador(null, 'linha')).toBeNull();
    expect(comContatoFundador('  ', 'linha')).toBeNull();
    const appended = comContatoFundador('vou verificar com o time', 'fale com o fundador: ' + FOUNDER_WHATSAPP);
    expect(appended).toMatch(/^vou verificar com o time\n/);
    expect(digits(appended)).toContain(FD);
    // já presente, escrito sem formatação → intocado (checagem por dígitos)
    const cru = `pode chamar o fundador no +${FD}`;
    expect(comContatoFundador(cru, 'linha extra')).toBe(cru);
  });

  test('escalar_humano com texto do modelo SEM o número → número anexado', () => {
    const r = interpretResponse(toolWithText('escalar_humano', { motivo: 'preço' }, 'boa pergunta, vou confirmar aqui'));
    expect(r.tipo).toBe('handoff');
    expect(digits(r.texto)).toContain(FD);
    expect(r.texto).toMatch(/^boa pergunta, vou confirmar aqui\n/);
  });

  test('escalar_humano com texto que JÁ traz o número → texto preservado sem duplicar', () => {
    const texto = `claro! o fundador atende direto: +${FD}`;
    const r = interpretResponse(toolWithText('escalar_humano', { motivo: 'quer humano' }, texto));
    expect(r.texto).toBe(texto);
  });

  test('registrar_responsavel: texto do modelo ganha o número; sem texto, companion já o carrega', () => {
    const comTexto = interpretResponse(toolWithText('registrar_responsavel', { numero: '11999998888', nome: 'Ana' }, 'perfeito, já chamo ela'));
    expect(digits(comTexto.texto)).toContain(FD);
    expect(comTexto.texto).toMatch(/Ana/);
    const semTexto = interpretResponse({ content: [{ type: 'tool_use', id: 't1', name: 'registrar_responsavel', input: { numero: '11999998888' } }], stop_reason: 'tool_use' });
    expect(digits(semTexto.texto)).toContain(FD);
  });

  test('registrar_responsavel sem número (handoff) mantém o pedido do modelo + número', () => {
    const r = interpretResponse(toolWithText('registrar_responsavel', {}, 'me passa o contato dela?'));
    expect(r.tipo).toBe('handoff');
    expect(digits(r.texto)).toContain(FD);
  });

  test('buildSystemPrompt carrega a regra 11 com o número', () => {
    const p = buildSystemPrompt({ name: 'Cantina Bella' });
    expect(digits(p)).toContain(FD);
    expect(p).toMatch(/CONTATO DO FUNDADOR/);
    expect(p).toMatch(/ÚNICO número/);
  });

  test('guarda de número estranho NÃO arranca o contato do fundador da resposta (whitelist)', async () => {
    jest.resetModules();
    jest.doMock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
    }));
    const texto = `pode falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`;
    const create = jest.fn(async () => ({ content: [{ type: 'text', text: texto }], stop_reason: 'end_turn' }));
    jest.doMock('../_lib/ai-client', () => ({ AI_MODEL: 'm', getAI: () => ({ messages: { create } }) }));
    const { generateReply } = require('../_lib/prospecting/prospect-agent');
    const acao = await generateReply({
      lead: { name: 'X', whatsapp_phone: '+5511987654321' },
      history: [{ direcao: 'in', corpo: 'como falo com vocês?' }], // número do fundador NÃO está no histórico
      nowMs: Date.parse('2026-06-25T17:00:00Z'),
    });
    expect(acao).toEqual({ tipo: 'responder', texto });
    expect(create).toHaveBeenCalledTimes(1); // sem retry corretivo — o número é permitido
    jest.resetModules();
  });
});

describe('prospect-demo (prévia helpers)', () => {
  const { previaLinkInHistory, sectorToType, buildScrapedData } = require('../_lib/prospecting/prospect-demo');

  test('previaLinkInHistory reuses an already-sent prévia link (idempotency, no dup demos)', () => {
    const found = previaLinkInHistory([
      { direcao: 'out', corpo: 'oi!' },
      { direcao: 'in', corpo: 'quero ver' },
      { direcao: 'out', corpo: 'é essa aqui 👇\nhttps://seatable.one/previa/abc12345-6789?wa=5511' },
    ]);
    expect(found).toMatch(/\/previa\/abc12345/);
    expect(previaLinkInHistory([{ corpo: 'sem link nenhum' }])).toBeNull();
    expect(previaLinkInHistory(null)).toBeNull();
  });

  test('sectorToType maps discovery sectors onto the restaurant_type enum', () => {
    expect(sectorToType('cantina italiana')).toBe('italian');
    expect(sectorToType('sushi bar')).toBe('japanese'); // japanese wins over bar (checked first)
    expect(sectorToType('churrascaria premium')).toBe('steakhouse');
    expect(sectorToType('boteco')).toBe('bar');
    expect(sectorToType('restaurante')).toBe('casual_dining');
    expect(sectorToType(null)).toBe('casual_dining');
  });

  test('buildScrapedData carries the Google fields the prévia hero renders', () => {
    const sd = buildScrapedData({ name: 'Bar do Zé', rating: 4.6, reviews_count: 142, address: 'R. X', sector: 'bar' });
    expect(sd).toMatchObject({ name: 'Bar do Zé', rating: 4.6, review_count: 142, address: 'R. X' });
    // Missing rating collapses to null (hero hides the pill), never NaN/undefined.
    expect(buildScrapedData({ name: 'X' }).rating).toBeNull();
  });
});

describe('historyToMessages', () => {
  test('maps direcao→role and injects placeholder for unreadable inbound media', () => {
    const msgs = historyToMessages([
      { direcao: 'out', corpo: 'Oi!' },
      { direcao: 'in', corpo: 'tudo bem' },
      { direcao: 'in', corpo: null, tipo: 'audio' },
      { direcao: 'out', corpo: null, tipo: 'text' }, // empty outbound skipped
    ]);
    expect(msgs).toEqual([
      { role: 'assistant', content: 'Oi!' },
      { role: 'user', content: 'tudo bem' },
      { role: 'user', content: '[a pessoa enviou um áudio que não consegui ouvir]' },
    ]);
  });
});

// ============================================================ hours + pacing
describe('business hours + pacing', () => {
  test('dentroDoHorario respects Brasília weekday window', () => {
    expect(dentroDoHorario(Date.parse('2026-06-25T17:00:00Z'))).toBe(true);  // Thu 14:00 BRT
    expect(dentroDoHorario(Date.parse('2026-06-25T03:00:00Z'))).toBe(false); // Thu 00:00 BRT
    expect(dentroDoHorario(Date.parse('2026-06-27T17:00:00Z'))).toBe(false); // Sat
  });
  test('proximaAbertura lands inside business hours', () => {
    const next = proximaAbertura(Date.parse('2026-06-27T17:00:00Z')); // Sat afternoon
    expect(dentroDoHorario(next)).toBe(true);
  });
  test('computeRetornoAt parses pt-BR "quando" into a clamped future BRT slot', () => {
    const thu10 = Date.parse('2026-06-25T13:00:00Z'); // Thu 10:00 BRT
    // "amanhã" → Fri 11:00 BRT (14:00 UTC), the default mid-morning hour
    expect(computeRetornoAt('amanhã', thu10)).toBe('2026-06-26T14:00:00.000Z');
    // "amanhã de tarde" → Fri 14:00 BRT (17:00 UTC)
    expect(computeRetornoAt('amanhã de tarde', thu10)).toBe('2026-06-26T17:00:00.000Z');
    // "segunda" → next Monday 11:00 BRT
    expect(computeRetornoAt('segunda', thu10)).toBe('2026-06-29T14:00:00.000Z');
    // explicit hour "às 15h" → tomorrow 15:00 BRT (18:00 UTC)
    expect(computeRetornoAt('me chama às 15h', thu10)).toBe('2026-06-26T18:00:00.000Z');
    // unparseable → tomorrow default (never null / never past)
    expect(computeRetornoAt('sei lá quando', thu10)).toBe('2026-06-26T14:00:00.000Z');
  });
  test('computeRetornoAt self-corrects weekend/off-hours into the next valid slot', () => {
    const fri10 = Date.parse('2026-06-26T13:00:00Z'); // Fri 10:00 BRT
    const iso = computeRetornoAt('amanhã', fri10); // Sat → must roll to Monday
    expect(dentroDaJanelaDisparo(Date.parse(iso))).toBe(true);
    expect(Date.parse(iso)).toBeGreaterThan(fri10);
  });
  test('dentroDaJanelaDisparo is TIGHTER than the reply window (10-17 weekday)', () => {
    // Thu 14:00 BRT — inside both reply (9-19) and dispatch (10-17)
    expect(dentroDaJanelaDisparo(Date.parse('2026-06-25T17:00:00Z'))).toBe(true);
    // Thu 01:24 BRT (the study's "intros à 01:24") — outside dispatch
    expect(dentroDaJanelaDisparo(Date.parse('2026-06-25T04:24:00Z'))).toBe(false);
    // Thu 18:00 BRT — INSIDE reply window but OUTSIDE dispatch (dinner approaching)
    expect(dentroDoHorario(Date.parse('2026-06-25T21:00:00Z'))).toBe(true);
    expect(dentroDaJanelaDisparo(Date.parse('2026-06-25T21:00:00Z'))).toBe(false);
    // Sat 14:00 BRT — weekend, no cold dispatch
    expect(dentroDaJanelaDisparo(Date.parse('2026-06-27T17:00:00Z'))).toBe(false);
  });
  test('pacingDelayMs: 0 on dryRun, bounded, deterministic with rand', () => {
    expect(pacingDelayMs('hello', { dryRun: true })).toBe(0);
    expect(pacingDelayMs('', { rand: () => 0.5 })).toBe(1800);              // floor
    expect(pacingDelayMs('x'.repeat(1000), { rand: () => 0.5 })).toBe(9000); // ceiling
  });
});

// ============================================================ generateReply (mocked LLM)
describe('generateReply (mocked getAI)', () => {
  afterEach(() => jest.resetModules());

  test('returns the interpreted action from the LLM response', async () => {
    jest.resetModules();
    jest.doMock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
    }));
    jest.doMock('../_lib/ai-client', () => ({
      AI_MODEL: 'test-model',
      getAI: () => ({ messages: { create: async () => ({ content: [{ type: 'text', text: 'Oi, tudo bem?' }], stop_reason: 'end_turn' }) } }),
    }));
    const { generateReply } = require('../_lib/prospecting/prospect-agent');
    const acao = await generateReply({
      lead: { name: 'X' },
      history: [{ direcao: 'in', corpo: 'oi' }],
      nowMs: Date.parse('2026-06-25T17:00:00Z'),
    });
    expect(acao).toEqual({ tipo: 'responder', texto: 'Oi, tudo bem?' });
  });

  test('empty history short-circuits without calling the LLM', async () => {
    jest.resetModules();
    jest.doMock('../_lib/secure-logger', () => ({
      createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
    }));
    const create = jest.fn();
    jest.doMock('../_lib/ai-client', () => ({ AI_MODEL: 'm', getAI: () => ({ messages: { create } }) }));
    const { generateReply } = require('../_lib/prospecting/prospect-agent');
    const acao = await generateReply({ lead: { name: 'X' }, history: [], nowMs: 1 });
    expect(acao.tipo).toBe('nada');
    expect(create).not.toHaveBeenCalled();
  });
});
