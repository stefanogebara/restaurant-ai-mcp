-- =====================================================
-- Restaurant Configuration Table Migration
-- =====================================================
-- Purpose: Store all restaurant-specific configuration for AI phone agent
-- Design: Hybrid approach with columns for queryable data + JSONB for complex structures
-- =====================================================

-- Create enum types for better type safety
CREATE TYPE restaurant_type AS ENUM (
  'fine_dining',
  'casual_dining',
  'fast_casual',
  'cafe',
  'bar',
  'steakhouse',
  'italian',
  'japanese',
  'mexican',
  'other'
);

CREATE TYPE team_member_role AS ENUM (
  'owner',
  'manager',
  'host',
  'staff'
);

CREATE TYPE team_member_status AS ENUM (
  'active',
  'inactive',
  'pending'
);

-- =====================================================
-- Main Table: restaurant_config
-- =====================================================
CREATE TABLE IF NOT EXISTS restaurant_config (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys (assumes you have a users/auth table)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Restaurant Identity (Separate columns for query performance)
  restaurant_name VARCHAR(255) NOT NULL,
  restaurant_type restaurant_type NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  website VARCHAR(500),

  -- Voice Configuration (Simple column)
  voice_id VARCHAR(100) NOT NULL DEFAULT 'default_cartesia_voice',

  -- Business Hours (JSONB - complex structure)
  -- Structure: { "monday": { "is_open": true, "open_time": "09:00", "close_time": "22:00" }, ... }
  business_hours JSONB NOT NULL DEFAULT '{
    "monday": {"is_open": true, "open_time": "09:00", "close_time": "22:00"},
    "tuesday": {"is_open": true, "open_time": "09:00", "close_time": "22:00"},
    "wednesday": {"is_open": true, "open_time": "09:00", "close_time": "22:00"},
    "thursday": {"is_open": true, "open_time": "09:00", "close_time": "22:00"},
    "friday": {"is_open": true, "open_time": "09:00", "close_time": "23:00"},
    "saturday": {"is_open": true, "open_time": "10:00", "close_time": "23:00"},
    "sunday": {"is_open": true, "open_time": "10:00", "close_time": "21:00"}
  }'::jsonb,

  -- Table Configuration (JSONB - nested array structure)
  -- Structure: [
  --   { "area_name": "Indoor", "tables": [{"table_number": "1", "capacity": 4}, ...] },
  --   { "area_name": "Patio", "tables": [...] }
  -- ]
  table_configuration JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Reservation Settings (JSONB - flexible config object)
  reservation_settings JSONB NOT NULL DEFAULT '{
    "advance_booking_days": 30,
    "buffer_time_minutes": 15,
    "cancellation_policy": "24 hours notice required",
    "special_notes": "",
    "max_party_size": 12,
    "min_party_size": 1,
    "require_credit_card": false,
    "allow_waitlist": true
  }'::jsonb,

  -- Operational Settings (Separate columns for common queries)
  average_dining_duration_minutes INTEGER NOT NULL DEFAULT 90,
  max_concurrent_reservations INTEGER DEFAULT 50,

  -- Team Members (JSONB array)
  -- Structure: [
  --   { "email": "manager@restaurant.com", "role": "manager", "status": "active" },
  --   ...
  -- ]
  team_members JSONB DEFAULT '[]'::jsonb,

  -- AI Agent Configuration (JSONB - easy to extend)
  ai_config JSONB DEFAULT '{
    "greeting_message": "Thank you for calling! How may I assist you today?",
    "farewell_message": "Thank you for calling. Have a great day!",
    "language": "en-US",
    "enable_voicemail": false,
    "max_call_duration_minutes": 10,
    "transfer_phone": null
  }'::jsonb,

  -- Status & Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Primary lookup by user_id (most common query pattern)
CREATE INDEX idx_restaurant_config_user_id ON restaurant_config(user_id);

-- Lookup by restaurant identity
CREATE INDEX idx_restaurant_config_email ON restaurant_config(email);
CREATE INDEX idx_restaurant_config_phone ON restaurant_config(phone);

-- Filter by location (for potential multi-location features)
CREATE INDEX idx_restaurant_config_city_country ON restaurant_config(city, country);

