-- =====================================================
-- AI Agent Query Patterns
-- =====================================================
-- Common queries the AI phone agent will use at runtime
-- =====================================================

-- =====================================================
-- 1. BASIC CONFIG RETRIEVAL
-- =====================================================

-- Get complete config for authenticated user
SELECT * FROM restaurant_config
WHERE user_id = auth.uid()
  AND is_active = true
LIMIT 1;

-- Get config by restaurant phone number (for incoming calls)
SELECT * FROM restaurant_config
WHERE phone = '+1-415-555-0123'
  AND is_active = true
LIMIT 1;

-- Get only essential info for AI greeting
SELECT
  restaurant_name,
  voice_id,
  ai_config->>'greeting_message' AS greeting,
  ai_config->>'language' AS language
FROM restaurant_config
WHERE user_id = auth.uid();

-- =====================================================
-- 2. BUSINESS HOURS QUERIES
-- =====================================================

-- Check if restaurant is open RIGHT NOW
SELECT
  restaurant_name,
  business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text AS today_hours,
  (business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text ->> 'is_open')::boolean AS is_open_today
FROM restaurant_config
WHERE user_id = auth.uid();

-- Get current day's operating hours
SELECT
  restaurant_name,
  (business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text ->> 'open_time')::time AS opens_at,
  (business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text ->> 'close_time')::time AS closes_at
FROM restaurant_config
WHERE user_id = auth.uid()
  AND (business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text ->> 'is_open')::boolean = true;

-- Get full week schedule (for customer inquiries)
SELECT
  'Monday' AS day,
  business_hours->'monday'->>'is_open' AS is_open,
  business_hours->'monday'->>'open_time' AS open_time,
  business_hours->'monday'->>'close_time' AS close_time
FROM restaurant_config WHERE user_id = auth.uid()
UNION ALL
SELECT 'Tuesday', business_hours->'tuesday'->>'is_open',
  business_hours->'tuesday'->>'open_time', business_hours->'tuesday'->>'close_time'
FROM restaurant_config WHERE user_id = auth.uid()
UNION ALL
SELECT 'Wednesday', business_hours->'wednesday'->>'is_open',
  business_hours->'wednesday'->>'open_time', business_hours->'wednesday'->>'close_time'
FROM restaurant_config WHERE user_id = auth.uid()
UNION ALL
SELECT 'Thursday', business_hours->'thursday'->>'is_open',
  business_hours->'thursday'->>'open_time', business_hours->'thursday'->>'close_time'
FROM restaurant_config WHERE user_id = auth.uid()
UNION ALL
SELECT 'Friday', business_hours->'friday'->>'is_open',
  business_hours->'friday'->>'open_time', business_hours->'friday'->>'close_time'
FROM restaurant_config WHERE user_id = auth.uid()
UNION ALL
SELECT 'Saturday', business_hours->'saturday'->>'is_open',
  business_hours->'saturday'->>'open_time', business_hours->'saturday'->>'close_time'
FROM restaurant_config WHERE user_id = auth.uid()
UNION ALL
SELECT 'Sunday', business_hours->'sunday'->>'is_open',
  business_hours->'sunday'->>'open_time', business_hours->'sunday'->>'close_time'
FROM restaurant_config WHERE user_id = auth.uid();

-- Check if open at specific day/time (using custom function)
SELECT is_restaurant_open(
  (SELECT id FROM restaurant_config WHERE user_id = auth.uid()),
  'friday',
  '19:30'::time
) AS is_open;

-- =====================================================
-- 3. TABLE AVAILABILITY QUERIES
-- =====================================================

-- Get all tables with their capacities
SELECT
  area->>'area_name' AS area,
  table->>'table_number' AS table_number,
  (table->>'capacity')::int AS capacity
FROM restaurant_config,
  jsonb_array_elements(table_configuration) AS area,
  jsonb_array_elements(area->'tables') AS table
WHERE user_id = auth.uid()
ORDER BY area->>'area_name', (table->>'capacity')::int;

