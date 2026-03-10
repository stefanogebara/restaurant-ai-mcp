-- AI Strategy Document columns
-- Implements the Karpathy autoresearch loop pattern for restaurant operations
-- ai_strategy_doc: Owner-written strategy document injected into Manager AI + Voice Agent
-- ai_strategy_updated_at: Timestamp of last strategy update

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS ai_strategy_doc TEXT,
  ADD COLUMN IF NOT EXISTS ai_strategy_updated_at TIMESTAMPTZ;
