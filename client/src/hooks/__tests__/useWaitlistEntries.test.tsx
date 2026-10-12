import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { countActiveWaitlist, useWaitlistEntries } from '../useWaitlistEntries';
import type { WaitlistEntry } from '../../components/host/waitlistHelpers';

const mockAuthFetch = vi.fn();
vi.mock('../../services/api', () => ({ authFetch: (...args: unknown[]) => mockAuthFetch(...args) }));

const entry = (status: WaitlistEntry['status']): WaitlistEntry => ({
  id: status,
  waitlist_id: status,
  customer_name: 'Guest',
  customer_phone: 'test',
  party_size: 2,
  added_at: '2026-10-12T12:00:00Z',
  estimated_wait: 20,
  status,
  priority: 1,
});

function CountConsumer() {
  const query = useWaitlistEntries();
  return <p>{query.data && !query.data.plan_gated ? countActiveWaitlist(query.data.waitlist) : '—'}</p>;
}

describe('shared waitlist data', () => {
  it('counts waiting and notified guests, not seated or removed guests', () => {
    expect(countActiveWaitlist([entry('waiting'), entry('notified'), entry('seated'), entry('cancelled')])).toBe(2);
    expect(countActiveWaitlist([entry('Notified' as WaitlistEntry['status'])])).toBe(1);
  });

  it('shares one network request between the summary and the detail', async () => {
    mockAuthFetch.mockReset();
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({
      success: true,
      count: 3,
      waitlist: [entry('notified'), entry('seated'), entry('cancelled')],
    }) });
    renderWithProviders(<><CountConsumer /><CountConsumer /></>);
    expect((await screen.findAllByText('1')).length).toBe(2);
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    expect(mockAuthFetch).toHaveBeenCalledWith('/api/waitlist');
  });

  it('normalizes the plan-gated empty response', async () => {
    mockAuthFetch.mockReset();
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, items: [], plan_gated: true }) });
    renderWithProviders(<CountConsumer />);
    expect(await screen.findByText('—')).toBeInTheDocument();
  });
});
