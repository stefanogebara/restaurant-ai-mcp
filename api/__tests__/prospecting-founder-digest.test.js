'use strict';

/**
 * Founder handoff digest + cold-handoff reclaim.
 *
 * Covers the PURE layers of the closing-bottleneck fix:
 *  - founder-digest.js compose (ordering, wa.me close links, age, subject)
 *  - prospect-state.elegivelParaReclaim (both leak paths + cold gate)
 *  - prospect-agent.isFounderNumber (test-lead exclusion)
 */

const {
  buildFounderDigestEmail, waCloseLink, closeMessageFor, orderLeads, describeAge,
} = require('../_lib/prospecting/founder-digest');
const { elegivelParaReclaim, HANDOFF_RECLAIM_MS } = require('../_lib/prospecting/prospect-state');
const { isFounderNumber } = require('../_lib/prospecting/prospect-agent');

const NOW = Date.parse('2026-07-23T14:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

// Deterministic product profile so compose tests don't depend on env.
const stubProfile = {
  company: 'Racha',
  daCompany: 'do Racha',
  founderClose: ({ founderName, ownerName }) =>
    `Oi${ownerName ? ' ' + ownerName : ''}! Aqui é o ${founderName}, fundador do Racha. Topa 5 min?`,
};

function lead(over = {}) {
  return {
    id: over.id || 'l1',
    name: over.name || 'Restaurante Zé',
    city: over.city || 'São Paulo',
    whatsapp_phone: over.whatsapp_phone || '+5511997756868',
    prospect_state: over.prospect_state || 'handoff',
    handoff_motivo: over.handoff_motivo || null,
    conversa_resumo: over.conversa_resumo || null,
    owner_name: over.owner_name || null,
    last_in_at: 'last_in_at' in over ? over.last_in_at : new Date(NOW - 2 * DAY).toISOString(),
    updated_at: 'updated_at' in over ? over.updated_at : new Date(NOW - 2 * DAY).toISOString(),
    created_at: over.created_at || new Date(NOW - 10 * DAY).toISOString(),
  };
}

describe('founder-digest compose', () => {
  test('wa.me link carries full digits + pre-filled founder close message', () => {
    const link = waCloseLink(lead({ owner_name: 'Maria' }), { profile: stubProfile, founderName: 'Stefano' });
    expect(link).toMatch(/^https:\/\/wa\.me\/5511997756868\?text=/);
    const text = decodeURIComponent(link.split('text=')[1]);
    expect(text).toContain('Aqui é o Stefano, fundador do Racha');
    expect(text).toContain('Oi Maria!'); // owner name woven in
  });

  test('close message omits name gracefully when owner unknown', () => {
    const msg = closeMessageFor(lead({ owner_name: null }), { profile: stubProfile, founderName: 'Stefano' });
    expect(msg.startsWith('Oi! Aqui é o Stefano')).toBe(true);
  });

  test('unusable phone → null link (no crash)', () => {
    expect(waCloseLink(lead({ whatsapp_phone: '123' }), { profile: stubProfile })).toBeNull();
  });

  test('orders agendando (hottest) before handoff, then by recency', () => {
    const leads = [
      lead({ id: 'h_old', prospect_state: 'handoff', updated_at: new Date(NOW - 9 * DAY).toISOString() }),
      lead({ id: 'ag', prospect_state: 'agendando', updated_at: new Date(NOW - 12 * DAY).toISOString() }),
      lead({ id: 'h_new', prospect_state: 'handoff', updated_at: new Date(NOW - 1 * DAY).toISOString() }),
    ];
    const ordered = orderLeads(leads, NOW);
    expect(ordered.map((l) => l.id)).toEqual(['ag', 'h_new', 'h_old']);
  });

  test('buildFounderDigestEmail: subject count, resumo fallback, reclaim note', () => {
    const leads = [
      lead({ id: 'a', prospect_state: 'agendando', conversa_resumo: 'quer testar semana que vem' }),
      lead({ id: 'b', prospect_state: 'handoff', conversa_resumo: null, handoff_motivo: 'pediu contato do dono' }),
    ];
    const out = buildFounderDigestEmail({ leads, nowMs: NOW, profile: stubProfile, founderName: 'Stefano', reclaimDays: 4 });
    expect(out.count).toBe(2);
    expect(out.subject).toBe('☎️ 2 leads esperando você fechar — Racha');
    // resumo present; falls back to handoff_motivo when conversa_resumo is null
    expect(out.html).toContain('quer testar semana que vem');
    expect(out.html).toContain('pediu contato do dono');
    // click-to-close button + reclaim urgency note
    expect(out.html).toContain('Abrir no WhatsApp');
    expect(out.html).toContain('4 dias');
    // text fallback has one wa.me line per lead
    expect((out.text.match(/https:\/\/wa\.me\//g) || []).length).toBe(2);
  });

  test('singular subject for a single lead', () => {
    const out = buildFounderDigestEmail({ leads: [lead()], nowMs: NOW, profile: stubProfile });
    expect(out.subject).toBe('☎️ 1 lead esperando você fechar — Racha');
  });

  test('describeAge: hoje / ontem / há N dias', () => {
    expect(describeAge(lead({ updated_at: new Date(NOW).toISOString(), last_in_at: null }), NOW)).toBe('hoje');
    expect(describeAge(lead({ updated_at: new Date(NOW - 1 * DAY).toISOString(), last_in_at: null }), NOW)).toBe('ontem');
    expect(describeAge(lead({ updated_at: new Date(NOW - 6 * DAY).toISOString(), last_in_at: null }), NOW)).toBe('há 6 dias');
  });

  test('one-tap "Já fechei" link per lead when a signer is injected', () => {
    const out = buildFounderDigestEmail({
      leads: [lead({ id: 'L1' }), lead({ id: 'L2' })],
      nowMs: NOW, profile: stubProfile,
      closeUrlFor: (l) => `https://seatable.one/api/prospect-close?t=tok-${l.id}`,
    });
    expect(out.items.map((i) => i.closeUrl)).toEqual([
      'https://seatable.one/api/prospect-close?t=tok-L1',
      'https://seatable.one/api/prospect-close?t=tok-L2',
    ]);
    expect(out.html).toContain('Já fechei');
    expect(out.html).toContain('t=tok-L1');
    expect((out.text.match(/Já fechei: https/g) || []).length).toBe(2);
  });

  test('no signer (or unsignable lead) → no button, digest still builds', () => {
    const plain = buildFounderDigestEmail({ leads: [lead()], nowMs: NOW, profile: stubProfile });
    expect(plain.items[0].closeUrl).toBeNull();
    expect(plain.html).not.toContain('Já fechei');

    const unsignable = buildFounderDigestEmail({
      leads: [lead()], nowMs: NOW, profile: stubProfile, closeUrlFor: () => null,
    });
    expect(unsignable.items[0].closeUrl).toBeNull();
    expect(unsignable.html).toContain('Abrir no WhatsApp'); // the wa.me CTA survives
  });

  test('escapes HTML in lead-provided fields (no injection)', () => {
    const out = buildFounderDigestEmail({
      leads: [lead({ name: '<script>x</script>', conversa_resumo: 'a & b' })],
      nowMs: NOW, profile: stubProfile,
    });
    expect(out.html).not.toContain('<script>x</script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('a &amp; b');
  });
});

describe('elegivelParaReclaim', () => {
  const cold = HANDOFF_RECLAIM_MS;

  test('non-handoff states are never reclaimed', () => {
    for (const s of ['conversando', 'agendando', 'agendado', 'optout', 'pausada', 'aguardando', 'ganho']) {
      expect(elegivelParaReclaim({ state: s, lastMsgDirecao: 'out', nowMs: NOW }).eligible).toBe(false);
    }
  });

  test('lead spoke last while muted → reclaim immediately', () => {
    const r = elegivelParaReclaim({
      state: 'handoff', lastMsgDirecao: 'in',
      lastInAtMs: NOW - 30 * 60 * 1000, updatedAtMs: NOW - 30 * 60 * 1000, nowMs: NOW,
    });
    expect(r).toEqual({ eligible: true, reason: 'lead_voltou_mudo' });
  });

  test('agent spoke last, still warm (< cold window) → wait', () => {
    const r = elegivelParaReclaim({
      state: 'handoff', lastMsgDirecao: 'out',
      lastInAtMs: NOW - 2 * DAY, updatedAtMs: NOW - 2 * DAY, coldMs: cold, nowMs: NOW,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('ainda_quente');
  });

  test('agent spoke last, cold past window → reclaim', () => {
    const r = elegivelParaReclaim({
      state: 'handoff', lastMsgDirecao: 'out',
      lastInAtMs: NOW - 10 * DAY, updatedAtMs: NOW - 10 * DAY, coldMs: cold, nowMs: NOW,
    });
    expect(r).toEqual({ eligible: true, reason: 'handoff_frio' });
  });

  test('no timestamps and agent spoke last → not eligible (no basis for age)', () => {
    const r = elegivelParaReclaim({ state: 'handoff', lastMsgDirecao: 'out', lastInAtMs: null, updatedAtMs: null, nowMs: NOW });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('sem_timestamp');
  });

  test('recent patch keeps a handoff warm even if last inbound is old (conservative)', () => {
    const r = elegivelParaReclaim({
      state: 'handoff', lastMsgDirecao: 'out',
      lastInAtMs: NOW - 30 * DAY, updatedAtMs: NOW - 1 * DAY, coldMs: cold, nowMs: NOW,
    });
    expect(r.eligible).toBe(false); // max(activity) is recent → wait
  });
});

describe('isFounderNumber', () => {
  test('matches the founder default with/without country prefix', () => {
    expect(isFounderNumber('+55 11 99900-2121')).toBe(true);
    expect(isFounderNumber('5511999002121')).toBe(true);
    expect(isFounderNumber('11999002121')).toBe(true); // bare, sem 55
  });
  test('rejects other numbers and empties', () => {
    expect(isFounderNumber('+5511997756868')).toBe(false);
    expect(isFounderNumber('')).toBe(false);
    expect(isFounderNumber(null)).toBe(false);
  });
});
