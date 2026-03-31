-- AI Personality expansion: per-restaurant AI personality config
-- Stored as JSONB in restaurant_config for flexibility

ALTER TABLE restaurant.restaurant_config
ADD COLUMN IF NOT EXISTS ai_personality JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN restaurant.restaurant_config.ai_personality IS
  'AI personality config: humor_type, personality_traits, communication_style, verbal_quirks, language_tone';
