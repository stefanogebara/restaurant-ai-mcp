'use strict';

/**
 * Phase 4 — scheduling brain tests. Deterministic via an injected agoraMs; we
 * compute local weekday/hour from the same UTC-3 offset rather than hardcoding
 * which calendar date is which weekday, so the suite is robust. The load-bearing
 * guarantees: slots are real free business-hours slots, only proposed slots
 * confirm, suggested times are gated, and rep/conference selection is deterministic.
 */

const A = require('../_lib/prospecting/prospect-agenda');
const { AGENDA_PADRAO } = A;
const OFF = AGENDA_PADRAO.offsetMin; // -180

// Local clock = UTC shifted by the offset (mirrors the module's partesLocais).
const local = (iso) => {
  const d = new Date(Date.parse(iso) + OFF * 60000);
  return { dow: d.getUTCDay(), hora: d.getUTCHours(), min: d.getUTCMinutes() };
};
const localMs = (ms) => new Date(ms + OFF * 60000).getUTCDay();

// A fixed "now": 2026-06-29 12:00 UTC = 09:00 local. (Weekday is computed, not assumed.)
const NOW = Date.parse('2026-06-29T12:00:00Z');

describe('proporSlots — real free business-hours slots only', () => {
  it('proposes weekday slots in [09:00,18:00), after the lead time, max 3', () => {
    const slots = A.proporSlots(NOW, []);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBeLessThanOrEqual(AGENDA_PADRAO.maxSlots);
    for (const iso of slots) {
      const p = local(iso);
      expect(p.dow).toBeGreaterThanOrEqual(1);  // Mon..Fri
      expect(p.dow).toBeLessThanOrEqual(5);
      expect(p.hora).toBeGreaterThanOrEqual(9);
      expect(p.hora).toBeLessThan(18);
      expect(Date.parse(iso)).toBeGreaterThanOrEqual(NOW + AGENDA_PADRAO.antecedenciaMin * 60000);
    }
  });

  it('never proposes a busy slot', () => {
    // Block the whole first proposed slot, confirm the new set avoids that instant.
    const first = A.proporSlots(NOW, [])[0];
    const start = Date.parse(first);
    const busy = [{ startMs: start, endMs: start + 30 * 60000 }];
    const after = A.proporSlots(NOW, busy);
    expect(after).not.toContain(first);
  });
});

describe('proporSlotsMulti — only slots with ≥1 free rep, listing them', () => {
  it('excludes a rep busy at a slot but keeps the slot if another is free', () => {
    const repA = 'a@seatable.one', repB = 'b@seatable.one';
    const slotsBoth = A.proporSlotsMulti(NOW, { [repA]: [], [repB]: [] });
    expect(slotsBoth.length).toBeGreaterThan(0);
    const target = slotsBoth[0].iso;
    const ts = Date.parse(target);
    // repA busy exactly at that slot → slot survives via repB, repA not listed.
    const slots = A.proporSlotsMulti(NOW, {
      [repA]: [{ startMs: ts, endMs: ts + 30 * 60000 }],
      [repB]: [],
    });
    const hit = slots.find((s) => s.iso === target);
    if (hit) {
      expect(hit.reps).toContain(repB);
      expect(hit.reps).not.toContain(repA);
    }
    // every returned slot lists at least one rep
    for (const s of slots) expect(s.reps.length).toBeGreaterThan(0);
  });
});

describe('avaliarHorarioSugerido — gates a prospect-suggested time', () => {
  const busy = { 'a@seatable.one': [] };

  it('accepts a valid free weekday business-hours time', () => {
    const good = A.proporSlots(NOW, [])[0];
    const r = A.avaliarHorarioSugerido(good, busy, NOW);
    expect(r.ok).toBe(true);
    expect(r.reps).toContain('a@seatable.one');
  });

  it('rejects: invalid, too-soon, weekend, out-of-hours, no-free-rep', () => {
    expect(A.avaliarHorarioSugerido('not-a-date', busy, NOW)).toMatchObject({ ok: false, motivo: 'horario_invalido' });
    // 30 min from now → inside the 120-min lead time
    expect(A.avaliarHorarioSugerido(new Date(NOW + 30 * 60000).toISOString(), busy, NOW)).toMatchObject({ ok: false, motivo: 'antecedencia' });

    // next Saturday 14:00 local
    let d = 0;
    while (localMs(NOW + d * 86400000) !== 6) d++;
    const satLocalNoonUtc = NOW + d * 86400000;
    const p = new Date(satLocalNoonUtc + OFF * 60000);
    const sat14 = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate(), 14, 0, 0) - OFF * 60000;
    expect(A.avaliarHorarioSugerido(new Date(sat14).toISOString(), busy, NOW)).toMatchObject({ ok: false, motivo: 'fim_de_semana' });

    // a valid slot but every rep busy → sem_rep_livre
    const good = A.proporSlots(NOW, [])[0];
    const gs = Date.parse(good);
    expect(A.avaliarHorarioSugerido(good, { 'a@seatable.one': [{ startMs: gs, endMs: gs + 30 * 60000 }] }, NOW))
      .toMatchObject({ ok: false, motivo: 'sem_rep_livre' });
  });
});

