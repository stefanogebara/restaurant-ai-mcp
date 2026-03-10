import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

interface AIStrategyData {
  strategy_doc: string;
  updated_at: string | null;
  restaurant_name: string;
}

interface StrategyResponse {
  success: boolean;
  data: AIStrategyData;
}

interface SuggestResponse {
  success: boolean;
  data: { suggestions: string };
}

export function useAIStrategy() {
  return useQuery<AIStrategyData>({
    queryKey: ['aiStrategy'],
    queryFn: async () => {
      const res = await authFetch('/api/ai-strategy?action=get');
      const json: StrategyResponse = await res.json();
      if (!json.success) throw new Error('Failed to load strategy');
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveAIStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (strategyDoc: string) => {
      const res = await authFetch('/api/ai-strategy?action=update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_doc: strategyDoc }),
      });
      const json: StrategyResponse = await res.json();
      if (!json.success) throw new Error('Failed to save strategy');
      return json.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aiStrategy'] });
    },
  });
}

export function useGenerateStrategySuggestions() {
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/ai-strategy?action=suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json: SuggestResponse = await res.json();
      if (!json.success) throw new Error('Failed to generate suggestions');
      return json.data.suggestions;
    },
  });
}