-- Find tables that can accommodate party size
SELECT
  area->>'area_name' AS area,
  table->>'table_number' AS table_number,
  (table->>'capacity')::int AS capacity
FROM restaurant_config,
  jsonb_array_elements(table_configuration) AS area,
  jsonb_array_elements(area->'tables') AS table
WHERE user_id = auth.uid()
  AND (table->>'capacity')::int >= 4  -- Party size parameter
ORDER BY (table->>'capacity')::int ASC;

-- Count total tables by area
SELECT
  area->>'area_name' AS area_name,
  jsonb_array_length(area->'tables') AS total_tables,
  SUM((table->>'capacity')::int) AS total_capacity
FROM restaurant_config,
  jsonb_array_elements(table_configuration) AS area,
  jsonb_array_elements(area->'tables') AS table
WHERE user_id = auth.uid()
GROUP BY area->>'area_name';

-- Get capacity for specific area (using custom function)
SELECT get_area_capacity(
  (SELECT id FROM restaurant_config WHERE user_id = auth.uid()),
  'Patio'
) AS patio_capacity;

-- =====================================================
-- 4. RESERVATION SETTINGS QUERIES
-- =====================================================

-- Get all reservation policies (for AI to reference)
SELECT
  reservation_settings->>'advance_booking_days' AS max_advance_days,
  reservation_settings->>'buffer_time_minutes' AS buffer_minutes,
  reservation_settings->>'cancellation_policy' AS cancellation_policy,
  reservation_settings->>'special_notes' AS special_notes,
  (reservation_settings->>'max_party_size')::int AS max_party_size,
  (reservation_settings->>'require_credit_card')::boolean AS requires_card
FROM restaurant_config
WHERE user_id = auth.uid();

-- Check if party size is allowed
SELECT
  CASE
    WHEN $1 <= (reservation_settings->>'max_party_size')::int
      AND $1 >= (reservation_settings->>'min_party_size')::int
    THEN true
    ELSE false
  END AS party_size_allowed,
  reservation_settings->>'max_party_size' AS max_allowed,
  reservation_settings->>'min_party_size' AS min_allowed
FROM restaurant_config
WHERE user_id = auth.uid();
-- Replace $1 with party size (e.g., 6)

-- Calculate buffer time for reservation slot
SELECT
  (reservation_settings->>'buffer_time_minutes')::int AS buffer_minutes,
  average_dining_duration_minutes,
  (average_dining_duration_minutes +
   (reservation_settings->>'buffer_time_minutes')::int) AS total_slot_duration
FROM restaurant_config
WHERE user_id = auth.uid();

-- =====================================================
-- 5. TEAM MEMBER QUERIES
-- =====================================================

-- Get all active team members
SELECT
  member->>'email' AS email,
  member->>'role' AS role,
  member->>'status' AS status
FROM restaurant_config,
  jsonb_array_elements(team_members) AS member
WHERE user_id = auth.uid()
  AND member->>'status' = 'active';

-- Check if email is authorized team member
SELECT EXISTS (
  SELECT 1
  FROM restaurant_config,
    jsonb_array_elements(team_members) AS member
  WHERE user_id = auth.uid()
    AND member->>'email' = 'manager@restaurant.com'
    AND member->>'status' = 'active'
) AS is_authorized;

-- Count team members by role
SELECT
  member->>'role' AS role,
  COUNT(*) AS count
FROM restaurant_config,
  jsonb_array_elements(team_members) AS member
WHERE user_id = auth.uid()
  AND member->>'status' = 'active'
GROUP BY member->>'role';

-- =====================================================
-- 6. AI AGENT CONFIGURATION
-- =====================================================

-- Get AI greeting and voice settings
SELECT
  voice_id,
  ai_config->>'greeting_message' AS greeting,
  ai_config->>'farewell_message' AS farewell,
  ai_config->>'language' AS language,
  (ai_config->>'max_call_duration_minutes')::int AS max_duration
FROM restaurant_config
WHERE user_id = auth.uid();

