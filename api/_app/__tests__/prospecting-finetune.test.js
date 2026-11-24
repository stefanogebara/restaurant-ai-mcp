/**
 * Phase 6 — Olivia fine-tuning port (pure logic).
 *
 * Guards the naturalness mechanics: prospecting-aware inbound parsing (contact
 * cards, media placeholders), multi-bubble pacing, nudge eligibility, and the
 * restored prompt depth (rules 6c / 7b / 9b-9c). No network.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { extractProspectCorpo, formatarCartaoContato } = require('../_lib/prospecting/prospect-parse');
const { splitReplyParts, partPauseDelayMs } = require('../_lib/prospecting/prospect-pacing');
const { elegivelParaNudge, podeMensagemLivre, NUDGE_INSTRUCTION, NUDGE_JANELA_MS } = require('../_lib/prospecting/prospect-nudge');
const { buildSystemPrompt } = require('../_lib/prospecting/prospect-agent');

const HOUR = 60 * 60 * 1000;

// ============================================================ contact cards
describe('formatarCartaoContato (exact Olivia format)', () => {
  test('single number with name', () => {
    const contacts = [{
      name: { formatted_name: 'João Silva' },
      phones: [{ wa_id: '5521988887777' }],
    }];
    expect(formatarCartaoContato(contacts)).toBe('[Contato compartilhado: +5521988887777 | nome: João Silva]');
  });

  test('multiple numbers joined by comma, no name', () => {
    const contacts = [{ phones: [{ wa_id: '5521988887777' }, { phone: '+5511977776666' }] }];
    expect(formatarCartaoContato(contacts)).toBe('[Contato compartilhado: +5521988887777, +5511977776666]');
  });

  test('no phones → null (nothing fabricated)', () => {
    expect(formatarCartaoContato([{ name: { formatted_name: 'X' }, phones: [] }])).toBeNull();
    expect(formatarCartaoContato([])).toBeNull();
    expect(formatarCartaoContato(null)).toBeNull();
  });
});

describe('extractProspectCorpo', () => {
  test('text passes through', () => {
    expect(extractProspectCorpo({ type: 'text', text: { body: 'oi' } }))
      .toEqual({ tipo: 'text', corpo: 'oi', mediaId: null });
  });

  test('contacts becomes the shared-card line (owner-referral path)', () => {
    const msg = {
      type: 'contacts',
      contacts: [{ name: { first_name: 'Ana' }, phones: [{ wa_id: '5511955554444' }] }],
    };
    expect(extractProspectCorpo(msg).corpo).toBe('[Contato compartilhado: +5511955554444 | nome: Ana]');
  });

  test('audio defers transcription: corpo null + mediaId (placeholder on failure)', () => {
    const out = extractProspectCorpo({ type: 'audio', audio: { id: 'MEDIA1' } });
    expect(out).toEqual({ tipo: 'audio', corpo: null, mediaId: 'MEDIA1' });
  });

  test('image caption is kept; captionless image stays empty (placeholder net)', () => {
    expect(extractProspectCorpo({ type: 'image', image: { id: 'M', caption: 'cardápio' } }).corpo).toBe('cardápio');
    expect(extractProspectCorpo({ type: 'image', image: { id: 'M' } }).corpo).toBeNull();
  });

  test('sticker/unknown never fabricate content', () => {
    expect(extractProspectCorpo({ type: 'sticker', sticker: { id: 'S' } }).corpo).toBeNull();
    expect(extractProspectCorpo({ type: 'order' }).corpo).toBeNull();
  });

  test('interactive replies map to the tapped title', () => {
    const msg = { type: 'interactive', interactive: { button_reply: { title: 'Quero saber mais' } } };
    expect(extractProspectCorpo(msg).corpo).toBe('Quero saber mais');
  });
});

// ============================================================ multipart pacing
describe('multi-bubble replies', () => {
  test('splitReplyParts honors blank-line splits up to 2 parts', () => {
    // Cap lowered 3→2 (2026-07): the live data showed 55% of our messages were
    // rapid-fire bubble volleys — reads as a bot spraying, not a person.
    const dois = 'Oi! A Seatable atende o WhatsApp do restaurante com IA.\n\nPosso te mostrar em 2 min?';
    expect(splitReplyParts(dois, { multipart: true })).toHaveLength(2);
    expect(splitReplyParts(dois, { multipart: false })).toHaveLength(1);
    // 3+ blocks collapse back into one calm message (never spam bubbles)
    const tres = 'Oi!\n\nA Seatable atende o WhatsApp com IA.\n\nPosso te mostrar em 2 min?';
    expect(splitReplyParts(tres, { multipart: true })).toEqual([tres]);
    const four = 'a\n\nb\n\nc\n\nd';
    expect(splitReplyParts(four, { multipart: true })).toEqual([four]);
  });

  test('partPauseDelayMs stays within [900, 3200] with jitter', () => {
    for (const rand of [() => 0, () => 0.5, () => 1]) {
      const short = partPauseDelayMs('ok', { rand });
      const long = partPauseDelayMs('x'.repeat(500), { rand });
      expect(short).toBeGreaterThanOrEqual(900 * 0.8);
      expect(long).toBeLessThanOrEqual(3200 * 1.2);
    }
  });

  test('partPauseDelayMs is 0 in dry-run / disabled / test mode', () => {
    expect(partPauseDelayMs('texto', { dryRun: true })).toBe(0);
    expect(partPauseDelayMs('texto', { disabled: true })).toBe(0);
    expect(partPauseDelayMs('texto', { testMode: true })).toBe(0);
  });
});

// ============================================================ nudge
describe('elegivelParaNudge', () => {
  const now = Date.parse('2026-07-02T15:00:00Z');
  const base = {
    lastMsg: { direcao: 'out' },
    lastInboundAtMs: now - NUDGE_JANELA_MS - 10 * 60 * 1000, // 23h10m ago
    nudgeEmMs: null,
    nowMs: now,
  };

  test('eligible: agent spoke last, 23h+ silence, inside 24h window, never nudged', () => {
    expect(elegivelParaNudge(base)).toEqual({ eligible: true, reason: 'ok' });
  });

  test('not eligible when the lead spoke last (we owe a reply, not a nudge)', () => {
    expect(elegivelParaNudge({ ...base, lastMsg: { direcao: 'in' } }).reason).toBe('inbound_pendente');
  });

  test('not eligible before 23h of silence', () => {
    expect(elegivelParaNudge({ ...base, lastInboundAtMs: now - 2 * HOUR }).reason).toBe('silencio_curto');
  });

  test('not eligible beyond the 24h free-text window', () => {
    expect(elegivelParaNudge({ ...base, lastInboundAtMs: now - 25 * HOUR }).reason).toBe('fora_janela_24h');
  });

  test('once per silence period: a nudge after the last inbound blocks re-nudging', () => {
    const nudged = { ...base, nudgeEmMs: base.lastInboundAtMs + HOUR };
    expect(elegivelParaNudge(nudged).reason).toBe('ja_nudgado');
    // ...but a nudge from a PREVIOUS silence (before this inbound) re-arms
    const rearmed = { ...base, nudgeEmMs: base.lastInboundAtMs - 30 * HOUR };
    expect(elegivelParaNudge(rearmed).eligible).toBe(true);
  });

  test('no inbound ever → never nudge (cold intro follow-up is the sequencer, not us)', () => {
    expect(elegivelParaNudge({ ...base, lastInboundAtMs: null }).reason).toBe('sem_inbound');
  });

  test('podeMensagemLivre boundary', () => {
    expect(podeMensagemLivre(now - 23 * HOUR, now)).toBe(true);
    expect(podeMensagemLivre(now - 25 * HOUR, now)).toBe(false);
    expect(podeMensagemLivre(null, now)).toBe(false);
  });

  test('nudge instruction is an internal note that forbids tools', () => {
    expect(NUDGE_INSTRUCTION).toMatch(/INSTRUÇÃO INTERNA/);
    expect(NUDGE_INSTRUCTION).toMatch(/Não use ferramentas/);
  });
});

// ============================================================ prompt depth
describe('buildSystemPrompt — restored fine-tuning depth', () => {
  const lead = { name: 'Cantina Bella', sector: 'restaurante', city: 'São Paulo', nome_genero: 'f' };
  const prompt = buildSystemPrompt(lead);

  test('rule 6c: transcribed media is real content, never "could not hear"', () => {
    expect(prompt).toMatch(/MÍDIA QUE VOCÊ JÁ LEU/);
    expect(prompt).toMatch(/\[áudio\]/);
  });

  test('rule 7b: burst example present (read all bubbles as one)', () => {
    expect(prompt).toMatch(/quanto custa\?/);
    expect(prompt).toMatch(/bolha por bolha/);
  });

  test('rules 9b/9c: never re-ask the number, never promise contact before the tool', () => {
    expect(prompt).toMatch(/NUNCA peça o número de novo/);
    expect(prompt).toMatch(/ANTES de chamar/);
  });

  test('rule 5c: skip small talk when the person already brought a topic', () => {
    expect(prompt).toMatch(/pule a small/);
  });

  test('product block: full pay-at-table value map (Racha default), not one-liner', () => {
    // Default product is Racha (pagar na mesa por QR); the value map leads with
    // it. Flip to Seatable (PROSPECTING_PRODUCT=seatable) restores the CRM map —
    // covered in prospecting-product-profile.test.js.
    expect(prompt).toMatch(/pagar a conta na mesa/i);
    expect(prompt).toMatch(/Mesa vira mais rápido/);
    expect(prompt).toMatch(/split automático/);
    expect(prompt).toMatch(/gorjeta/i);
    expect(prompt).toMatch(/Zero fricção/);
  });

  test('product block: pitch is routed by pain, never the whole list', () => {
    expect(prompt).toMatch(/maior dor da pessoa/);
    expect(prompt).toMatch(/NUNCA despeje a lista inteira/);
  });
});

/**
 * Regressão do caso Bario Bar (07-08/08/2026).
 *
 * O porteiro entregou compras@bario.com.br. O prompt mandava tratar contato
 * entregue com registrar_responsavel — mas o schema dessa ferramenta só aceita
 * `numero`, e não existe ferramenta de e-mail. Sem rota válida, a Olímpia
 * inventou uma: "vou mandar a proposta pro compras@bario.com.br". O e-mail nunca
 * saiu, o lead ficou em 'conversando' (fora do digest, que só lê 'handoff') e o
 * endereço foi parar em prospect_email — campo que só prospect-booking lê, e o
 * Racha nem agenda reunião.
 *
 * O prompt agora precisa dizer as duas coisas: que ela NÃO envia e-mail, e para
 * onde o endereço vai (escalar_humano → handoff → digest do fundador).
 */
