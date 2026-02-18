/**
 * Restaurant Learning Types
 *
 * Types for the AI-powered restaurant learning flow during onboarding.
 * Three phases: research -> interview -> persona
 */

export type LearningPhase = 'research' | 'interview' | 'persona';

export interface ResearchResult {
  summary: {
    rating?: number;
    review_count?: number;
    price_level?: string;
    cuisine_type?: string;
    atmosphere?: string;
    description?: string;
    signature_dishes?: string[];
    address?: string;
    website?: string;
  };
  tiers_completed: {
    google_places: boolean;
    website_extraction: boolean;
    google_search: boolean;
  };
}

export interface InterviewMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
  quick_replies?: string[];
}

export interface PersonaPreview {
  persona_summary: string;
  restaurant_profile: Record<string, unknown>;
  greeting_preview: string;
}

export interface ChatResponse {
  ai_message: string;
  extracted_data_updates?: Record<string, string[]>;
  quick_replies?: string[];
  completion_percentage: number;
  is_complete: boolean;
  current_topic?: string;
  current_topic_label?: string;
  topics_covered?: string[];
}

export interface RestaurantLearningData {
  session_id?: string;
  restaurant_profile?: Record<string, unknown>;
  persona?: PersonaPreview;
  skipped?: boolean;
}
