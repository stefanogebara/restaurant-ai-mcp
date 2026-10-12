import { describe, expect, it } from 'vitest';
import { formatNotifiedTime, getStatusColor, isStaleNotified, type WaitlistEntry } from '../waitlistHelpers';

const now = new Date('2026-10-12T15:00:00Z');
const notified = (notifiedAt: string): WaitlistEntry => ({
  id: 'one', waitlist_id: 'one', customer_name: 'Guest', customer_phone: 'test', party_size: 2,
  added_at: notifiedAt, estimated_wait: 20, status: 'notified', priority: 1, notified_at: notifiedAt,
});

describe('waitlist presentation', () => {
  it('flags notices from previous service days for review without altering the entry', () => {
    expect(isStaleNotified(notified('2026-10-10T15:00:00Z'), now)).toBe(true);
    expect(isStaleNotified(notified('2026-10-12T14:00:00Z'), now)).toBe(false);
    expect(isStaleNotified({ ...notified('2026-10-10T15:00:00Z'), status: 'seated' }, now)).toBe(false);
  });

  it('uses a local calendar date for old notices, not an English 46d timer', () => {
    expect(formatNotifiedTime('2026-08-27T13:00:00Z', 'pt-BR', now)).toMatch(/ago\. de 2026|ago\. 2026/);
    expect(formatNotifiedTime('2026-08-27T13:00:00Z', 'es', now)).toMatch(/27 ago 2026/);
    expect(formatNotifiedTime('2026-10-12T14:00:00Z', 'pt-BR', now)).toMatch(/há 1 h/);
    expect(formatNotifiedTime('2026-08-27T02:00:00Z', 'pt-BR', now, 'America/Sao_Paulo')).toMatch(/^26 /);
  });

  it('uses semantic status colors instead of action burgundy', () => {
    expect(getStatusColor('waiting')).not.toContain('burgundy');
    expect(getStatusColor('notified')).toContain('amber');
    expect(getStatusColor('seated')).toContain('emerald');
  });
});
