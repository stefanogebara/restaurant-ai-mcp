/**
 * Phase BB.3 — realtime hook invalidation tests.
 *
 * Asserts:
 *   1. useRealtimeDashboard subscribes to all four dashboard tables
 *      (reservations, tables, waitlist, service_records)
 *   2. Each change event triggers invalidateQueries on the right keys —
 *      including 'dashboard' (BB.2 fix that closed a key-mismatch bug).
 *   3. Channel is cleaned up on unmount.
 *   4. No subscription when restaurantId is undefined.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---- Supabase mock ----------------------------------------------------------
// Each `.on('postgres_changes', filter, cb)` is recorded so the test can
// fire the callback manually as if Postgres pushed an event.
const recordedCallbacks: Array<{
  filter: { event: string; schema: string; table: string; filter: string };
  cb: (payload: unknown) => void;
}> = [];

const removedChannels: unknown[] = [];

const mockChannel = {
  on: vi.fn(function (
    this: typeof mockChannel,
    _event: string,
    filter: { event: string; schema: string; table: string; filter: string },
    cb: (payload: unknown) => void,
  ) {
    recordedCallbacks.push({ filter, cb });
    return this; // allow chaining
  }),
  subscribe: vi.fn(),
};

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn((ch) => {
      removedChannels.push(ch);
    }),
  },
}));

import { useRealtimeDashboard, useRealtimeSubscription } from '../useRealtimeSubscription';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useRealtimeDashboard', () => {
  beforeEach(() => {
    recordedCallbacks.length = 0;
    removedChannels.length = 0;
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
  });

  it('subscribes to all four dashboard tables', () => {
    renderHook(() => useRealtimeDashboard('rest-1'), { wrapper });
    const tables = recordedCallbacks.map((c) => c.filter.table).sort();
    expect(tables).toEqual(['reservations', 'service_records', 'tables', 'waitlist']);
    // Each subscription scoped to the restaurant_id.
    for (const cb of recordedCallbacks) {
      expect(cb.filter.filter).toBe('restaurant_id=eq.rest-1');
      expect(cb.filter.schema).toBe('public');
      expect(cb.filter.event).toBe('*');
    }
  });

  it('does NOT subscribe when restaurantId is undefined', () => {
    renderHook(() => useRealtimeDashboard(undefined), { wrapper });
    expect(recordedCallbacks.length).toBe(0);
    expect(mockChannel.subscribe).not.toHaveBeenCalled();
  });

  it('invalidates the [dashboard] cache key on a reservations event (BB.2)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    renderHook(() => useRealtimeDashboard('rest-2'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    // Fire the reservations callback as Postgres would.
    const resCb = recordedCallbacks.find((c) => c.filter.table === 'reservations');
    expect(resCb).toBeDefined();
    resCb!.cb({ eventType: 'INSERT', new: {}, old: null });

    // The BB.2 fix added 'dashboard' to the invalidation list. Check that key
    // specifically — the bug was that ['dashboard'] was never invalidated so
    // the dashboard kept showing stale data.
    const keysCalled = invalidateSpy.mock.calls.map((args) => args[0]?.queryKey?.[0]);
    expect(keysCalled).toContain('dashboard');
    // Backwards-compat keys still invalidated:
    expect(keysCalled).toContain('hostDashboard');
    expect(keysCalled).toContain('simpleDashboard');
  });

  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeDashboard('rest-3'), { wrapper });
    expect(removedChannels.length).toBe(0);
    unmount();
    expect(removedChannels.length).toBe(1);
  });
});

describe('useRealtimeSubscription (single-table variant)', () => {
  beforeEach(() => {
    recordedCallbacks.length = 0;
    mockChannel.on.mockClear();
  });

  it('subscribes to a single table with restaurant_id filter', () => {
    renderHook(() => useRealtimeSubscription('reservations', 'rest-4'), { wrapper });
    expect(recordedCallbacks.length).toBe(1);
    expect(recordedCallbacks[0].filter.table).toBe('reservations');
    expect(recordedCallbacks[0].filter.filter).toBe('restaurant_id=eq.rest-4');
  });

  it('calls the onData callback when an event fires', () => {
    const onData = vi.fn();
    renderHook(() => useRealtimeSubscription('reservations', 'rest-5', onData), {
      wrapper,
    });
    recordedCallbacks[0].cb({ test: 'payload' });
    expect(onData).toHaveBeenCalledWith({ test: 'payload' });
  });
});