-- Get transfer phone for escalation
SELECT
  ai_config->>'transfer_phone' AS transfer_number,
  phone AS main_number
FROM restaurant_config
WHERE user_id = auth.uid();

-- =====================================================
-- 7. COMPLETE AI AGENT CONTEXT (Single Query)
-- =====================================================

-- This is the PRIMARY query the AI agent should use
-- Returns everything needed for call handling in one query
SELECT
  -- Identity
  id,
  restaurant_name,
  restaurant_type::text,
  city,
  country,
  phone,
  email,
  website,

  -- Voice & AI
  voice_id,
  ai_config,

  -- Today's hours
  business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text AS today_hours,
  (business_hours -> LOWER(TO_CHAR(NOW(), 'Day'))::text ->> 'is_open')::boolean AS is_open_today,

  -- Full week hours (for customer questions)
  business_hours,

  -- Tables & capacity
  table_configuration,

  -- Reservation policies
  reservation_settings,
  average_dining_duration_minutes,

  -- Team
  team_members,

  -- Metadata
  created_at,
  updated_at
FROM restaurant_config
WHERE user_id = auth.uid()
  AND is_active = true
LIMIT 1;

-- =====================================================
-- 8. UPDATE QUERIES (Configuration Management)
-- =====================================================

-- Update business hours for specific day
UPDATE restaurant_config
SET business_hours = jsonb_set(
  business_hours,
  '{monday}',
  '{"is_open": false, "open_time": null, "close_time": null}'::jsonb
)
WHERE user_id = auth.uid();

-- Add new table to area
UPDATE restaurant_config
SET table_configuration = (
  SELECT jsonb_agg(
    CASE
      WHEN area->>'area_name' = 'Main Dining'
      THEN jsonb_set(
        area,
        '{tables}',
        (area->'tables') || '[{"table_number": "10", "capacity": 4}]'::jsonb
      )
      ELSE area
    END
  )
  FROM jsonb_array_elements(table_configuration) AS area
)
WHERE user_id = auth.uid();

-- Update reservation settings
UPDATE restaurant_config
SET reservation_settings = jsonb_set(
  reservation_settings,
  '{advance_booking_days}',
  '60'::jsonb
)
WHERE user_id = auth.uid();

-- Add new team member
UPDATE restaurant_config
SET team_members = team_members || '[{
  "email": "newhost@restaurant.com",
  "role": "host",
  "status": "active"
}]'::jsonb
WHERE user_id = auth.uid();

-- Update AI greeting message
UPDATE restaurant_config
SET ai_config = jsonb_set(
  ai_config,
  '{greeting_message}',
  '"Welcome to our restaurant! How can I help you today?"'::jsonb
)
WHERE user_id = auth.uid();

-- =====================================================
-- 9. PERFORMANCE MONITORING QUERIES
-- =====================================================

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'restaurant_config'
ORDER BY idx_scan DESC;

-- Check table size
SELECT
  pg_size_pretty(pg_total_relation_size('restaurant_config')) AS total_size,
  pg_size_pretty(pg_relation_size('restaurant_config')) AS table_size,
  pg_size_pretty(pg_indexes_size('restaurant_config')) AS indexes_size;

-- =====================================================
-- 10. ANALYTICS QUERIES (Optional)
-- =====================================================

-- Count restaurants by type
SELECT
  restaurant_type::text,
  COUNT(*) AS count
FROM restaurant_config
WHERE is_active = true
GROUP BY restaurant_type
ORDER BY count DESC;

-- Average dining duration by restaurant type
SELECT
  restaurant_type::text,
  AVG(average_dining_duration_minutes) AS avg_duration,
  MIN(average_dining_duration_minutes) AS min_duration,
  MAX(average_dining_duration_minutes) AS max_duration
FROM restaurant_config
WHERE is_active = true
GROUP BY restaurant_type;

-- Restaurants by location
SELECT
  country,
  city,
  COUNT(*) AS restaurant_count
FROM restaurant_config
WHERE is_active = true
GROUP BY country, city
ORDER BY country, city;
