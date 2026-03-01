import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';
import React from 'react';

vi.mock('../../services/api', () => ({
  authFetch: vi.fn(() => Promise.resolve({
    ok: true,
    json: async () => ({ agent_name: 'Sofia', agent_greeting: 'Welcome!' }),
  })),
}));

import { useVoicePersona } from '../useVoicePersona';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useVoicePersona', () => {
  it('returns agent_name', async () => {
    const { result } = renderHook(() => useVoicePersona(), { wrapper });
    await waitFor(() => expect(result.current.data?.agent_name).toBe('Sofia'));
  });
});
