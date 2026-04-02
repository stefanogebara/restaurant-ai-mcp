-- POS Integration: API Keys & Webhook Subscriptions
-- Phase 5A: API key authentication for external POS systems

-- API keys for POS/external integrations
CREATE TABLE IF NOT EXISTS restaurant.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON restaurant.api_keys (key_hash) WHERE is_active = true;
CREATE INDEX idx_api_keys_restaurant ON restaurant.api_keys (restaurant_id) WHERE is_active = true;

-- Webhook subscriptions for outbound event delivery
CREATE TABLE IF NOT EXISTS restaurant.webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_subs_restaurant ON restaurant.webhook_subscriptions (restaurant_id) WHERE is_active = true;

-- Enable RLS
ALTER TABLE restaurant.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Grant access to roles (GRANT ALL ON ALL TABLES only covers tables that existed at grant time)
GRANT ALL ON restaurant.api_keys TO service_role;
GRANT ALL ON restaurant.webhook_subscriptions TO service_role;
GRANT SELECT ON restaurant.api_keys TO anon, authenticated;
GRANT SELECT ON restaurant.webhook_subscriptions TO anon, authenticated;
