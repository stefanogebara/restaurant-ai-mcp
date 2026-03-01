import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

let mockFetchResponse: { ok: boolean; json: () => Promise<unknown> } = {
  ok: true,
  json: async () => ({ forecast: [] }),
};

vi.mock('../../services/api', () => ({
  authFetch: vi.fn(() => Promise.resolve(mockFetchResponse)),
}));

import { useStaffingForecast } from '../useStaffingForecast';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useStaffingForecast', () => {
  beforeEach(() => {
    mockFetchResponse = { ok: true, json: async () => ({ forecast: [] }) };
  });

  it('returns forecast array on success', async () => {
    const forecast = [
      { date: '2026-03-01', day: 'Sun', expected_covers: 30, roles: [{ name: 'FOH', recommended: 2 }] },
    ];
    mockFetchResponse = { ok: true, json: async () => ({ forecast }) };
    const { result } = renderHook(() => useStaffingForecast(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(forecast));
  });

  it('throws on non-ok response', async () => {
    mockFetchResponse = { ok: false, json: async () => ({}) };
    const { result } = renderHook(() => useStaffingForecast(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
