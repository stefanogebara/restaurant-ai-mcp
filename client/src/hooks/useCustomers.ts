import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

// ─── Types ──────────────────────────────────────────────────

export interface CrmCustomer {
  customer_id: string;
  customer_phone: string;
  customer_name: string | null;
  customer_email: string | null;
  total_visits: number;
  last_visit_date: string | null;
  first_visit_date: string | null;
  customer_tier: string;
  lifetime_value: number;
  avg_revenue_per_visit: number;
  total_revenue: number;
  churn_risk_score: number;
  avg_party_size: number;
  tags: string[];
}

export interface CustomerNote {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface CustomerDetail extends CrmCustomer {
  recent_reservations: Array<{
    id: string;
    date: string;
    time: string;
    party_size: number;
    status: string;
  }>;
  notes: CustomerNote[];
}

export interface CustomerListFilters {
  search?: string;
  tier?: string;
  tag?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface CustomerListResponse {
  customers: CrmCustomer[];
  total: number;
}

// ─── Stale time ─────────────────────────────────────────────

const CRM_STALE_TIME = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ────────────────────────────────────────────────

function buildQueryString(filters: CustomerListFilters): string {
  const params = new URLSearchParams({ action: 'crm_list' });
  if (filters.search) params.set('search', filters.search);
  if (filters.tier) params.set('tier', filters.tier);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.order) params.set('order', filters.order);
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.offset != null) params.set('offset', String(filters.offset));
  return params.toString();
}

// ─── Queries ────────────────────────────────────────────────

export function useCustomerList(filters: CustomerListFilters) {
  return useQuery<CustomerListResponse>({
    queryKey: ['crm', 'customers', filters],
    queryFn: async () => {
      const qs = buildQueryString(filters);
      const response = await authFetch(`/api/crm?${qs}`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch customers');
      return result.data;
    },
    staleTime: CRM_STALE_TIME,
  });
}

export function useCustomerDetail(customerId: string | null) {
  return useQuery<CustomerDetail>({
    queryKey: ['crm', 'customer', customerId],
    queryFn: async () => {
      const response = await authFetch(
        `/api/crm?action=crm_detail&customer_id=${encodeURIComponent(customerId!)}`
      );
      if (!response.ok) throw new Error('Failed to fetch customer detail');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch customer detail');
      return result.data;
    },
    enabled: !!customerId,
    staleTime: CRM_STALE_TIME,
  });
}

// ─── Mutations ──────────────────────────────────────────────

export function useUpdateTags() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { customerId: string; tags: string[] }>({
    mutationFn: async ({ customerId, tags }) => {
      const response = await authFetch('/api/crm?action=update_tags', {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId, tags }),
      });
      if (!response.ok) throw new Error('Failed to update tags');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to update tags');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'customer', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
    },
  });
}

export function useAddNote() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { customerId: string; content: string }>({
    mutationFn: async ({ customerId, content }) => {
      const response = await authFetch('/api/crm?action=add_note', {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId, content }),
      });
      if (!response.ok) throw new Error('Failed to add note');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to add note');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'customer', variables.customerId] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { customerId: string; noteId: string }>({
    mutationFn: async ({ customerId, noteId }) => {
      const response = await authFetch('/api/crm?action=delete_note', {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId, note_id: noteId }),
      });
      if (!response.ok) throw new Error('Failed to delete note');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to delete note');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'customer', variables.customerId] });
    },
  });
}
