-- Retention campaigns table
-- Created: 2026-02-04
-- Purpose: Track retention campaigns sent to at-risk customers

CREATE TABLE IF NOT EXISTS retention_campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id TEXT NOT NULL,
  campaign_type TEXT NOT NULL, -- win_back, loyalty_reward, reservation_reminder
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'email', -- email, sms, push
  status TEXT DEFAULT 'pending', -- pending, sent, delivered, opened, converted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  conversion_value DECIMAL(10,2),
  metadata JSONB DEFAULT '{}'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_retention_campaigns_customer ON retention_campaigns(customer_id);
CREATE INDEX IF NOT EXISTS idx_retention_campaigns_status ON retention_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_retention_campaigns_created ON retention_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_campaigns_type ON retention_campaigns(campaign_type);

-- Enable Row Level Security
ALTER TABLE retention_campaigns ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to manage campaigns
CREATE POLICY "Allow authenticated users to manage campaigns"
ON retention_campaigns
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow service role full access
CREATE POLICY "Service role has full access"
ON retention_campaigns
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE retention_campaigns IS 'Stores retention campaign history for at-risk customers';
COMMENT ON COLUMN retention_campaigns.campaign_type IS 'Type: win_back, loyalty_reward, reservation_reminder';
COMMENT ON COLUMN retention_campaigns.status IS 'Status: pending, sent, delivered, opened, converted';
COMMENT ON COLUMN retention_campaigns.conversion_value IS 'Revenue generated if customer converted after campaign';
