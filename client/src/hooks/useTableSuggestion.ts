import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';

interface TableSuggestion {
  suggested_table_id: string;
  table_name: string;
  reasoning: string;
  score: number;
}

export function useTableSuggestion(partySize: number | undefined) {
  return useQuery<TableSuggestion | null>({
    queryKey: ['tableSuggestion', partySize],
    queryFn: async () => {
      if (!partySize) return null;
      const response = await hostAPI.getTableSuggestion(partySize);
      return response.data?.suggestion ?? null;
    },
    enabled: !!partySize && partySize > 0,
    staleTime: 30 * 1000, // 30s — tables change frequently
  });
}
