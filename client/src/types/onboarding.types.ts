/**
 * Onboarding Types
 */

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
  // Step 2: Contact & Business Hours
  phone_number: string;
  email: string;
  website?: string;
  business_hours: BusinessHours[];
  average_dining_duration: number;
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
