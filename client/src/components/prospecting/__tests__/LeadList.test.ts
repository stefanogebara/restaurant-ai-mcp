import { describe, it, expect } from 'vitest';
import { orderForTab } from '../LeadList';
import type { ProspectLead } from '../types';

/**
 * Triagem is the operator's work queue. A closed deal ('ganho' → bucket 'won')
 * keeps its last intent, so without an explicit terminal filter a customer the
 * founder already closed would sit at the TOP of the queue forever.
 */

const NOW = Date.parse('2026-07-23T15:00:00Z');

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

describe('orderForTab — triagem drops closed deals', () => {
  it('a won lead leaves the queue even with a hot intent', () => {
    const won = lead({ id: 'won', prospect_state: 'ganho', bucket: 'won', last_intent: 'interessado' });
    const open = lead({ id: 'open', bucket: 'replied', last_intent: 'interessado' });
    const shown = orderForTab([won, open], 'triagem', null, NOW);
    expect(shown.map((l) => l.id)).toEqual(['open']);
  });

  it('an opted-out lead leaves the queue too', () => {
    const out = lead({ id: 'out', prospect_state: 'optout', bucket: 'optout', last_intent: 'quer_humano' });
    expect(orderForTab([out], 'triagem', null, NOW)).toHaveLength(0);
  });

  it('Todos still shows everything — the win must remain auditable', () => {
    const won = lead({ id: 'won', prospect_state: 'ganho', bucket: 'won' });
    expect(orderForTab([won], 'todos', null, NOW).map((l) => l.id)).toEqual(['won']);
    expect(orderForTab([won], 'todos', 'won', NOW).map((l) => l.id)).toEqual(['won']);
    expect(orderForTab([won], 'todos', 'handoff', NOW)).toHaveLength(0);
  });
});
