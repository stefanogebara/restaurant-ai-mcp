import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveWhatsAppSettings, useSendTestMessage, useWhatsAppTestMessageStatus } from '../useWhatsAppSettings';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: mockFetch }));
beforeEach(() => mockFetch.mockReset());
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
function respond(payload: unknown, ok = true) {
  mockFetch.mockResolvedValue({ ok, json: async () => payload });
}
describe('WhatsApp response truthfulness', () => {
  it('replaces a previously delivered test with the newly accepted test immediately', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['whatsappTestStatus'], { id: 'old', status: 'delivered' });
    const next = { id: 'new', status: 'accepted', recipient_phone: '+5511999998888' };
    respond({ success: true, data: next });
    const { result } = renderHook(() => useSendTestMessage(), { wrapper });
    await act(async () => { await result.current.mutateAsync('+5511999998888'); });
    expect(client.getQueryData(['whatsappTestStatus'])).toEqual(next);
  });
  it('uses the cooldown record returned by the server even before another status read', async () => {
    const { client, wrapper } = setup();
    const recent = { id: 'recent', status: 'accepted', cooldown_expires_at: '2026-08-27T20:00:00Z' };
    respond({ success: false, error: 'Wait before retrying', data: recent }, false);
    const { result } = renderHook(() => useSendTestMessage(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync('+5511999998888')).rejects.toThrow('Wait before retrying'); });
    expect(client.getQueryData(['whatsappTestStatus'])).toEqual(recent);
  });
  it('rejects a failed send carried in an HTTP 200 response', async () => {
    const { wrapper } = setup();
    respond({ success: false, error: 'Provider rejected the message' });
    const { result } = renderHook(() => useSendTestMessage(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync('+5511999998888')).rejects.toThrow('Provider rejected'); });
  });
  it('rejects a failed save carried in an HTTP 200 response', async () => {
    const { wrapper } = setup();
    respond({ success: false, error: 'Settings were not saved' });
    const { result } = renderHook(() => useSaveWhatsAppSettings(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ enabled: true })).rejects.toThrow('not saved'); });
  });
  it('distinguishes a failed delivery lookup from no previous test', async () => {
    const { wrapper } = setup();
    respond({ success: false, error: 'Lookup unavailable' });
    const { result } = renderHook(() => useWhatsAppTestMessageStatus(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Lookup unavailable');
  });
});
