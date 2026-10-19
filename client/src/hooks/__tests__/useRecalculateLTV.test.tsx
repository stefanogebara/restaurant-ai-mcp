import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock('../../services/api', async (orig) => {
  const actual = await orig<typeof import('../../services/api')>();
  return { ...actual, authFetch };
});

import { useRecalculateLTV } from '../useLTVData';

describe('useRecalculateLTV', () => {
  it('uses POST for the maintenance job, matching the server contract', async () => {
    authFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { total_customers: 3 } }),
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRecalculateLTV(), { wrapper });

    await act(async () => {
      expect(await result.current.mutateAsync()).toEqual({ total_customers: 3 });
    });

    expect(authFetch).toHaveBeenCalledWith('/api/ltv?action=calculate-all', { method: 'POST' });
  });
});
