export interface Customer {
  customer_id: string;
  total_visits: number;
  total_revenue: number;
  avg_revenue_per_visit: number;
  customer_tier: 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk';
  lifetime_value: number;
  churn_risk_score: number;
  last_visit_date: string;
  predicted_next_visit_date: string | null;
  favorite_time_slot: string | null;
  favorite_day: string | null;
}

export interface LTVStats {
  total_customers: number;
  total_ltv: number;
  avg_ltv: number;
  tiers: {
    vip: number;
    regular: number;
    occasional: number;
    new: number;
    at_risk: number;
  };
  high_risk_customers: number;
}
