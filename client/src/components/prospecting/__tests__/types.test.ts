import { describe, it, expect } from 'vitest';
import {
  triagePriority, windowRemainingMs, relTime, fmtCountdown, interpolateCanned,
} from '../types';
import type { ProspectLead } from '../types';

const NOW = Date.parse('2026-07-02T15:00:00Z');
const HOUR = 60 * 60 * 1000;

function lead(partial: Partial<ProspectLead>): ProspectLead {
  return {
    id: 'x', name: 'Cantina', sector: null, city: 'SP', whatsapp_phone: null,
    prospect_state: 'conversando', bucket: 'replied', lead_score: null,
    owner_name: null, reuniao_at: null, reuniao_link: null, updated_at: '',
    last_intent: null, last_intent_at: null, last_in_at: null,
    snoozed_until: null, intro_variant: null, touch_count: 1, next_touch_at: null,
    ...partial,
  };
}

describe('triagePriority — operator queue ordering', () => {
  it('quer_humano / handoff outranks everything', () => {
    expect(triagePriority(lead({ last_intent: 'quer_humano' }), NOW)).toBe(0);
    expect(triagePriority(lead({ bucket: 'handoff' }), NOW)).toBe(0);
  });

  it('interessado beats pergunta beats window-closing beats active', () => {
    const a = triagePriority(lead({ last_intent: 'interessado' }), NOW);
    const b = triagePriority(lead({ last_intent: 'pergunta' }), NOW);
    const c = triagePriority(lead({ last_in_at: new Date(NOW - 21 * HOUR).toISOString() }), NOW);
    const d = triagePriority(lead({ bucket: 'scheduling' }), NOW);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
  });

  it('snoozed leads sink regardless of intent', () => {
    const snoozed = lead({ last_intent: 'quer_humano', snoozed_until: new Date(NOW + HOUR).toISOString() });
    expect(triagePriority(snoozed, NOW)).toBeGreaterThan(50);
    // ...but an EXPIRED snooze resurfaces at full priority
    const expired = lead({ last_intent: 'quer_humano', snoozed_until: new Date(NOW - HOUR).toISOString() });
    expect(triagePriority(expired, NOW)).toBe(0);
  });
});

describe('windowRemainingMs — Meta 24h free-text window', () => {
  it('counts down from the last inbound', () => {
    expect(windowRemainingMs(new Date(NOW - 23 * HOUR).toISOString(), NOW)).toBe(HOUR);
  });
  it('goes negative when expired and null when never replied', () => {
    expect(windowRemainingMs(new Date(NOW - 25 * HOUR).toISOString(), NOW)).toBeLessThan(0);
    expect(windowRemainingMs(null, NOW)).toBeNull();
  });
});

describe('relTime / fmtCountdown', () => {
  it('compact relative times', () => {
    expect(relTime(new Date(NOW - 30 * 1000).toISOString(), NOW)).toBe('agora');
    expect(relTime(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW)).toBe('5m');
    expect(relTime(new Date(NOW - 3 * HOUR).toISOString(), NOW)).toBe('3h');
    expect(relTime(new Date(NOW - 49 * HOUR).toISOString(), NOW)).toBe('2d');
  });
  it('countdown formatting', () => {
    expect(fmtCountdown(5 * HOUR + 12 * 60 * 1000)).toBe('5h12');
    expect(fmtCountdown(45 * 60 * 1000)).toBe('45min');
  });
});

describe('interpolateCanned — placeholder rendering', () => {
  it('fills nome/cidade/restaurante from the lead', () => {
    const out = interpolateCanned(
      'Oi {{nome}}! O {{restaurante}} em {{cidade}} merece isso.',
      { name: 'Cantina Bella', city: 'São Paulo', owner_name: 'João Silva' },
    );
    expect(out).toBe('Oi João! O Cantina Bella em São Paulo merece isso.');
  });
  it('collapses gracefully when fields are missing', () => {
    const out = interpolateCanned('Oi {{nome}}! Sobre o {{restaurante}}:', { name: 'X', city: null, owner_name: null });
    expect(out).toBe('Oi ! Sobre o X:');
  });
});
