import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authFetch } from '../../services/api';
import { usePhoneIntegration } from '../usePhoneIntegration';

vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));
const api = vi.mocked(authFetch);
const savedSetup = {
  success: true,
  restaurant: { status: 'not_configured', shared_routing_enabled: true },
};
function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => vi.clearAllMocks());

describe('usePhoneIntegration', () => {
  it('reads the saved phone setup without a write', async () => {
    api.mockResolvedValueOnce(response(savedSetup));
    const { result } = renderHook(() => usePhoneIntegration(), { wrapper });
    await waitFor(() => expect(result.current.status).toEqual(savedSetup));
    expect(api).toHaveBeenCalledExactlyOnceWith('/api/phone-integration-simple?action=status');
  });

  it.each([
    ['HTTP failure', response({}, false)],
    ['HTTP 200 success:false', response({ success: false, restaurant: { status: 'not_configured' } })],
  ])('treats %s as unavailable, then recovers through refetch', async (_, failedResponse) => {
    api.mockResolvedValueOnce(failedResponse);
    const { result } = renderHook(() => usePhoneIntegration(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.status).toBeUndefined();
    let finish: (res: Response) => void = () => {};
    api.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
    act(() => { void result.current.refetch(); });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isLoading).toBe(false);
    await act(async () => { finish(response(savedSetup)); });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.status).toEqual(savedSetup);
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls.every(args => args.length === 1)).toBe(true);
  });
});
