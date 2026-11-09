import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationDetail } from '../useCallTracking';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: mockFetch }));

describe('open call detail freshness', () => {
  let client: QueryClient;
  const started = '2026-11-09T14:00:00Z';
  const active = { id: 'row-1', conversation_id: 'conv-1', started_at: started, ended_at: null, outcome: 'reservation_created', tools_used: [] };
  const complete = { ...active, ended_at: '2026-11-09T14:01:00Z', duration_seconds: 60, tools_used: [{ tool_name: 'check_availability', success: true }] };
  const response = (conversation: unknown) => ({ ok: true, json: async () => ({ success: true, conversation }) });
  function mount(id: string | null = 'conv-1') {
    return renderHook(({ selectedId }) => useConversationDetail(selectedId), {
      initialProps: { selectedId: id },
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
  }
  async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(started));
    focusManager.setFocused(true);
    mockFetch.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  });
  afterEach(() => { client.clear(); focusManager.setFocused(undefined); vi.useRealTimers(); });

  it('updates completion and tool results while open, even if booking outcome was already set', async () => {
    mockFetch.mockResolvedValueOnce(response(active)).mockResolvedValue(response(complete));
    const { result } = mount();
    await advance(1);
    expect(result.current.data?.ended_at).toBeNull();
    await advance(15_000);
    expect(result.current.data?.ended_at).toBe(complete.ended_at);
    expect(result.current.data?.tools_used?.[0].success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fetches current detail when the same call is closed and reopened', async () => {
    mockFetch.mockResolvedValueOnce(response(active)).mockResolvedValue(response(complete));
    const { result, rerender } = mount();
    await advance(1);
    rerender({ selectedId: null });
    await advance(30_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    rerender({ selectedId: 'conv-1' });
    await advance(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.data?.ended_at).toBe(complete.ended_at);
  });

  it('keeps its deadline tied to call start as the outcome changes', async () => {
    vi.setSystemTime(new Date('2026-11-09T14:09:40Z'));
    mockFetch.mockResolvedValueOnce(response({ ...active, outcome: null }));
    mockFetch.mockImplementation(async () => response({ ...active, updated_at: new Date().toISOString() }));
    mount();
    await advance(1);
    await advance(15_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await advance(5_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['ended', complete], ['missing', null],
    ['expired', { ...active, started_at: '2026-11-09T13:50:00Z' }],
    ['invalid', { ...active, started_at: 'invalid' }],
    ['future', { ...active, started_at: '2026-11-09T14:01:00Z' }],
  ])('does not poll %s detail', async (_label, conversation) => {
    mockFetch.mockResolvedValue(response(conversation));
    mount();
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not poll in a background tab', async () => {
    mockFetch.mockResolvedValue(response(active));
    mount();
    await advance(1);
    focusManager.setFocused(false);
    await advance(120_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
