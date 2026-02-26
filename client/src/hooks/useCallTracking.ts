import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { ANALYTICS_POLL_INTERVAL, ANALYTICS_STALE_TIME } from '../config/constants';
import type {
  Conversation,
  Stats,
  PhoneStatusData,
  DiagnoseData,
  CallFilter,
} from '../components/call-tracking/callTrackingTypes';

// ─── Queries ──────────────────────────────────────────────────────────────────

interface ConversationsResult {
  conversations: Conversation[];
}

export function useCallConversations(filter: CallFilter, restaurantId: string) {
  const outcomeParam = filter.outcome !== 'all' ? `&outcome=${filter.outcome}` : '';
  const languageParam = filter.language !== 'all' ? `&language=${filter.language}` : '';
  const restaurantParam = restaurantId ? `&restaurant_id=${restaurantId}` : '';

  return useQuery<ConversationsResult>({
    queryKey: ['call-conversations', filter.outcome, filter.language, restaurantId],
    queryFn: async () => {
      const res = await authFetch(
        `/api/agent-conversations?action=list&limit=50&offset=0${restaurantParam}${outcomeParam}${languageParam}`
      );
      if (!res.ok) throw new Error('Failed to fetch conversations');
      const data = await res.json();
      return { conversations: data.success ? (data.conversations || []) : [] };
    },
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: ANALYTICS_POLL_INTERVAL,
  });
}

export function useCallStats(filter: CallFilter, restaurantId: string) {
  const restaurantParam = restaurantId ? `&restaurant_id=${restaurantId}` : '';

  return useQuery<Stats | null>({
    queryKey: ['call-stats', filter.period, restaurantId],
    queryFn: async () => {
      const res = await authFetch(
        `/api/agent-conversations?action=stats&period=${filter.period}${restaurantParam}`
      );
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      return data.success ? data.stats : null;
    },
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: ANALYTICS_POLL_INTERVAL,
  });
}

export function usePhoneStatus(restaurantId: string) {
  return useQuery<PhoneStatusData | null>({
    queryKey: ['phone-status', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return null;
      const res = await authFetch(
        `/api/phone-integration-simple?action=status&restaurant_id=${restaurantId}`
      );
      if (!res.ok) throw new Error('Failed to fetch phone status');
      const data = await res.json();
      return data.success && data.restaurant ? data.restaurant : null;
    },
    enabled: !!restaurantId,
    staleTime: ANALYTICS_STALE_TIME,
  });
}

export function useConversationDetail(conversationId: string | null) {
  return useQuery<Conversation | null>({
    queryKey: ['conversation-detail', conversationId],
    queryFn: async () => {
      const res = await authFetch(`/api/agent-conversations?action=get&id=${conversationId}`);
      if (!res.ok) throw new Error('Failed to fetch conversation');
      const data = await res.json();
      return data.success ? data.conversation : null;
    },
    enabled: !!conversationId,
    staleTime: Infinity,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useSetupPhone() {
  const queryClient = useQueryClient();
  return useMutation<{ message?: string }, Error, string>({
    mutationFn: async (restaurantId) => {
      const res = await authFetch('/api/phone-integration-simple?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      });
      if (!res.ok) throw new Error('Failed to set up phone');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to set up phone');
      return data;
    },
    onSuccess: (_, restaurantId) => {
      queryClient.invalidateQueries({ queryKey: ['phone-status', restaurantId] });
    },
  });
}

export function useDisconnectPhone() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (restaurantId) => {
      const res = await authFetch('/api/phone-integration-simple?action=unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      });
      if (!res.ok) throw new Error('Failed to disconnect phone');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to disconnect phone');
    },
    onSuccess: (_, restaurantId) => {
      queryClient.invalidateQueries({ queryKey: ['phone-status', restaurantId] });
    },
  });
}

export function useDiagnoseAgent() {
  return useMutation<DiagnoseData, Error, string>({
    mutationFn: async (restaurantId) => {
      const res = await authFetch(
        `/api/phone-integration-simple?action=diagnose&restaurant_id=${restaurantId}`
      );
      if (!res.ok) throw new Error('Failed to diagnose agent');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to diagnose agent');
      return data;
    },
  });
}

export function useFixTools() {
  return useMutation<{ message?: string }, Error, string>({
    mutationFn: async (restaurantId) => {
      const res = await authFetch('/api/phone-integration-simple?action=fix-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      });
      if (!res.ok) throw new Error('Failed to fix tools');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fix tools');
      return data;
    },
  });
}
