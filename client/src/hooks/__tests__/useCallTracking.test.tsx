import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { callPeriodStartIso, useCallConversations } from '../useCallTracking';
import type { CallFilter } from '../../components/call-tracking/callTrackingTypes';

const mockAuthFetch = vi.fn();
vi.mock('../../services/api', () => ({ authFetch: (...args: unknown[]) => mockAuthFetch(...args) }));

const filter: CallFilter = { period: '30d', outcome: 'all', language: 'all' };

function ListConsumer({ page = 0, channel = 'phone' }: { page?: number; channel?: 'phone' | 'unclassified' }) {
  const query = useCallConversations(filter, 'owned-restaurant', page, channel);
  return <p>{query.data ? `${query.data.conversations.length}/${query.data.pagination.total}` : 'loading'}</p>;
}

describe('call list period and pagination', () => {
  it('computes the same rolling day window as the statistics endpoint', () => {
    const now = new Date('2026-10-12T15:00:00.000Z');
    expect(callPeriodStartIso('1d', now)).toBe('2026-10-11T15:00:00.000Z');
    expect(callPeriodStartIso('7d', now)).toBe('2026-10-05T15:00:00.000Z');
    expect(callPeriodStartIso('30d', now)).toBe('2026-09-12T15:00:00.000Z');
    expect(callPeriodStartIso('90d', now)).toBe('2026-07-14T15:00:00.000Z');
    expect(callPeriodStartIso('invalid', now)).toBe('2026-10-05T15:00:00.000Z');
    expect(callPeriodStartIso('1d', new Date('2026-03-30T12:00:00.000Z'))).toBe('2026-03-29T12:00:00.000Z');
  });

  it('sends date_from and page offset but never trusts client restaurant_id for tenant scoping', async () => {
    mockAuthFetch.mockReset();
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({
      success: true,
      conversations: [{ id: 'call-51' }],
      pagination: { total: 51, limit: 50, offset: 50, has_more: false },
    }) });
    renderWithProviders(<ListConsumer page={1} />);

    expect(await screen.findByText('1/51')).toBeInTheDocument();
    const url = String(mockAuthFetch.mock.calls[0][0]);
    expect(url).toContain('action=list&limit=50&offset=50&date_from=');
    expect(url).toContain('channel=phone');
    expect(url).not.toContain('restaurant_id=');
    const start = new URL(url, 'https://seatable.one').searchParams.get('date_from');
    expect(start).not.toBeNull();
    const days = (Date.now() - new Date(start!).getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('requests unclassified conversations separately from phone calls', async () => {
    mockAuthFetch.mockReset();
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true,
      conversations: [], pagination: { total: 0, limit: 50, offset: 0, has_more: false },
    }) });
    renderWithProviders(<ListConsumer channel="unclassified" />);
    expect(await screen.findByText('0/0')).toBeInTheDocument();
    expect(String(mockAuthFetch.mock.calls[0][0])).toContain('channel=unclassified');
  });
});
