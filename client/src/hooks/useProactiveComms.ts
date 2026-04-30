import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export type ProactiveCommType = 'occasion' | 'churn_risk' | 'long_absent';
export type ProactiveCommStatus = 'pending' | 'approved' | 'sent' | 'dismissed' | 'expired';

export interface ProactiveCommItem {
  id: string;
  restaurant_id: string;
  type: ProactiveCommType;
  customer_phone: string;
  customer_name: string | null;
  customer_id: string | null;
  trigger_data: Record<string, unknown>;
  draft_message: string | null;
  suggested_action: string;
  status: ProactiveCommStatus;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  send_error: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProactiveCommsListResponse {
  success: boolean;
  items: ProactiveCommItem[];
  counts?: Record<ProactiveCommStatus, number>;
  migration_pending?: boolean;
}

const QUERY_KEY = ['proactive-comms'];

async function fetchList(status?: ProactiveCommStatus): Promise<ProactiveCommsListResponse> {
  const url = status ? `/api/proactive-comms?status=${encodeURIComponent(status)}` : '/api/proactive-comms';
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to load proactive comms');
  return res.json();
}

export function useProactiveComms(status?: ProactiveCommStatus) {
  return useQuery({
    queryKey: status ? [...QUERY_KEY, status] : QUERY_KEY,
    queryFn: () => fetchList(status),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useUpdateProactiveComm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: ProactiveCommStatus; draft_message?: string }) => {
      const { id, ...body } = input;
      const res = await authFetch(`/api/proactive-comms?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || json.error || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useSendProactiveComm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/proactive-comms?id=${encodeURIComponent(id)}&action=send`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.detail || json.message || json.error || 'Failed to send');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
