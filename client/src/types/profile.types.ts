/**
 * Profile Types
 *
 * TypeScript definitions for restaurant profile and dashboard customization system
 */

// ===========================
// Enums and Literal Types
// ===========================

export type ProfileTemplate = 'simple' | 'balanced' | 'advanced';

export type RestaurantType = 'traditional' | 'modern' | 'fast-casual' | 'fine-dining';

export type RestaurantSize = 'small' | 'medium' | 'large';

export type LocationType = 'tourist' | 'residential' | 'business' | 'town_center';

export type PrimaryConcern =
  | 'no_shows'
  | 'peak_hours'
  | 'regular_customers'
  | 'table_turnover'
  | 'revenue'
  | 'waitlist';

export type RiskDisplayMode = 'simple' | 'detailed' | 'technical';

export type TimeFormat = '12h' | '24h';

export type FontSize = 'small' | 'medium' | 'large';

export type ColorScheme = 'default' | 'high-contrast' | 'colorblind';

export type NotificationLevel = 'all' | 'essential' | 'critical';

export type Language = 'en' | 'es' | 'pt' | 'fr' | 'it';

// ===========================
// Metric Identifiers
// ===========================

export type MetricId =
  // Essential Metrics
  | 'tables_available'
  | 'todays_reservations'
  | 'priority_actions'
  | 'current_occupancy'
  | 'next_arrivals'
  | 'active_services'
  | 'waitlist_count'

  // Business Metrics
  | 'revenue_today'
  | 'average_party_size'
  | 'table_turnover_rate'
  | 'no_show_rate'
  | 'cancellation_rate'
  | 'repeat_customer_rate'

  // Operational Metrics
  | 'peak_hours'
  | 'average_wait_time'
  | 'seating_efficiency'
  | 'staff_utilization'

  // ML/Technical Metrics
  | 'ml_confidence'
  | 'model_version'
  | 'roc_auc'
  | 'feature_importance'
  | 'training_metrics'
  | 'prediction_accuracy';

// ===========================
// Customization Settings
// ===========================

export interface ProfileCustomizations {
  risk_display: RiskDisplayMode;
  time_format: TimeFormat;
  currency: string; // ISO currency code (e.g., "EUR", "USD", "GBP")
  show_technical_details: boolean;
  font_size: FontSize;
  language: Language;
  color_scheme: ColorScheme;
  notification_level: NotificationLevel;
}

// ===========================
// Metric Visibility
// ===========================

export interface MetricVisibility {
  visible_metrics: MetricId[];
  hidden_metrics: MetricId[];
}

// ===========================
// Restaurant Profile (Main)
// ===========================

export interface RestaurantProfile {
  template: ProfileTemplate;
  restaurant_type: RestaurantType;
  size: RestaurantSize;
  location_type: LocationType;
  primary_concerns: PrimaryConcern[];
  visible_metrics: MetricId[];
  hidden_metrics: MetricId[];
  customizations: ProfileCustomizations;
}

// ===========================
// Questionnaire Data
// ===========================

export interface ProfileQuestionnaireData {
  // Step 1: Restaurant Type
  restaurant_type?: RestaurantType;

  // Step 2: Size & Location
  size?: RestaurantSize;
  seat_count?: number;  // Required in form validation, optional in type for initial state
  location_type?: LocationType;

  // Step 3: Primary Concerns
  primary_concerns?: PrimaryConcern[];

  // Step 4: Dashboard Complexity
  template?: ProfileTemplate;
}

// ===========================
// API Request/Response Types
// ===========================

export interface ProfileUpdateRequest {
  metric_profile: RestaurantProfile;
}

export interface ProfileGetResponse {
  success: boolean;
  data: RestaurantProfile;
}

export interface ProfileUpdateResponse {
  success: boolean;
  message: string;
  data: RestaurantProfile;
}

export interface ProfileRecommendationRequest {
  restaurant_type: RestaurantType;
  size: RestaurantSize;
  location_type: LocationType;
  primary_concerns: PrimaryConcern[];
  seat_count?: number;
}

export interface ProfileRecommendationResponse {
  success: boolean;
  data: {
    recommended_profile: RestaurantProfile;
    reasoning: string;
    alternatives?: Partial<RestaurantProfile>[];
  };
}

// ===========================
// Template Configurations
// ===========================

export interface TemplateConfig {
  id: ProfileTemplate;
  name: string;
  description: string;
  recommended_for: string[];
  visible_metrics: MetricId[];
  hidden_metrics: MetricId[];
  customizations: Partial<ProfileCustomizations>;
  preview_image?: string;
}

