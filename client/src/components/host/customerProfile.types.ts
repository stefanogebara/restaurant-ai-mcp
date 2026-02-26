export interface Profile {
  customer_id: string;
  preferred_time_slot: string;
  preferred_day_type: string;
  booking_lead_time_avg: number | null;
  spontaneity_score: number;
  typical_party_size: number;
  dining_style: string;
  brings_children: boolean;
  avg_dining_duration_minutes: number;
  pace_preference: string;
  preferred_seating: string | null;
  noise_tolerance: string;
  dietary_restrictions: string[];
  cuisine_preferences: string[];
  primary_occasion_type: string;
  celebrates_occasions: boolean;
  price_sensitivity: string;
  avg_check_per_person: number | null;
  tip_percentage_avg: number | null;
  orders_appetizers_pct: number | null;
  orders_desserts_pct: number | null;
  orders_wine_pct: number | null;
  feedback_sentiment: string;
  complaint_count: number;
  compliment_count: number;
  profile_confidence: number;
  data_sources_used: string[];
  analysis_version: string;
  last_analyzed_at: string;
}

export interface TextSignals {
  dietary_restrictions: string[];
  cuisine_preferences: string[];
  occasion_types: string[];
  dining_style_evidence: string | null;
  has_children: boolean | null;
  seating_preferences: string[];
  noise_sensitivity: string | null;
  sentiment_summary: string | null;
  key_phrases: string[];
  vip_signals: boolean;
  ai_confidence: number;
  text_sources_count: number;
  extracted_signals: Record<string, unknown>;
}

export interface Reservation {
  id: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
  special_requests: string | null;
  notes: string | null;
  customer_name: string | null;
}

export interface Occasion {
  occasion_type: string;
  next_predicted_date: string;
  probability_score: number;
  party_size: number;
}

export interface Prediction {
  prediction_type: string;
  predicted_value: string;
  confidence_score: number;
  predicted_for_date: string | null;
}

export interface RevenueSummary {
  total_revenue: number;
  total_visits_with_revenue: number;
  avg_revenue: number;
  total_tips: number;
}

export interface FullProfile {
  customer_id: string;
  customer_name: string | null;
  profile: Profile | null;
  text_signals: TextSignals | null;
  occasions: Occasion[];
  predictions: Prediction[];
  reservations: Reservation[];
  revenue_summary: RevenueSummary;
}
