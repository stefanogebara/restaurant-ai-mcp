-- Migration: Add metric_profile field to restaurant_info table
-- Date: 2025-11-06
-- Description: Adds metric_profile JSONB column to support customizable dashboard configurations
--              based on restaurant type, size, location, and owner preferences

-- Add metric_profile column to restaurant_info table
ALTER TABLE restaurant_info
ADD COLUMN IF NOT EXISTS metric_profile JSONB DEFAULT jsonb_build_object(
  'template', 'simple',
  'restaurant_type', 'traditional',
  'size', 'medium',
  'location_type', 'residential',
  'primary_concerns', jsonb_build_array('no_shows', 'regular_customers'),
  'visible_metrics', jsonb_build_array(
    'tables_available',
    'todays_reservations',
    'priority_actions',
    'current_occupancy',
    'next_arrivals'
  ),
  'hidden_metrics', jsonb_build_array(
    'ml_confidence',
    'model_version',
    'roc_auc',
    'feature_importance',
    'training_metrics'
  ),
  'customizations', jsonb_build_object(
    'risk_display', 'simple',
    'time_format', '24h',
    'currency', 'EUR',
    'show_technical_details', false,
    'font_size', 'large',
    'language', 'es',
    'color_scheme', 'default',
    'notification_level', 'essential'
  )
);

-- Add comment to document the column structure
COMMENT ON COLUMN restaurant_info.metric_profile IS
'Dashboard configuration profile stored as JSONB. Schema:
{
  "template": "simple" | "balanced" | "advanced",
  "restaurant_type": "traditional" | "modern" | "fast-casual" | "fine-dining",
  "size": "small" | "medium" | "large",
  "location_type": "tourist" | "residential" | "business" | "town_center",
  "primary_concerns": string[],
  "visible_metrics": string[],
  "hidden_metrics": string[],
  "customizations": {
    "risk_display": "simple" | "detailed" | "technical",
    "time_format": "12h" | "24h",
    "currency": string,
    "show_technical_details": boolean,
    "font_size": "small" | "medium" | "large",
    "language": "en" | "es" | "pt" | "fr" | "it",
    "color_scheme": "default" | "high-contrast" | "colorblind",
    "notification_level": "all" | "essential" | "critical"
  }
}';

-- Create GIN index on metric_profile for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_restaurant_info_metric_profile
ON restaurant_info USING GIN (metric_profile);

-- Create specific indexes for commonly queried JSONB keys
CREATE INDEX IF NOT EXISTS idx_restaurant_info_template
ON restaurant_info ((metric_profile->>'template'));

CREATE INDEX IF NOT EXISTS idx_restaurant_info_restaurant_type
ON restaurant_info ((metric_profile->>'restaurant_type'));

-- Update existing restaurants to have default simple profile
UPDATE restaurant_info
SET metric_profile = jsonb_build_object(
  'template', 'simple',
  'restaurant_type', 'traditional',
  'size', 'medium',
  'location_type', 'residential',
  'primary_concerns', jsonb_build_array('no_shows', 'regular_customers'),
  'visible_metrics', jsonb_build_array(
    'tables_available',
    'todays_reservations',
    'priority_actions',
    'current_occupancy',
    'next_arrivals'
  ),
  'hidden_metrics', jsonb_build_array(
    'ml_confidence',
    'model_version',
    'roc_auc',
    'feature_importance',
    'training_metrics'
  ),
  'customizations', jsonb_build_object(
    'risk_display', 'simple',
    'time_format', '24h',
    'currency', 'EUR',
    'show_technical_details', false,
    'font_size', 'large',
    'language', COALESCE(language, 'en'),
    'color_scheme', 'default',
    'notification_level', 'essential'
  )
)
WHERE metric_profile IS NULL;

-- Add check constraint to validate template values
ALTER TABLE restaurant_info
ADD CONSTRAINT check_metric_profile_template
CHECK (
  metric_profile->>'template' IN ('simple', 'balanced', 'advanced')
  OR metric_profile->>'template' IS NULL
);

-- Add check constraint to validate restaurant_type values
ALTER TABLE restaurant_info
ADD CONSTRAINT check_metric_profile_restaurant_type
CHECK (
  metric_profile->>'restaurant_type' IN ('traditional', 'modern', 'fast-casual', 'fine-dining')
  OR metric_profile->>'restaurant_type' IS NULL
);
