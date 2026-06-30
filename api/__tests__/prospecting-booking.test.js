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
