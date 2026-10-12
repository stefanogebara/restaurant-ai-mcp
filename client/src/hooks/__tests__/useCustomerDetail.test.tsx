import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCustomerDetail } from '../useCustomers';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: mockFetch }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => mockFetch.mockReset());

describe('customer detail contract', () => {
  it('flattens the API envelope for the drawer and preserves history and notes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          customer: { customer_id: 'crm-uuid', customer_name: 'Beatriz', customer_phone: '+5511999888777', total_visits: 3 },
          reservations: [{ id: 'reservation-1', date: '2026-10-11', time: '19:00', party_size: 2, status: 'completed' }],
          notes: [{ id: 'note-1', content: 'Window table', created_by: null, created_at: '2026-10-11' }],
        },
      }),
    });

    const { result } = renderHook(() => useCustomerDetail('crm-uuid'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith('/api/customers?action=detail&customer_id=crm-uuid');
    expect(result.current.data).toEqual(expect.objectContaining({
      customer_name: 'Beatriz',
      customer_phone: '+5511999888777',
      recent_reservations: [expect.objectContaining({ id: 'reservation-1' })],
      notes: [expect.objectContaining({ id: 'note-1' })],
      allergies: [],
      special_occasions: {},
    }));
  });

  it('treats a malformed successful response as an error instead of showing undefined fields', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });
    const { result } = renderHook(() => useCustomerDetail('crm-uuid'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Invalid customer detail response');
  });
});