describe('e-mail entregue pelo porteiro — a Olímpia não promete o que não pode', () => {
  const lead = { name: 'Bar do Zé', city: 'São Paulo', sector: 'bar', nome_genero: 'm' };
  const prompt = buildSystemPrompt(lead);

  test('o prompt proíbe prometer envio de e-mail', () => {
    expect(prompt).toMatch(/VOC[ÊE] N[ÃA]O ENVIA E-MAIL/);
    expect(prompt).toMatch(/NUNCA prometa "vou mandar por/);
  });

  test('o prompt roteia e-mail pra escalar_humano, não pra registrar_responsavel', () => {
    // A rota tem que estar explícita: sem ela o modelo cai no mesmo beco.
    expect(prompt).toMatch(/E-MAIL[^.]{0,80}escalar_humano/);
    expect(prompt).toMatch(/registrar_responsavel s[óo] aceita n[úu]mero/);
  });

  test('número de WhatsApp continua indo pra registrar_responsavel', () => {
    // O conserto do e-mail não pode quebrar o caminho do número, que funciona.
    expect(prompt).toMatch(/N[ÚU]MERO de WhatsApp vai em/);
    expect(prompt).toMatch(/registrar_responsavel/);
    expect(prompt).toMatch(/jamais optout/);
  });
});
