'use strict';

/**
 * Phase 4b — Google Calendar client + briefing tests. The gcal HTTP calls are
 * fetch-mocked; the briefing anti-leak guard is the security-critical case
 * (an internal briefing must never reach the prospect).
 */

const gcal = require('../_lib/prospecting/prospect-gcal');
const briefing = require('../_lib/prospecting/prospect-briefing');

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

describe('getGoogleAccessToken — credential-gated', () => {
  it('returns null (no network) when OAuth env vars are absent', async () => {
    const saved = {
      id: process.env.GOOGLE_CLIENT_ID, sec: process.env.GOOGLE_CLIENT_SECRET, ref: process.env.GOOGLE_REFRESH_TOKEN,
    };
    delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_REFRESH_TOKEN;
    let called = false;
    global.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    expect(await gcal.getGoogleAccessToken()).toBe(null);
    expect(called).toBe(false);
    if (saved.id) process.env.GOOGLE_CLIENT_ID = saved.id;
    if (saved.sec) process.env.GOOGLE_CLIENT_SECRET = saved.sec;
    if (saved.ref) process.env.GOOGLE_REFRESH_TOKEN = saved.ref;
  });
});

describe('freeBusyMulti — parses busy, omits inaccessible calendars (anti-invention)', () => {
  it('returns busy intervals for readable calendars and drops errored ones', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        calendars: {
          'a@x.com': { busy: [{ start: '2026-06-30T13:00:00Z', end: '2026-06-30T13:30:00Z' }] },
          'b@x.com': { errors: [{ domain: 'global', reason: 'notFound' }] }, // no access
        },
      }),
    });
    const out = await gcal.freeBusyMulti('tok', ['a@x.com', 'b@x.com'], Date.now(), Date.now() + 3600000);
    expect(out['a@x.com']).toEqual([{ startMs: Date.parse('2026-06-30T13:00:00Z'), endMs: Date.parse('2026-06-30T13:30:00Z') }]);
    expect(out['b@x.com']).toBeUndefined(); // omitted — never claim availability we couldn't read
  });
});

describe('insertEvent — extracts meet/html/event id', () => {
  it('reads hangoutLink + htmlLink + id from the response', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ id: 'evt_1', htmlLink: 'https://cal/evt_1', hangoutLink: 'https://meet.google.com/xyz' }),
    });
    const r = await gcal.insertEvent('tok', 'primary', { summary: 'x' });
    expect(r).toEqual({ eventId: 'evt_1', htmlLink: 'https://cal/evt_1', meetLink: 'https://meet.google.com/xyz' });
  });
  it('falls back to conferenceData video entry point for the meet link', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ id: 'e', conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc' }] } }),
    });
    expect((await gcal.insertEvent('tok', 'primary', {})).meetLink).toBe('https://meet.google.com/abc');
  });
});

describe('briefingDestinatarioValido — anti-leak guard', () => {
  it('allows an internal rep that is not the prospect', () => {
    expect(briefing.briefingDestinatarioValido('rep@seatable.one', 'maria@loja.com', '@seatable.one')).toBe(true);
  });
  it('blocks the prospect, external domains, and invalid emails', () => {
    expect(briefing.briefingDestinatarioValido('maria@loja.com', 'maria@loja.com', '@seatable.one')).toBe(false); // == prospect
    expect(briefing.briefingDestinatarioValido('rep@gmail.com', 'maria@loja.com', '@seatable.one')).toBe(false);  // external
    expect(briefing.briefingDestinatarioValido('notanemail', null, '@seatable.one')).toBe(false);
    expect(briefing.briefingDestinatarioValido('', null, '@seatable.one')).toBe(false);
    expect(briefing.briefingDestinatarioValido('REP@seatable.one', 'REP@seatable.one', '@seatable.one')).toBe(false); // case-insensitive ==
  });
});

describe('montarBriefingReuniao — only known fields, internal framing', () => {
  it('includes present fields, omits absent ones', () => {
    const lead = { nome: 'Doceria Maria', dono_nome: 'Maria', cidade: 'São Paulo', setor: null, instagram_handle: 'docerialoja', instagram_followers: 12000 };
    const { subject, html } = briefing.montarBriefingReuniao(lead, { slotIso: '2026-06-30T13:00:00.000Z', meetLink: 'https://meet.google.com/x', repNome: 'João', prospectEmail: 'maria@loja.com' });
    expect(subject).toContain('Doceria Maria');
    expect(html).toContain('Maria');
    expect(html).toContain('@docerialoja');
    expect(html).toContain('Google Meet');
    expect(html).not.toContain('Setor'); // omitted (null)
    expect(html).toContain('não encaminhe ao cliente'); // internal framing
  });
});

describe('sendBriefing — guarded', () => {
  it('refuses to send to the prospect / external (anti-leak), without touching Resend', async () => {
    const r = await briefing.sendBriefing({ nome: 'X' }, { slotIso: '2026-06-30T13:00:00.000Z', meetLink: null, repNome: null, prospectEmail: 'maria@loja.com' }, 'maria@loja.com');
    expect(r).toEqual({ sent: false, reason: 'invalid_recipient' });
  });
  it('reports no_api_key when RESEND is unset but recipient is valid', async () => {
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const r = await briefing.sendBriefing({ nome: 'X' }, { slotIso: '2026-06-30T13:00:00.000Z', meetLink: null, repNome: null, prospectEmail: 'maria@loja.com' }, 'rep@seatable.one');
    expect(r).toEqual({ sent: false, reason: 'no_api_key' });
    if (saved) process.env.RESEND_API_KEY = saved;
  });
});