-- Filter by type (analytics, grouping)
CREATE INDEX idx_restaurant_config_type ON restaurant_config(restaurant_type);

-- Filter by active status
CREATE INDEX idx_restaurant_config_active ON restaurant_config(is_active) WHERE is_active = true;

-- JSONB GIN indexes for efficient querying of JSON fields
CREATE INDEX idx_restaurant_config_business_hours ON restaurant_config USING GIN (business_hours);
CREATE INDEX idx_restaurant_config_table_configuration ON restaurant_config USING GIN (table_configuration);
CREATE INDEX idx_restaurant_config_reservation_settings ON restaurant_config USING GIN (reservation_settings);
CREATE INDEX idx_restaurant_config_team_members ON restaurant_config USING GIN (team_members);

-- =====================================================
-- Constraints
-- =====================================================

-- Ensure unique restaurant per user (one config per user)
ALTER TABLE restaurant_config
  ADD CONSTRAINT unique_user_restaurant UNIQUE (user_id);

-- Ensure valid email format
ALTER TABLE restaurant_config
  ADD CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Ensure positive values
ALTER TABLE restaurant_config
  ADD CONSTRAINT positive_dining_duration CHECK (average_dining_duration_minutes > 0);

ALTER TABLE restaurant_config
  ADD CONSTRAINT positive_max_reservations CHECK (max_concurrent_reservations > 0);

-- Ensure business_hours has all 7 days
ALTER TABLE restaurant_config
  ADD CONSTRAINT valid_business_hours CHECK (
    business_hours ? 'monday' AND
    business_hours ? 'tuesday' AND
    business_hours ? 'wednesday' AND
    business_hours ? 'thursday' AND
    business_hours ? 'friday' AND
    business_hours ? 'saturday' AND
    business_hours ? 'sunday'
  );

-- =====================================================
-- Trigger for updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON restaurant_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS
ALTER TABLE restaurant_config ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own config
CREATE POLICY "Users can view their own restaurant config"
  ON restaurant_config
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own config (onboarding)
CREATE POLICY "Users can create their own restaurant config"
  ON restaurant_config
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own config
CREATE POLICY "Users can update their own restaurant config"
  ON restaurant_config
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own config
CREATE POLICY "Users can delete their own restaurant config"
  ON restaurant_config
  FOR DELETE
  USING (auth.uid() = user_id);

-- Optional: Service role bypass (for AI agent backend)
-- This allows your backend service to read any config
CREATE POLICY "Service role can read all configs"
  ON restaurant_config
  FOR SELECT
  TO service_role
  USING (true);

-- =====================================================
-- Helper Views (Optional - for easier querying)
-- =====================================================

-- View: Active restaurants with essential info
CREATE OR REPLACE VIEW active_restaurants AS
SELECT
  id,
  user_id,
  restaurant_name,
  restaurant_type,
  city,
  country,
  email,
  phone,
  is_active,
  created_at
FROM restaurant_config
WHERE is_active = true;

-- View: Restaurant with current day business hours
CREATE OR REPLACE VIEW restaurant_today_hours AS
SELECT
  id,
  restaurant_name,
  business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text AS today_hours
FROM restaurant_config
WHERE is_active = true;

-- =====================================================
-- Seed Data (Example - Remove in production)
-- =====================================================

