import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface ActivityEvent {
  id: string;
  type: string;
  icon: string;
  color: string;
  message: string;
  detail: string;
  timestamp: string;
}

async function fetchActivityFeed(limit: number): Promise<ActivityEvent[]> {
  const res = await authFetch(`/api/activity-feed?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load activity feed');
  const json = await res.json();
  return json.data;
}

export function useActivityFeed(limit = 20) {
  return useQuery({
    queryKey: ['activity-feed', limit],
    queryFn: () => fetchActivityFeed(limit),
    staleTime: 2 * 60 * 1000, // 2 min — activity updates frequently
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
  });
}
