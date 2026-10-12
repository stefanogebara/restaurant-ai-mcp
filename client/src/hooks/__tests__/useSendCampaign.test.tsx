import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSendCampaign } from '../useLTVData';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: mockFetch }));

beforeEach(() => mockFetch.mockReset());

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const input = { customerId: 'guest-1', campaignType: 'win_back', message: 'Olá', language: 'pt-BR' };

describe('individual retention email result', () => {
  it('sends the selected language and succeeds only when the provider accepted it', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, sent: true }) });
    const { result } = renderHook(() => useSendCampaign(), { wrapper });

    await act(async () => { await result.current.mutateAsync(input); });

    expect(mockFetch).toHaveBeenCalledWith('/api/retention-campaigns?action=create', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ customer_id: 'guest-1', campaign_type: 'win_back', message: 'Olá', language: 'pt-BR', channel: 'email' }),
    }));
  });

  it('does not call a rejected provider response a success', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, sent: false }) });
    const { result } = renderHook(() => useSendCampaign(), { wrapper });

    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('send_failed'); });
  });

  it('distinguishes a customer without an email address', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422 });
    const { result } = renderHook(() => useSendCampaign(), { wrapper });

    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('customer_email_missing'); });
  });
});
