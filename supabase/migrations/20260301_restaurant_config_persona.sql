ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS agent_greeting TEXT;
