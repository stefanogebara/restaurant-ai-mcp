'use strict';

/**
 * Phase 4b-ii — booking orchestrator tests. The I/O (gcal) paths are exercised
 * live in production; here we test the credential gate, rep parsing, and the
 * deterministic choice parser (the part that decides which slot the lead picked —
 * the LLM never invents a meeting time).
 */

const booking = require('../_lib/prospecting/prospect-booking');
const agenda = require('../_lib/prospecting/prospect-agenda');

const ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'PROSPECTING_REP_EMAILS'];
let saved;
beforeEach(() => { saved = {}; for (const k of ENV) saved[k] = process.env[k]; });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('bookingDisponivel — credential gate', () => {
  it('false unless all creds + ≥1 rep are set', () => {
    for (const k of ENV) delete process.env[k];
    expect(booking.bookingDisponivel()).toBe(false);
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    process.env.GOOGLE_REFRESH_TOKEN = 'z';
    expect(booking.bookingDisponivel()).toBe(false); // no reps yet
    process.env.PROSPECTING_REP_EMAILS = 'stefanogebara@gmail.com';
    expect(booking.bookingDisponivel()).toBe(true);
  });
});

describe('repEmails — parse + normalize', () => {
  it('splits, trims, lowercases, drops empties', () => {
    process.env.PROSPECTING_REP_EMAILS = ' A@x.com , b@x.com ,, ';
    expect(booking.repEmails()).toEqual(['a@x.com', 'b@x.com']);
    delete process.env.PROSPECTING_REP_EMAILS;
    expect(booking.repEmails()).toEqual([]);
  });
});

describe('escolherSlot — deterministic choice parser', () => {
  const NOW = Date.parse('2026-06-29T12:00:00Z');
  const slots = [
    { iso: '2026-06-30T13:00:00.000Z', reps: ['a@x'] },
    { iso: '2026-06-30T17:00:00.000Z', reps: ['a@x'] },
    { iso: '2026-07-01T13:00:00.000Z', reps: ['a@x'] },
  ];

  it('numbered selection ("o 2", "1")', () => {
    expect(booking.escolherSlot('pode ser o 2', slots, NOW)).toEqual({ tipo: 'slot', slot: slots[1] });
    expect(booking.escolherSlot('1', slots, NOW)).toEqual({ tipo: 'slot', slot: slots[0] });
  });

  it('a stated time matching a proposed slot → that slot', () => {
    const terca = agenda.parseHorarioSugerido('terça às 15h', NOW).iso;
    const withTerca = [{ iso: terca, reps: ['a@x'] }, ...slots];
    const r = booking.escolherSlot('pode ser terça às 15h', withTerca, NOW);
    expect(r.tipo).toBe('slot');
    expect(r.slot.iso).toBe(terca);
  });

  it('a stated time NOT among the proposals → a new time to verify', () => {
    const terca = agenda.parseHorarioSugerido('terça às 15h', NOW).iso;
    expect(booking.escolherSlot('terça às 15h', slots, NOW)).toEqual({ tipo: 'novo', iso: terca });
  });

  it('an uninterpretable reply → null (caller falls through to the LLM)', () => {
    expect(booking.escolherSlot('sei lá, qualquer um', slots, NOW)).toBe(null);
  });
});

// ---- Email-before-invite dance (formatarPedidoEmail port) -----------------------
// The invite only lands in the prospect's calendar if we have their email as an
// attendee. Ask ONCE before booking, never loop: an email-only reply books with
// it; anything else goes to the LLM, whose next `agendar` books via
// confirmarPendente. All I/O mocked — the dance logic is what's under test.