describe('parseHorarioSugerido — deterministic free-text time parsing', () => {
  it('"terça às 15h" → next Tuesday 15:00 local', () => {
    const r = A.parseHorarioSugerido('pode ser terça às 15h', NOW);
    expect(r.ok).toBe(true);
    const p = local(r.iso);
    expect(p.dow).toBe(2);
    expect(p.hora).toBe(15);
  });
  it('"amanhã de tarde" → tomorrow 15:00; ambiguous → sem_horario_claro', () => {
    const r = A.parseHorarioSugerido('amanhã de tarde', NOW);
    expect(r.ok).toBe(true);
    expect(local(r.iso).hora).toBe(15);
    expect(A.parseHorarioSugerido('sei lá quando', NOW)).toMatchObject({ ok: false, motivo: 'sem_horario_claro' });
    expect(A.parseHorarioSugerido('', NOW)).toMatchObject({ ok: false, motivo: 'sem_texto' });
  });
});

describe('parseJanelaInicio — deferral windows', () => {
  it('"semana que vem" → next Monday 00:00 local, in the future', () => {
    const ms = A.parseJanelaInicio('semana que vem', NOW);
    expect(ms).toBeGreaterThan(NOW);
    expect(localMs(ms)).toBe(1); // Monday
  });
  it('"mês que vem" → day 1 of next month; no window → null', () => {
    const ms = A.parseJanelaInicio('mês que vem', NOW);
    expect(new Date(ms + OFF * 60000).getUTCDate()).toBe(1);
    expect(A.parseJanelaInicio('qualquer hora', NOW)).toBe(null);
    expect(A.parseJanelaInicio(null, NOW)).toBe(null);
  });
});

describe('slotEhValido / slotsExpirados — anti-invention + TTL', () => {
  it('only confirms a proposed instant', () => {
    const props = ['2026-06-30T13:00:00.000Z', '2026-06-30T17:00:00.000Z'];
    expect(A.slotEhValido('2026-06-30T13:00:00.000Z', props)).toBe(true);
    expect(A.slotEhValido('2026-06-30T13:30:00.000Z', props)).toBe(false);
    expect(A.slotEhValido(null, props)).toBe(false);
  });
  it('expires after TTL, and treats a missing timestamp as expired', () => {
    const proposedAt = new Date(NOW).toISOString();
    expect(A.slotsExpirados(proposedAt, NOW + 1000)).toBe(false);
    expect(A.slotsExpirados(proposedAt, NOW + A.SLOTS_TTL_MS + 1)).toBe(true);
    expect(A.slotsExpirados(null, NOW)).toBe(true);
  });
});

describe('rep selection — deterministic + load-balanced', () => {
  it('escolherRepBalanceado picks the least-loaded, stable on ties', () => {
    const reps = ['a@x.com', 'b@x.com', 'c@x.com'];
    const load = { 'a@x.com': 5, 'b@x.com': 1, 'c@x.com': 1 };
    expect(A.escolherRepBalanceado(reps, load, 'lead-1')).not.toBe('a@x.com'); // a is loaded
    // same lead → same rep (deterministic tiebreak)
    const r1 = A.escolherRepBalanceado(reps, load, 'lead-42');
    const r2 = A.escolherRepBalanceado(reps, load, 'lead-42');
    expect(r1).toBe(r2);
    expect(A.escolherRepBalanceado([], load, 'lead-1')).toBe(null);
  });
});

describe('montarEventoCalendar — Meet event, deterministic requestId, deduped attendees', () => {
  it('builds the event body with the injected requestId + timezone', () => {
    const lead = { nome: 'Doceria Maria', dono_nome: 'Maria', cidade: 'São Paulo', whatsapp_phone: '+5511999990000', whatsapp_dono: null };
    const slot = '2026-06-30T13:00:00.000Z';
    const ev = A.montarEventoCalendar(lead, slot, 'lead123-' + slot, {
      attendees: ['rep@seatable.one', 'rep@seatable.one'], // dup
      prospectEmail: 'maria@loja.com', repNome: 'João',
    });
    expect(ev.summary).toBe('Maria <> João');
    expect(ev.start).toEqual({ dateTime: slot, timeZone: 'America/Sao_Paulo' });
    expect(ev.end.dateTime).toBe('2026-06-30T13:30:00.000Z');
    expect(ev.conferenceData.createRequest.requestId).toBe('lead123-' + slot);
    expect(ev.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    // dedupe: rep once + prospect once
    expect(ev.attendees).toHaveLength(2);
    expect(ev.attendees.map((a) => a.email).sort()).toEqual(['maria@loja.com', 'rep@seatable.one']);
    expect(ev.description).toContain('Seatable');
  });
});

describe('formatting', () => {
  it('formatarPropostaSlots numbers the options, empty → fallback', () => {
    const out = A.formatarPropostaSlots(['2026-06-30T13:00:00.000Z']);
    expect(out).toMatch(/1\)/);
    expect(A.formatarPropostaSlots([])).toMatch(/Não achei/);
  });
  it('formatarConfirmacao includes the Meet link when present', () => {
    const c = A.formatarConfirmacao('2026-06-30T13:00:00.000Z', 'https://meet.google.com/abc', OFF, 'm@x.com');
    expect(c).toContain('https://meet.google.com/abc');
    expect(c).toContain('m@x.com');
  });
});
