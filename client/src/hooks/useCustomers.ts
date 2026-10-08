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

export interface CustomerDetail extends Omit<CrmCustomer, 'avg_party_size' | 'churn_risk_score'> {
  churn_risk_score: number | null;
  recent_reservations: Array<{
    id: string;
    date: string;
    time: string;
    party_size: number;
    status: string;
  }>;
  notes: CustomerNote[];
  allergies: string[];
  dietary_restrictions: string[];
  seating_preferences: string[];
  special_occasions: Record<string, string>;
}

export interface ProfileUpdatePayload {
  customerId: string;
  allergies?: string[];
  dietary_restrictions?: string[];
  seating_preferences?: string[];
  special_occasions?: Record<string, string>;
}

export interface DuplicateGroup {
  match_type: string;
  match_value: string;
  customers: Array<CrmCustomer & { customer_id: string }>;
}

export interface DuplicatesResponse {
  duplicates: DuplicateGroup[];
  total_groups: number;
}

export interface CustomerListFilters {
  search?: string;
  tier?: string;
  /** Exclusive lower bound; 70 selects scores above 70/100. */
  minRiskScore?: number;
  tag?: string;
  allergy?: string;
  dietary?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface CustomerListResponse {
  customers: CrmCustomer[];
  total: number;
}

interface CustomerDetailEnvelope {
  customer: Omit<CustomerDetail, 'recent_reservations' | 'notes'>;
  reservations: CustomerDetail['recent_reservations'];
  notes: CustomerNote[];
}

function normalizeCustomerDetail(data: unknown): CustomerDetail {
  if (!data || typeof data !== 'object') throw new Error('Invalid customer detail');
  const envelope = data as Partial<CustomerDetailEnvelope>;
  const customer = envelope.customer;
  if (!customer || typeof customer !== 'object'
    || typeof customer.customer_id !== 'string' || !customer.customer_id
    || typeof customer.customer_phone !== 'string' || !customer.customer_phone
    || (customer.customer_name !== null && typeof customer.customer_name !== 'string')
    || typeof customer.customer_tier !== 'string'
    || !Number.isFinite(customer.total_visits)
    || !Number.isFinite(customer.total_revenue)
    || !Number.isFinite(customer.avg_revenue_per_visit)
    || !Number.isFinite(customer.lifetime_value)
    || (customer.churn_risk_score !== null && !Number.isFinite(customer.churn_risk_score))
    || !Array.isArray(envelope.reservations)
    || !Array.isArray(envelope.notes)) {
    throw new Error('Invalid customer detail');
  }

  return {
    ...customer,
    tags: Array.isArray(customer.tags) ? customer.tags : [],
    allergies: Array.isArray(customer.allergies) ? customer.allergies : [],
    dietary_restrictions: Array.isArray(customer.dietary_restrictions) ? customer.dietary_restrictions : [],
    seating_preferences: Array.isArray(customer.seating_preferences) ? customer.seating_preferences : [],
    special_occasions: customer.special_occasions && typeof customer.special_occasions === 'object'
      ? customer.special_occasions : {},
    recent_reservations: envelope.reservations,
    notes: envelope.notes,
  };
}

// ─── Stale time ─────────────────────────────────────────────

const CRM_STALE_TIME = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ────────────────────────────────────────────────

function buildQueryString(filters: CustomerListFilters): string {
  const params = new URLSearchParams({ action: 'list' });
  if (filters.search) params.set('search', filters.search);
  if (filters.tier) params.set('tier', filters.tier);
  if (filters.minRiskScore != null) params.set('min_risk_score', String(filters.minRiskScore));
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.allergy) params.set('allergy', filters.allergy);
  if (filters.dietary) params.set('dietary', filters.dietary);
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
      const response = await authFetch(`/api/customers?${qs}`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch customers');
      return result.data;
    },
    staleTime: CRM_STALE_TIME,
  });
}

export function useCustomerDetail(customerId: string | null) {
  const now = new Date();
  const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return useQuery<CustomerDetail>({
    queryKey: ['crm', 'customer', customerId, fromDate],
    queryFn: async () => {
      const response = await authFetch(
        `/api/customers?action=detail&customer_id=${encodeURIComponent(customerId!)}&from_date=${fromDate}`
      );
      if (!response.ok) throw new Error('Failed to fetch customer detail');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch customer detail');
      return normalizeCustomerDetail(result.data);
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
      const response = await authFetch('/api/customers?action=update_tags', {
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
      const response = await authFetch('/api/customers?action=add_note', {
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
      const response = await authFetch('/api/customers?action=delete_note', {
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

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, ProfileUpdatePayload>({
    mutationFn: async ({ customerId, ...fields }) => {
      const response = await authFetch('/api/customers?action=update_profile', {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId, ...fields }),
      });
      if (!response.ok) throw new Error('Failed to update profile');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to update profile');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'customer', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
    },
  });
}

export function useFindDuplicates(enabled = false) {
  return useQuery<DuplicatesResponse>({
    queryKey: ['crm', 'duplicates'],
    queryFn: async () => {
      const response = await authFetch('/api/customers?action=find_duplicates');
      if (!response.ok) throw new Error('Failed to find duplicates');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to find duplicates');
      return result.data;
    },
    enabled,
    staleTime: CRM_STALE_TIME,
  });
}

export function useMergeCustomers() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { keepId: string; mergeId: string }>({
    mutationFn: async ({ keepId, mergeId }) => {
      const response = await authFetch('/api/customers?action=merge', {
        method: 'POST',
        body: JSON.stringify({ keep_id: keepId, merge_id: mergeId }),
      });
      if (!response.ok) throw new Error('Failed to merge customers');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to merge customers');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'duplicates'] });
    },
  });
}
