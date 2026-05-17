-- Restaurant-learning persistence tables. Code in api/services/learningInterview.js
-- and restaurantIntelligence.js was writing to restaurant.learning_interviews +
-- restaurant.restaurant_intelligence, but only public.restaurant_intelligence (empty,
-- orphaned, wrong shape) existed. /api/restaurant-learning/research therefore
-- returned 500 on every fresh account, blocking onboarding Step 6 entirely.
-- Caught during E2E audit 2026-05-17. Applied to prod via MCP same day.

CREATE TABLE IF NOT EXISTS restaurant.learning_interviews (
  id                    UUID         PRIMARY KEY,
  restaurant_config_id  UUID         NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  status                TEXT         NOT NULL DEFAULT 'in_progress',
  current_topic_index   INTEGER      NOT NULL DEFAULT 0,
  messages              JSONB        NOT NULL DEFAULT '[]'::jsonb,
  extracted_knowledge   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  intelligence_context  TEXT,
  questions_asked       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  answers               JSONB        NOT NULL DEFAULT '{}'::jsonb,
  started_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT learning_interviews_status_check
    CHECK (status IN ('in_progress', 'ready_for_persona', 'completed', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_learning_interviews_restaurant_config_id
  ON restaurant.learning_interviews(restaurant_config_id);
CREATE INDEX IF NOT EXISTS idx_learning_interviews_status
  ON restaurant.learning_interviews(status);

CREATE OR REPLACE FUNCTION restaurant.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_interviews_set_updated_at ON restaurant.learning_interviews;
CREATE TRIGGER learning_interviews_set_updated_at
  BEFORE UPDATE ON restaurant.learning_interviews
  FOR EACH ROW EXECUTE FUNCTION restaurant.set_updated_at();

CREATE TABLE IF NOT EXISTS restaurant.restaurant_intelligence (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_config_id     UUID         NOT NULL UNIQUE REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  intelligence_data        JSONB,
  google_places_data       JSONB,
  website_extraction_data  JSONB,
  search_data              JSONB,
  last_gathered_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_intelligence_config_id
  ON restaurant.restaurant_intelligence(restaurant_config_id);

DROP TRIGGER IF EXISTS restaurant_intelligence_set_updated_at ON restaurant.restaurant_intelligence;
CREATE TRIGGER restaurant_intelligence_set_updated_at
  BEFORE UPDATE ON restaurant.restaurant_intelligence
  FOR EACH ROW EXECUTE FUNCTION restaurant.set_updated_at();

ALTER TABLE restaurant.learning_interviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.restaurant_intelligence ENABLE ROW LEVEL SECURITY;