export const TEMPLATE_CONFIGS: Record<ProfileTemplate, TemplateConfig> = {
  simple: {
    id: 'simple',
    name: 'Simple Dashboard',
    description: 'Essential information only with large, easy-to-read text. Perfect for traditional restaurants.',
    recommended_for: ['Traditional restaurants', 'Family-owned businesses', 'Non-technical users'],
    visible_metrics: [
      'tables_available',
      'todays_reservations',
      'priority_actions',
      'current_occupancy',
      'next_arrivals'
    ],
    hidden_metrics: [
      'ml_confidence',
      'model_version',
      'roc_auc',
      'feature_importance',
      'training_metrics',
      'prediction_accuracy'
    ],
    customizations: {
      risk_display: 'simple',
      show_technical_details: false,
      font_size: 'large',
      notification_level: 'essential'
    }
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced Dashboard',
    description: 'Key metrics plus some insights. Good balance of simplicity and detail.',
    recommended_for: ['Modern restaurants', 'Most restaurant types', 'Growing businesses'],
    visible_metrics: [
      'tables_available',
      'todays_reservations',
      'priority_actions',
      'current_occupancy',
      'next_arrivals',
      'active_services',
      'revenue_today',
      'average_party_size',
      'no_show_rate',
      'peak_hours'
    ],
    hidden_metrics: [
      'ml_confidence',
      'model_version',
      'roc_auc',
      'feature_importance',
      'training_metrics'
    ],
    customizations: {
      risk_display: 'detailed',
      show_technical_details: false,
      font_size: 'medium',
      notification_level: 'essential'
    }
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced Dashboard',
    description: 'Full analytics with ML insights and technical details. For data-driven operators.',
    recommended_for: ['Tech-savvy managers', 'Multi-location chains', 'Data analysts'],
    visible_metrics: [
      'tables_available',
      'todays_reservations',
      'priority_actions',
      'current_occupancy',
      'next_arrivals',
      'active_services',
      'waitlist_count',
      'revenue_today',
      'average_party_size',
      'table_turnover_rate',
      'no_show_rate',
      'cancellation_rate',
      'repeat_customer_rate',
      'peak_hours',
      'average_wait_time',
      'seating_efficiency',
      'ml_confidence',
      'prediction_accuracy'
    ],
    hidden_metrics: [],
    customizations: {
      risk_display: 'technical',
      show_technical_details: true,
      font_size: 'small',
      notification_level: 'all'
    }
  }
};

// ===========================
// Restaurant Characteristic Labels
// ===========================

export const RESTAURANT_TYPE_LABELS: Record<RestaurantType, { name: string; description: string }> = {
  'traditional': {
    name: 'Traditional / Family-Owned',
    description: 'Classic restaurant with traditional approach to service and management'
  },
  'modern': {
    name: 'Modern / Contemporary',
    description: 'Contemporary establishment with modern practices and tech-forward approach'
  },
  'fast-casual': {
    name: 'Fast Casual',
    description: 'Quick service with high table turnover and efficiency focus'
  },
  'fine-dining': {
    name: 'Fine Dining',
    description: 'Upscale dining with longer service times and premium experience'
  }
};

export const SIZE_LABELS: Record<RestaurantSize, { name: string; range: string }> = {
  'small': {
    name: 'Small',
    range: 'Under 30 seats'
  },
  'medium': {
    name: 'Medium',
    range: '30-80 seats'
  },
  'large': {
    name: 'Large',
    range: '80+ seats'
  }
};

export const LOCATION_TYPE_LABELS: Record<LocationType, { name: string; description: string }> = {
  'tourist': {
    name: 'Tourist Area',
    description: 'High tourist traffic, seasonal variations'
  },
  'residential': {
    name: 'Residential Area',
    description: 'Local neighborhood with regular customers'
  },
  'business': {
    name: 'Business District',
    description: 'Office area with weekday lunch crowds'
  },
  'town_center': {
    name: 'Town Center',
    description: 'Central location with diverse clientele'
  }
};

export const PRIMARY_CONCERN_LABELS: Record<PrimaryConcern, { name: string; description: string }> = {
  'no_shows': {
    name: 'Preventing No-Shows',
    description: 'Reduce empty tables from customers who don\'t show up'
  },
  'peak_hours': {
    name: 'Managing Peak Hours',
    description: 'Optimize seating and flow during busy times'
  },
  'regular_customers': {
    name: 'Tracking Regular Customers',
    description: 'Build relationships with repeat guests'
  },
  'table_turnover': {
    name: 'Optimizing Table Turnover',
    description: 'Maximize seating capacity and efficiency'
  },
  'revenue': {
    name: 'Revenue Maximization',
    description: 'Track and optimize financial performance'
  },
  'waitlist': {
    name: 'Waitlist Management',
    description: 'Handle walk-ins and waiting customers effectively'
  }
};
