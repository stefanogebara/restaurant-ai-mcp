/**
 * Shared TypeScript types for voice selection and configuration.
 * Used by onboarding Step2_5VoiceSelection and VoiceSettingsPage.
 */

export interface EnhancedVoice {
  id: string;
  name: string;
  description: string;
  language: string;
  gender: string;
  accent?: string;
  age?: string;
  use_case?: string;
  category?: string;
  preview_url?: string;
  preview_phrase: string;
}

export interface VoiceSettings {
  stability: number;        // 0.0-1.0
  similarity_boost: number; // 0.0-1.0
  style: number;            // 0.0-1.0
  speed: number;            // 0.7-1.2
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  speed: 1.0,
};

export interface VoiceFiltersState {
  gender: 'all' | 'male' | 'female';
  language: string;
  search: string;
}

export interface VoicePagination {
  page: number;
  hasMore: boolean;
}
