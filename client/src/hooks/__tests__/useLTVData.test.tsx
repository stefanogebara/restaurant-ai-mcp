import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock('../../services/api', () => ({ authFetch }));
vi.mock('../usePlanFeature', () => ({
  usePlanFeature: () => ({ hasAccess: true, isLoading: false, plan: 'growth' }),
}));

import { useLTVAtRisk, useLTVStats, useLTVTopVIPs } from '../useLTVData';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('LTV query failures', () => {
  beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'CRM unavailable' }),
    });
  });

  it.each([
    ['stats', useLTVStats],
    ['VIP customers', useLTVTopVIPs],
    ['at-risk customers', useLTVAtRisk],
  ])('surfaces an API failure for %s instead of empty data', async (_name, useData) => {
    const { result } = renderHook(() => useData(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
