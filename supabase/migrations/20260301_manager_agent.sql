-- Enable pgvector (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Manager memory store
CREATE TABLE IF NOT EXISTS public.manager_memory (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID        NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN ('fact','episode','insight','preference')),
  category        TEXT        NOT NULL CHECK (category IN ('menu','staff','guest','policy','finance','ops','general')),
  content         TEXT        NOT NULL,
  source          TEXT        NOT NULL CHECK (source IN ('onboarding_interview','document_upload','conversation','system')),
  importance      INT         NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  embedding       vector(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed   TIMESTAMPTZ NOT NULL DEFAULT now(),
  access_count    INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS manager_memory_restaurant_id_idx ON public.manager_memory (restaurant_id);
CREATE INDEX IF NOT EXISTS manager_memory_embedding_idx ON public.manager_memory
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.manager_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manager_memory_restaurant_isolation" ON public.manager_memory
  USING (restaurant_id = (current_setting('request.jwt.claims', true)::jsonb->>'restaurant_id')::uuid);

-- Manager conversation history (shared across app + whatsapp)
CREATE TABLE IF NOT EXISTS public.manager_conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID        NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('manager','assistant')),
  content         TEXT        NOT NULL,
  channel         TEXT        NOT NULL CHECK (channel IN ('app','whatsapp')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manager_conversations_restaurant_id_idx ON public.manager_conversations (restaurant_id);
CREATE INDEX IF NOT EXISTS manager_conversations_created_at_idx   ON public.manager_conversations (restaurant_id, created_at DESC);

ALTER TABLE public.manager_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manager_conversations_restaurant_isolation" ON public.manager_conversations
  USING (restaurant_id = (current_setting('request.jwt.claims', true)::jsonb->>'restaurant_id')::uuid);

-- New columns on restaurant_config for WhatsApp verification + notification preferences
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS manager_phone                TEXT,
  ADD COLUMN IF NOT EXISTS manager_whatsapp_verified    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_whatsapp_code        TEXT,
  ADD COLUMN IF NOT EXISTS notification_preferences     JSONB       NOT NULL DEFAULT '{"end_of_day_briefing":false,"end_of_day_time":"23:00","morning_briefing":false,"morning_briefing_time":"08:00","threshold_alerts":false,"no_show_threshold":20,"occupancy_alert_threshold":90}'::jsonb;

-- Hybrid-ranked memory retrieval RPC
CREATE OR REPLACE FUNCTION match_manager_memories(
  p_restaurant_id UUID,
  p_embedding     vector(1536),
  p_limit         INT DEFAULT 10
)
RETURNS TABLE (
  id          UUID,
  type        TEXT,
  category    TEXT,
  content     TEXT,
  source      TEXT,
  importance  INT,
  similarity  FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, type, category, content, source, importance,
    1 - (embedding <=> p_embedding) AS similarity
  FROM public.manager_memory
  WHERE restaurant_id = p_restaurant_id
    AND embedding IS NOT NULL
  ORDER BY
    (1 - (embedding <=> p_embedding)) * 0.7 +
    (importance::float / 10.0) * 0.3
  DESC
  LIMIT p_limit;
$$;
