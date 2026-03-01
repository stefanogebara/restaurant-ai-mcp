import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

let mockFetchResponse: { ok: boolean; json: () => Promise<unknown> } = {
  ok: true,
  json: async () => ({ staffing_config: null }),
};

vi.mock('../../services/api', () => ({
  authFetch: vi.fn((url: string, opts?: { method?: string }) => {
    if (opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ staffing_config: { roles: [] } }) });
    }
    return Promise.resolve(mockFetchResponse);
  }),
}));

import { useStaffingConfig, useSaveStaffingConfig } from '../useStaffingConfig';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useStaffingConfig', () => {
  beforeEach(() => {
    mockFetchResponse = { ok: true, json: async () => ({ staffing_config: null }) };
  });

  it('returns staffing_config on success', async () => {
    const config = { roles: [{ name: 'FOH', covers_per_staff: 15 }] };
    mockFetchResponse = { ok: true, json: async () => ({ staffing_config: config }) };
    const { result } = renderHook(() => useStaffingConfig(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(config));
  });

  it('returns null when no config', async () => {
    const { result } = renderHook(() => useStaffingConfig(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeNull());
  });
});

describe('useSaveStaffingConfig', () => {
  it('mutation fires without error', async () => {
    const { result } = renderHook(() => useSaveStaffingConfig(), { wrapper });
    await act(async () => {
      result.current.mutate({ roles: [{ name: 'FOH', covers_per_staff: 15 }] });
    });
    await waitFor(() => expect(result.current.isIdle || result.current.isSuccess).toBe(true));
  });
});
