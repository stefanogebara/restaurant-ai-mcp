-- Migration: Create survey_responses and events tables
-- Run in Supabase SQL Editor for project: ckforlwdhewexyqljsaf
-- Date: 2026-03-31 (applied + fixed 2026-04-01)

------------------------------------------------------
-- 1. restaurant.survey_responses
------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  customer_phone TEXT,
  customer_name TEXT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_restaurant
  ON restaurant.survey_responses(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_created
  ON restaurant.survey_responses(restaurant_id, created_at DESC);

ALTER TABLE restaurant.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_responses_tenant_isolation"
  ON restaurant.survey_responses
  FOR ALL
  USING (restaurant_id = (current_setting('request.jwt.claims', true)::json->>'restaurant_id')::uuid);

GRANT ALL ON restaurant.survey_responses TO service_role;
GRANT ALL ON restaurant.survey_responses TO authenticated;
GRANT INSERT ON restaurant.survey_responses TO anon;

------------------------------------------------------
-- 2. restaurant.events
------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 720),
  max_capacity INTEGER NOT NULL CHECK (max_capacity >= 1),
  current_bookings INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  refund_policy TEXT DEFAULT 'full',
  cover_image_url TEXT,
  menu_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_restaurant
  ON restaurant.events(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_events_date
  ON restaurant.events(restaurant_id, event_date ASC);

ALTER TABLE restaurant.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_tenant_isolation"
  ON restaurant.events
  FOR ALL
  USING (restaurant_id = (current_setting('request.jwt.claims', true)::json->>'restaurant_id')::uuid);

GRANT ALL ON restaurant.events TO service_role;
GRANT ALL ON restaurant.events TO authenticated;

------------------------------------------------------
-- 3. Add columns to existing tables
------------------------------------------------------
ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS survey_sent_at TIMESTAMPTZ;

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS survey_config JSONB
  DEFAULT '{"enabled": false, "delay_hours": 2, "question": "Como foi sua experiencia?"}'::jsonb;
