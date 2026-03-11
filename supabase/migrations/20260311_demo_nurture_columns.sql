-- Demo nurture tracking columns for restaurant.restaurant_config
-- Used by api/cron/demo-nurture.js to track which emails have been sent

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS demo_day3_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_day5_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_day7_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurant.restaurant_config.demo_day3_sent_at IS 'Timestamp when the day-3 nurture email was sent (4 days left in trial)';
COMMENT ON COLUMN restaurant.restaurant_config.demo_day5_sent_at IS 'Timestamp when the day-5 nurture email was sent (2 days left in trial)';
COMMENT ON COLUMN restaurant.restaurant_config.demo_day7_sent_at IS 'Timestamp when the day-7 nurture email was sent (last day of trial)';

-- Restaurant intelligence table for refresh-restaurant-profiles cron
-- Stores gathered intelligence data per restaurant for persona generation

CREATE TABLE IF NOT EXISTS public.restaurant_intelligence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  intelligence_type TEXT NOT NULL,  -- 'google_reviews', 'competitor', 'market', etc.
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_gathered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(restaurant_id, intelligence_type)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_intelligence_restaurant 
  ON public.restaurant_intelligence(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_intelligence_gathered 
  ON public.restaurant_intelligence(last_gathered_at DESC);

ALTER TABLE public.restaurant_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to restaurant_intelligence"
  ON public.restaurant_intelligence FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.restaurant_intelligence IS 'Stores gathered intelligence data per restaurant used for AI persona generation';