-- Example insert (replace with actual user_id from auth.users)
/*
INSERT INTO restaurant_config (
  user_id,
  restaurant_name,
  restaurant_type,
  city,
  country,
  email,
  phone,
  website,
  voice_id,
  business_hours,
  table_configuration,
  reservation_settings,
  average_dining_duration_minutes,
  team_members,
  onboarding_completed
) VALUES (
  '00000000-0000-0000-0000-000000000000', -- Replace with actual user ID
  'La Bella Vita',
  'italian',
  'San Francisco',
  'USA',
  'contact@labellavita.com',
  '+1-415-555-0123',
  'https://labellavita.com',
  'cartesia_voice_italian_friendly',
  '{
    "monday": {"is_open": false, "open_time": null, "close_time": null},
    "tuesday": {"is_open": true, "open_time": "17:00", "close_time": "22:00"},
    "wednesday": {"is_open": true, "open_time": "17:00", "close_time": "22:00"},
    "thursday": {"is_open": true, "open_time": "17:00", "close_time": "22:00"},
    "friday": {"is_open": true, "open_time": "17:00", "close_time": "23:00"},
    "saturday": {"is_open": true, "open_time": "16:00", "close_time": "23:00"},
    "sunday": {"is_open": true, "open_time": "16:00", "close_time": "21:00"}
  }'::jsonb,
  '[
    {
      "area_name": "Main Dining",
      "tables": [
        {"table_number": "1", "capacity": 2},
        {"table_number": "2", "capacity": 2},
        {"table_number": "3", "capacity": 4},
        {"table_number": "4", "capacity": 4},
        {"table_number": "5", "capacity": 6}
      ]
    },
    {
      "area_name": "Patio",
      "tables": [
        {"table_number": "P1", "capacity": 4},
        {"table_number": "P2", "capacity": 4}
      ]
    }
  ]'::jsonb,
  '{
    "advance_booking_days": 60,
    "buffer_time_minutes": 30,
    "cancellation_policy": "48 hours notice required for parties over 6",
    "special_notes": "We offer gluten-free and vegan options",
    "max_party_size": 8,
    "require_credit_card": true
  }'::jsonb,
  120,
  '[
    {"email": "owner@labellavita.com", "role": "owner", "status": "active"},
    {"email": "manager@labellavita.com", "role": "manager", "status": "active"}
  ]'::jsonb,
  true
);
*/

-- =====================================================
-- Utility Functions
-- =====================================================

-- Function: Check if restaurant is open at specific time
CREATE OR REPLACE FUNCTION is_restaurant_open(
  config_id UUID,
  check_day TEXT,
  check_time TIME
)
RETURNS BOOLEAN AS $$
DECLARE
  day_config JSONB;
  is_open BOOLEAN;
  open_time TIME;
  close_time TIME;
BEGIN
  -- Get the business hours for the specified day
  SELECT business_hours -> LOWER(check_day)
  INTO day_config
  FROM restaurant_config
  WHERE id = config_id;

  -- Extract values
  is_open := (day_config->>'is_open')::boolean;

  IF NOT is_open THEN
    RETURN false;
  END IF;

  open_time := (day_config->>'open_time')::time;
  close_time := (day_config->>'close_time')::time;

  -- Check if time is within operating hours
  RETURN check_time >= open_time AND check_time <= close_time;
END;
$$ LANGUAGE plpgsql;

-- Function: Get total table capacity by area
CREATE OR REPLACE FUNCTION get_area_capacity(
  config_id UUID,
  area_name TEXT
)
RETURNS INTEGER AS $$
DECLARE
  total_capacity INTEGER := 0;
  area_config JSONB;
BEGIN
  -- Find the area in table_configuration
  SELECT jsonb_path_query(
    table_configuration,
    ('$[*] ? (@.area_name == "' || area_name || '").tables[*].capacity')::jsonpath
  )
  INTO area_config
  FROM restaurant_config
  WHERE id = config_id;

  -- Sum all capacities
  SELECT COALESCE(SUM((value::text)::integer), 0)
  INTO total_capacity
  FROM jsonb_array_elements(area_config);

  RETURN total_capacity;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Comments for Documentation
-- =====================================================

COMMENT ON TABLE restaurant_config IS 'Stores all restaurant-specific configuration for AI phone agent';
COMMENT ON COLUMN restaurant_config.business_hours IS 'JSONB object with 7-day schedule: {day: {is_open, open_time, close_time}}';
COMMENT ON COLUMN restaurant_config.table_configuration IS 'JSONB array of areas with tables: [{area_name, tables: [{table_number, capacity}]}]';
COMMENT ON COLUMN restaurant_config.reservation_settings IS 'JSONB object with booking policies and preferences';
COMMENT ON COLUMN restaurant_config.team_members IS 'JSONB array of team members: [{email, role, status}]';
COMMENT ON COLUMN restaurant_config.ai_config IS 'JSONB object with AI agent behavior settings';
