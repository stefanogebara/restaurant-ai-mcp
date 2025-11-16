/**
 * Onboarding Types
 */

import type { ProfileQuestionnaireData } from './profile.types';

export interface BusinessHours {
  day: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export interface TableConfiguration {
  capacity: number;
  count: number;
}

export interface RestaurantArea {
  name: string;
  is_active: boolean;
  tables: TableConfiguration[];
}

export interface TeamMember {
  email: string;
  role: 'Owner' | 'Manager' | 'Host';
  status: 'pending' | 'active';
}

export interface OnboardingData {
  customer_email: string;
  restaurant_id: string;
  // Step 1: Welcome & Restaurant Info
  restaurant_name: string;
  restaurant_type: string;
  city: string;
  country: string;
  language?: string;
  // Step 1.5: Restaurant Profile (Optional)
  profile_data?: ProfileQuestionnaireData;
  // Step 2: Contact & Business Hours
  phone_number: string;
  email: string;
  website?: string;
  business_hours: BusinessHours[];
  average_dining_duration: number;
  // Step 2.5: Voice Selection
  selected_voice_id?: string;
  selected_voice_language?: string;  // Language code from selected voice (e.g., 'es', 'fr', 'en')
  // Step 3: Table Configuration
  areas: RestaurantArea[];
  // Step 4: Reservation Settings
  advance_booking_days: number;
  buffer_time: number;
  cancellation_policy: string;
  special_notes?: string;
  // Step 5: Team Setup
  team_members: TeamMember[];
}

export interface OnboardingStepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext?: () => void;
  onBack?: () => void;
  onComplete?: () => void;
  isSubmitting?: boolean;
}
