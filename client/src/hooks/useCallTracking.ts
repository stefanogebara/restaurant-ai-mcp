import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { ANALYTICS_POLL_INTERVAL, ANALYTICS_STALE_TIME } from '../config/constants';
import type {
  Conversation,
  Stats,
  PhoneStatusData,
  CallFilter,
} from '../components/call-tracking/callTrackingTypes';

// ─── Queries ──────────────────────────────────────────────────────────────────

interface ConversationsResult {
  conversations: Conversation[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export const CALLS_PAGE_SIZE = 50;

export function callPeriodStartIso(period: string, now = new Date()): string {
  const days = ({ '1d': 1, '7d': 7, '30d': 30, '90d': 90 } as Record<string, number>)[period] ?? 7;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function useCallConversations(filter: CallFilter, restaurantId: string, page = 0) {
  const outcomeParam = filter.outcome !== 'all' ? `&outcome=${filter.outcome}` : '';
  const languageParam = filter.language !== 'all' ? `&language=${filter.language}` : '';
  const sentimentParam = filter.sentiment ? `&sentiment=${filter.sentiment}` : '';
  const searchParam = filter.search ? `&search=${encodeURIComponent(filter.search)}` : '';
  return useQuery<ConversationsResult>({
    queryKey: ['call-conversations', filter.period, filter.outcome, filter.language, filter.sentiment, filter.search, restaurantId, page],
    queryFn: async () => {
      const dateFrom = encodeURIComponent(callPeriodStartIso(filter.period));
      const offset = page * CALLS_PAGE_SIZE;
      const res = await authFetch(
        `/api/agent-conversations?action=list&limit=${CALLS_PAGE_SIZE}&offset=${offset}&date_from=${dateFrom}${outcomeParam}${languageParam}${sentimentParam}${searchParam}`
      );
      if (!res.ok) throw new Error('Failed to fetch conversations');
      const data = await res.json();
      // A 200 with { success:false } is still a failure — throwing lets React
      // Query surface isError/retry instead of rendering a fake empty list.
      if (!data.success) throw new Error(data.error || 'Failed to fetch conversations');
      return {
        conversations: data.conversations || [],
        pagination: data.pagination || { total: 0, limit: CALLS_PAGE_SIZE, offset, has_more: false },
      };
    },
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: ANALYTICS_POLL_INTERVAL,
  });
}

export function useCallStats(filter: CallFilter, restaurantId: string) {
  return useQuery<Stats | null>({
    queryKey: ['call-stats', filter.period, restaurantId],
    queryFn: async () => {
      const res = await authFetch(
        `/api/agent-conversations?action=stats&period=${filter.period}`
      );
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch stats');
      return data.stats ?? null;
    },
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: ANALYTICS_POLL_INTERVAL,
  });
}

export function usePhoneStatus(restaurantId: string) {
  return useQuery<PhoneStatusData | null>({
    queryKey: ['phone-status', restaurantId],
    queryFn: async () => {
      // The server resolves the owned restaurant from the authenticated user.
      // Never send mutable profile metadata as tenant scope for this endpoint.
      const res = await authFetch('/api/phone-integration-simple?action=status');
      if (!res.ok) throw new Error('Failed to fetch phone status');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch phone status');
      return data.restaurant ?? null;
    },
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
      if (!data.success) throw new Error(data.error || 'Failed to fetch conversation');
      return data.conversation ?? null;
    },
    enabled: !!conversationId,
    staleTime: Infinity,
  });
}
