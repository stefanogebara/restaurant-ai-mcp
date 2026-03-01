import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

let mockFetchResponse: { ok: boolean; json: () => Promise<unknown> } = {
  ok: true,
  json: async () => ({ avg_spend_per_cover: 45, data_points: 10, using_default: false }),
};

vi.mock('../../services/api', () => ({
  authFetch: vi.fn(() => Promise.resolve(mockFetchResponse)),
}));

import { useRevenueStats } from '../useRevenueStats';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useRevenueStats', () => {
  beforeEach(() => {
    mockFetchResponse = { ok: true, json: async () => ({ avg_spend_per_cover: 45, data_points: 10, using_default: false }) };
  });

  it('returns avg_spend_per_cover', async () => {
    const { result } = renderHook(() => useRevenueStats(), { wrapper });
    await waitFor(() => expect(result.current.data?.avg_spend_per_cover).toBe(45));
  });

  it('throws on non-ok response', async () => {
    mockFetchResponse = { ok: false, json: async () => ({}) };
    const { result } = renderHook(() => useRevenueStats(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
