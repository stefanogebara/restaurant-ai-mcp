/**
 * Phase FF.1 — useSubscription cache-key drift fix.
 *
 * Before FF.1 the queryKey was ['subscription', queryEmail || 'current-user']
 * where queryEmail = email-prop ?? sessionEmail ?? localStorage. But the
 * request body never sent `email` — authFetch uses the session token —
 * so passing different `email` props returned cached data from earlier
 * sessions.
 *
 * After FF.1 the queryKey is bound to the *authoritative* identity
 * (session email). These tests lock that behavior: two different email
 * props in the same session collapse to one cache entry, and the email
 * prop does NOT change the cache key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock dependencies BEFORE importing the module under test.
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../services/api', () => ({
  authFetch: vi.fn(async () => ({
    ok: true,
    json: async () => ({ has_subscription: true, plan_name: 'professional' }),
  })),
}));
vi.mock('../../config/localStorageKeys', () => ({
  LS_CUSTOMER_EMAIL: 'customer_email',
}));

import { useSubscription } from '../useSubscription';
import { useAuth } from '../../contexts/AuthContext';
import { authFetch } from '../../services/api';

function wrapWithClient(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useSubscription cache key (FF.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { email: 'session@example.com' },
    });
  });

  it('fires exactly one request when the same hook is mounted with two different email props', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result: r1 } = renderHook(
      () => useSubscription({ email: 'differentA@example.com' }),
      { wrapper: wrapWithClient(qc) },
    );
    const { result: r2 } = renderHook(
      () => useSubscription({ email: 'differentB@example.com' }),
      { wrapper: wrapWithClient(qc) },
    );

    await waitFor(() => expect(r1.current.data).toBeDefined());
    await waitFor(() => expect(r2.current.data).toBeDefined());

    // Both hooks resolved against the SAME cache entry — bound to the
    // session, not the email prop. So authFetch fired once, not twice.
    expect((authFetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('cache key does NOT include the email prop', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useSubscription({ email: 'foo@example.com' }), {
      wrapper: wrapWithClient(qc),
    });

    await waitFor(() => {
      // The query is registered under ['subscription', 'session@example.com']
      // (the session user), NOT ['subscription', 'foo@example.com'].
      expect(qc.getQueryData(['subscription', 'session@example.com'])).toBeDefined();
      expect(qc.getQueryData(['subscription', 'foo@example.com'])).toBeUndefined();
    });
  });

  it('falls back to "anonymous" cache key when no session user', async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    localStorage.setItem('customer_email', 'fromLocal@example.com');

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useSubscription(), { wrapper: wrapWithClient(qc) });

    await waitFor(() => {
      expect(qc.getQueryData(['subscription', 'anonymous'])).toBeDefined();
    });
  });
});