describe('email-before-invite', () => {
  const NOW = Date.parse('2026-06-29T12:00:00Z');
  const SLOTS = [
    { iso: '2026-06-30T13:00:00.000Z', reps: ['rep@seatable.one'] },
    { iso: '2026-06-30T17:00:00.000Z', reps: ['rep@seatable.one'] },
  ];
  const FRESH = new Date(NOW - 60000).toISOString(); // slots proposed 1 min ago

  let mocks;

  function leadBase(extra = {}) {
    return {
      id: 'lead-1', name: 'Cantina X', prospect_email: null,
      slots: SLOTS, slots_at: FRESH, pending_slot_iso: null, ...extra,
    };
  }

  function carregar() {
    jest.resetModules();
    mocks = {
      patchLead: jest.fn(async () => {}),
      insertEvent: jest.fn(async () => ({ eventId: 'ev1', meetLink: 'https://meet.google.com/x', htmlLink: 'https://cal/x' })),
      sendBriefing: jest.fn(async () => {}),
    };
    jest.doMock('../_lib/prospecting/prospect-store', () => ({ patchLead: mocks.patchLead }));
    jest.doMock('../_lib/prospecting/prospect-briefing', () => ({ sendBriefing: mocks.sendBriefing }));
    jest.doMock('../_lib/prospecting/prospect-gcal', () => ({
      getGoogleAccessToken: async () => 'tok',
      freeBusyMulti: async () => ({ 'rep@seatable.one': [] }),
      insertEvent: mocks.insertEvent,
      contarReunioesFuturasPorRep: async () => ({}),
      ownerCalendarId: () => 'primary',
    }));
    return require('../_lib/prospecting/prospect-booking');
  }

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    process.env.GOOGLE_REFRESH_TOKEN = 'z';
    process.env.PROSPECTING_REP_EMAILS = 'rep@seatable.one';
  });
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../_lib/prospecting/prospect-store');
    jest.dontMock('../_lib/prospecting/prospect-briefing');
    jest.dontMock('../_lib/prospecting/prospect-gcal');
  });

  it('no email known → asks ONCE and holds the slot pending (no event)', async () => {
    const b = carregar();
    const r = await b.confirmarReuniao(leadBase(), '1', NOW);
    expect(r.handled).toBe(true);
    expect(r.booked).toBeUndefined();
    expect(r.mensagem).toMatch(/e-mail/i);
    expect(r.mensagem).toMatch(/por aqui mesmo/); // the ask is explicitly optional
    expect(mocks.patchLead).toHaveBeenCalledWith('lead-1', { pending_slot_iso: SLOTS[0].iso });
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it('email-only reply books the pending slot WITH the prospect as attendee', async () => {
    const b = carregar();
    const lead = leadBase({ pending_slot_iso: SLOTS[0].iso });
    const r = await b.confirmarReuniao(lead, 'meu email é joao@cantina.com', NOW);
    expect(r.booked).toBe(true);
    expect(r.patch.prospect_state).toBe('agendado');
    expect(r.patch.prospect_email).toBe('joao@cantina.com');
    expect(r.patch.reuniao_at).toBe(SLOTS[0].iso);
    const body = mocks.insertEvent.mock.calls[0][2];
    expect(body.attendees).toEqual(expect.arrayContaining([{ email: 'joao@cantina.com' }]));
    expect(r.mensagem).toContain('joao@cantina.com'); // confirmation mentions the invite
  });

  it('email already known → books immediately, no ask', async () => {
    const b = carregar();
    const r = await b.confirmarReuniao(leadBase({ prospect_email: 'dono@x.com' }), '2', NOW);
    expect(r.booked).toBe(true);
    const body = mocks.insertEvent.mock.calls[0][2];
    expect(body.attendees).toEqual(expect.arrayContaining([{ email: 'dono@x.com' }]));
  });

  it('email inside a longer sentence (a referral) → falls through to the LLM', async () => {
    const b = carregar();
    const lead = leadBase({ pending_slot_iso: SLOTS[0].iso });
    const r = await b.confirmarReuniao(lead, 'fala com meu sócio joao@x.com que ele decide', NOW);
    expect(r.handled).toBe(false);
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it('a decline/question with pending → falls through to the LLM (no loop, no premature booking)', async () => {
    const b = carregar();
    const lead = leadBase({ pending_slot_iso: SLOTS[0].iso });
    const r = await b.confirmarReuniao(lead, 'pode mandar por aqui mesmo', NOW);
    expect(r.handled).toBe(false);
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it('ask-once: pending set + lead picks ANOTHER slot → books it without a second ask', async () => {
    const b = carregar();
    const lead = leadBase({ pending_slot_iso: SLOTS[0].iso });
    const r = await b.confirmarReuniao(lead, 'melhor o 2', NOW);
    expect(r.booked).toBe(true);
    expect(r.patch.reuniao_at).toBe(SLOTS[1].iso);
    expect(r.patch.prospect_email).toBeUndefined(); // none given — link goes via WhatsApp
  });

  it('confirmarPendente (LLM re-confirmed intent) books without email', async () => {
    const b = carregar();
    const lead = leadBase({ pending_slot_iso: SLOTS[0].iso });
    const r = await b.confirmarPendente(lead, null, NOW);
    expect(r.booked).toBe(true);
    const body = mocks.insertEvent.mock.calls[0][2];
    expect(body.attendees).toEqual([{ email: 'rep@seatable.one' }]); // rep only
    expect(r.patch.prospect_email).toBeUndefined();
  });

  it('confirmarPendente with the email captured this turn → attendee included', async () => {
    const b = carregar();
    const lead = leadBase({ pending_slot_iso: SLOTS[1].iso });
    const r = await b.confirmarPendente(lead, 'dona@y.com', NOW);
    expect(r.booked).toBe(true);
    const body = mocks.insertEvent.mock.calls[0][2];
    expect(body.attendees).toEqual(expect.arrayContaining([{ email: 'dona@y.com' }]));
    expect(r.patch.prospect_email).toBe('dona@y.com');
  });

  it('confirmarPendente with a stale (past) pending slot → handled:false', async () => {
    const b = carregar();
    const lead = leadBase({ pending_slot_iso: '2026-06-28T13:00:00.000Z' });
    const r = await b.confirmarPendente(lead, 'a@b.com', NOW);
    expect(r.handled).toBe(false);
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });
});

describe('mensagemApenasEmail — deterministic-path guard', () => {
  const { mensagemApenasEmail } = require('../_lib/prospecting/prospect-extract');

  it.each([
    ['joao@gmail.com', true],
    ['meu email é joao@gmail.com', true],
    ['pode mandar pra joao@gmail.com 🙂', true],
    ['Segue: JOAO@GMAIL.COM', true],
    ['fala com meu sócio joao@gmail.com que ele decide', false],
    ['joao@gmail.com — mas antes me diz o preço?', false],
  ])('%p → %p', (texto, want) => {
    expect(mensagemApenasEmail(texto, 'joao@gmail.com')).toBe(want);
  });

  it('false without an email', () => {
    expect(mensagemApenasEmail('não tenho email', null)).toBe(false);
  });
});
