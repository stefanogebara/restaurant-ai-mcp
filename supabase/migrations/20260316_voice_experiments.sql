-- Voice A/B Testing experiments table
CREATE TABLE IF NOT EXISTS restaurant.voice_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'promoted')),
  branch_id TEXT,
  branch_name TEXT NOT NULL,
  parent_version_id TEXT,
  variant_config JSONB NOT NULL DEFAULT '{}',
  traffic_split INTEGER NOT NULL DEFAULT 10 CHECK (traffic_split BETWEEN 1 AND 50),
  deployment_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active experiment per restaurant
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_experiments_active
  ON restaurant.voice_experiments (restaurant_id)
  WHERE status IN ('draft', 'running');

-- RLS
ALTER TABLE restaurant.voice_experiments ENABLE ROW LEVEL SECURITY;
