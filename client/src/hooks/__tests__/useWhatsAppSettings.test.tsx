import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('bounded WhatsApp receipt polling', () => {
  let client: QueryClient;
  const requested = '2026-11-09T12:00:00Z';
  function receipt(status: string, requestedAt = requested) {
    return { id: 'real-test', status, requested_at: requestedAt, status_updated_at: new Date().toISOString() };
  }
  function mount() {
    const created = setup();
    client = created.client;
    return renderHook(() => useWhatsAppTestMessageStatus(), { wrapper: created.wrapper });
  }
  async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(requested));
    focusManager.setFocused(true);
  });
  afterEach(() => {
    client?.clear();
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it('finds a read receipt after delivery without reload, then stops', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: receipt('delivered') }) });
    respond({ success: true, data: receipt('read') });
    const { result } = mount();
    await advance(1);
    await advance(59_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.data?.status).toBe('read');
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it.each(['accepted', 'sent', 'queued'])('checks %s every fifteen seconds', async (status) => {
    respond({ success: true, data: receipt(status) });
    mount();
    await advance(1);
    await advance(15_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('preserves the original deadline as a pending message becomes delivered', async () => {
    vi.setSystemTime(new Date('2026-11-09T12:08:00Z'));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: receipt('sent') }) });
    mockFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ success: true, data: receipt('delivered') }) }));
    mount();
    await advance(1);
    await advance(15_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await advance(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    await advance(45_000);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    await advance(10 * 60_000);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['read', requested], ['failed', requested], ['unknown', requested],
    ['delivered', 'invalid'], ['delivered', '2026-11-09T11:50:00Z'],
    ['delivered', '2026-11-09T12:01:00Z'],
  ])('does not poll terminal, invalid or expired data: %s / %s', async (status, requestedAt) => {
    respond({ success: true, data: receipt(status, requestedAt) });
    mount();
    await advance(1);
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not poll when no previous test exists', async () => {
    respond({ success: true, data: null });
    mount();
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('pauses delivered-message polling while the tab is in the background', async () => {
    respond({ success: true, data: receipt('delivered') });
    mount();
    await advance(1);
    focusManager.setFocused(false);
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
