/**
 * Prospecting backoff (2026-07) — the three changes that stop the "invasive"
 * over-pursuit the live data exposed (61% of messages asked questions; leads
 * nudged the day after a polite "no"). Pure-logic contracts:
 *   #1 persona/pacing   — bubble volley capped at 2; RITMO rules in the prompt
 *   #2 soft-decline     — detectarRecusaSuave fires on polite "no", not on
 *                         opt-out or engagement; 'recusou' is a reversible park
 *   #3 engagement taper — contarTersosSeguidos + elegivelParaNudge back off a
 *                         disengaged lead after one last gentle nudge
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { splitReplyParts } = require('../_lib/prospecting/prospect-pacing');
const {
  detectarRecusaSuave, detectarOptout, deveResponder, estadoAposAcao,
} = require('../_lib/prospecting/prospect-state');
const {
  contarTersosSeguidos, elegivelParaNudge, NUDGE_JANELA_MS,
} = require('../_lib/prospecting/prospect-nudge');
const { buildSystemPrompt } = require('../_lib/prospecting/prospect-agent');

describe('#1 pacing — bubble volley capped at 2 (was 3)', () => {
  const opts = { multipart: true };
  test('two paragraphs → two bubbles', () => {
    expect(splitReplyParts('opa, é sobre parceria\n\nquem cuida disso aí?', opts)).toHaveLength(2);
  });
  test('THREE paragraphs collapse to a single calm bubble (over the cap)', () => {
    const three = 'linha um\n\nlinha dois\n\nlinha tres';
    expect(splitReplyParts(three, opts)).toEqual([three]);
  });
  test('one paragraph stays one', () => {
    expect(splitReplyParts('só uma linha', opts)).toEqual(['só uma linha']);
  });
  test('multipart off → always one bubble', () => {
    expect(splitReplyParts('a\n\nb', {})).toEqual(['a\n\nb']);
  });
});

describe('#1 persona — RITMO rules land in the system prompt', () => {
  const prompt = buildSystemPrompt(
    { name: 'Cantina do Zé', nome_genero: 'm', sector: 'restaurante', city: 'São Paulo' },
    'sexta-feira, 10 de julho de 2026, 10:00 (horário de Brasília)',
  );
  test('caps questions at one per turn', () => {
    expect(prompt).toMatch(/UMA pergunta por turno/i);
  });
  test('forbids stacking a question + a pitch', () => {
    expect(prompt).toMatch(/empilhe/i);
  });
  test('tells the agent to recede when the lead is terse', () => {
    expect(prompt).toMatch(/RECUE/i);
  });
  test('asks for one message, not a burst of bubbles', () => {
    expect(prompt).toMatch(/UMA mensagem por turno/i);
  });
});

describe('#2 soft-decline — detectarRecusaSuave (clean stops only)', () => {
  test.each([
    'não é o caso pra gente agora',
    'obrigado, mas não',
    'já temos um sistema de reservas',
    'não vejo necessidade disso',
    'não há necessidade',
    'não é o nosso momento',
    'não é o momento',           // RECUSA_INSTRUCTION advertises this — must fire
    'não temos interesse',       // plural — slips past the singular opt-out pattern
  ])('fires on a clean polite decline: %s', (t) => {
    expect(detectarRecusaSuave(t)).toBe(true);
  });

  // The dangerous class: a decline FRAGMENT inside a live-intent message. These
  // are the HOTTEST leads — a dismissive close + park here loses the sale.
  test.each([
    'já temos um sistema, quanto custa o de vocês?', // asking OUR price
    'já temos um sistema mas queremos trocar',        // wants to switch = ideal buyer
    'funciona sem necessidade de cartão de crédito?', // product question
    'terça não é o caso, quarta sim',                 // picking a day
    'hoje não é o caso, semana que vem consigo',      // deferring, still interested
    'não é pra mim decidir, é pro meu sócio',         // handoff, not a decline
    'não é o caso?',                                   // rhetorical / curious
  ])('does NOT park an engaged / high-intent lead: %s', (t) => {
    expect(detectarRecusaSuave(t)).toBe(false);
  });

  test.each([
    'pode me mandar mais informação',
    'já temos reserva cheia hoje',  // "já temos" but not about a system → engaged
    'agora não consigo falar',       // ambiguous "not now" → taper/persona, not a close
  ])('stays quiet on a non-decline: %s', (t) => {
    expect(detectarRecusaSuave(t)).toBe(false);
  });

  test('hard opt-out is a separate, stronger path (handled upstream first)', () => {
    expect(detectarOptout('não quero mais receber')).toBe(true);
  });
});

describe('#2 recusou is a REVERSIBLE park — not silent, self-heals on reply', () => {
  test('the agent still answers a recusou lead who writes back', () => {
    expect(deveResponder('recusou')).toBe(true);
  });
  test('answering revives the lead to conversando', () => {
    expect(estadoAposAcao({ tipo: 'responder' })).toBe('conversando');
  });
});

describe('#3 taper — contarTersosSeguidos (trailing terse inbound streak)', () => {
  const out = (corpo) => ({ direcao: 'out', corpo });
  const inb = (corpo) => ({ direcao: 'in', corpo });
  test('counts consecutive short trailing replies', () => {
    const h = [inb('oi quero saber mais sobre isso tudo'), out('claro!'), inb('ok'), out('...'), inb('vou ver')];
    expect(contarTersosSeguidos(h)).toBe(2); // 'vou ver' + 'ok'; the 7-word one breaks it
  });
  test('a question breaks the streak (asking = engagement)', () => {
    expect(contarTersosSeguidos([inb('ok'), out('...'), inb('quanto?')])).toBe(0);
  });
  test('a long reply breaks the streak', () => {
    const long = 'opa isso parece muito bom vamos marcar uma call essa semana';
    expect(contarTersosSeguidos([inb('ok'), out('x'), inb(long)])).toBe(0);
  });
  test('no inbound → 0', () => {
    expect(contarTersosSeguidos([out('a'), out('b')])).toBe(0);
    expect(contarTersosSeguidos([])).toBe(0);
  });
});

describe('#3 taper — elegivelParaNudge backs off a disengaged lead', () => {
  const base = () => {
    const nowMs = Date.now();
    return {
      lastMsg: { direcao: 'out' },
      lastInboundAtMs: nowMs - (NUDGE_JANELA_MS + 30 * 60 * 1000), // ~23.5h silence, inside 24h
      nudgeEmMs: null,
      nowMs,
    };
  };
  test('first nudge still fires even when replies are terse (one last touch)', () => {
    expect(elegivelParaNudge({ ...base(), tersosSeguidos: 2, nudgeCount: 0 }).eligible).toBe(true);
  });
  test('second nudge to a terse lead is suppressed (desengajado)', () => {
    const g = elegivelParaNudge({ ...base(), tersosSeguidos: 2, nudgeCount: 1 });
    expect(g.eligible).toBe(false);
    expect(g.reason).toBe('desengajado');
  });
  test('an engaged (non-terse) lead stays nudgeable after one nudge', () => {
    expect(elegivelParaNudge({ ...base(), tersosSeguidos: 0, nudgeCount: 1 }).eligible).toBe(true);
  });
});
