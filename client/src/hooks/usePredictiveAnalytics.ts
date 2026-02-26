import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { ANALYTICS_STALE_TIME } from '../config/constants';

export interface NoShowPrediction {
  reservation_id: string;
  customer_name: string;
  party_size: number;
  date: string;
  time: string;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  days_until: number;
  recommendations: string[];
}

export interface NoShowSummary {
  total_upcoming: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  historical_no_show_rate: number;
  estimated_potential_no_shows: number;
}

interface NoShowData {
  predictions: NoShowPrediction[];
  summary: NoShowSummary | null;
}

export function useNoShowPredictions() {
  return useQuery<NoShowData>({
    queryKey: ['no-show-predictions'],
    queryFn: async () => {
      const response = await authFetch('/api/predictive-analytics?type=no-show');
      if (!response.ok) throw new Error('Failed to fetch no-show predictions');
      const result = await response.json();
      return { predictions: result.predictions || [], summary: result.summary || null };
    },
    staleTime: ANALYTICS_STALE_TIME,
  });
}

export interface RevenueOpportunity {
  rank: number;
  category: string;
  description: string;
  current_loss: number;
  potential_gain: number;
  recovery_rate: string;
  actions: string[];
  priority: 'low' | 'medium' | 'high';
  implementation_difficulty: 'low' | 'medium' | 'high';
  estimated_timeline: string;
}

export interface OpportunitySummary {
  total_opportunities: number;
  total_potential_revenue: number;
  estimated_monthly_impact: number;
  quick_wins: number;
  high_priority: number;
}

interface RevenueData {
  opportunities: RevenueOpportunity[];
  summary: OpportunitySummary | null;
}

export function useRevenueOpportunities() {
  return useQuery<RevenueData>({
    queryKey: ['revenue-opportunities'],
    queryFn: async () => {
      const response = await authFetch('/api/predictive-analytics?type=revenue');
      if (!response.ok) throw new Error('Failed to fetch revenue opportunities');
      const result = await response.json();
      return { opportunities: result.opportunities || [], summary: result.summary || null };
    },
    staleTime: ANALYTICS_STALE_TIME,
  });
}
