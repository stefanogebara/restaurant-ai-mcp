-- POS Integration and Revenue Tracking Migration
-- Date: 2026-01-26
-- Description: Creates tables for POS connections and revenue records

-- ============================================================================
-- POS Connections Table
-- Stores OAuth tokens and connection info for POS systems (Square, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant_info(id) ON DELETE CASCADE,
  pos_provider TEXT NOT NULL DEFAULT 'square',
  merchant_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  location_id TEXT,
  webhook_signature_key TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired', 'error')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, pos_provider)
);

-- Index for quick lookups by restaurant
CREATE INDEX IF NOT EXISTS idx_pos_connections_restaurant ON pos_connections(restaurant_id);

-- ============================================================================
-- Revenue Records Table
-- Stores transaction/revenue data from POS or manual entry
-- ============================================================================
CREATE TABLE IF NOT EXISTS revenue_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant_info(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  customer_phone TEXT,
  customer_name TEXT,
  customer_email TEXT,
  reservation_id TEXT,
  pos_transaction_id TEXT,
  pos_provider TEXT DEFAULT 'manual' CHECK (pos_provider IN ('manual', 'square', 'toast', 'clover', 'other')),
  total_revenue DECIMAL(10,2) NOT NULL CHECK (total_revenue >= 0),
  tip_amount DECIMAL(10,2) DEFAULT 0 CHECK (tip_amount >= 0),
  tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
  party_size INTEGER CHECK (party_size > 0 AND party_size <= 50),
  service_date DATE NOT NULL,
  service_time TIME,
  line_items JSONB DEFAULT '[]'::jsonb,
  payment_method TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'pos_auto', 'pos_sync', 'import')),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_revenue_customer ON revenue_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_revenue_customer_phone ON revenue_records(customer_phone);
CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_records(service_date);
CREATE INDEX IF NOT EXISTS idx_revenue_restaurant ON revenue_records(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_revenue_pos_transaction ON revenue_records(pos_transaction_id);
CREATE INDEX IF NOT EXISTS idx_revenue_reservation ON revenue_records(reservation_id);

-- ============================================================================
-- Customer LTV Cache Table (for faster LTV queries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_ltv (
  customer_id TEXT PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurant_info(id) ON DELETE CASCADE,
  total_visits INTEGER DEFAULT 0,
  first_visit_date DATE,
  last_visit_date DATE,
  avg_days_between_visits DECIMAL(5,1),
  predicted_next_visit_date DATE,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  avg_revenue_per_visit DECIMAL(10,2) DEFAULT 0,
  highest_single_visit_revenue DECIMAL(10,2) DEFAULT 0,
  avg_party_size DECIMAL(3,1),
  favorite_time_slot TEXT,
  favorite_day TEXT,
  customer_tier TEXT DEFAULT 'new' CHECK (customer_tier IN ('vip', 'regular', 'occasional', 'new', 'at_risk')),
  lifetime_value DECIMAL(10,2) DEFAULT 0,
  churn_risk_score DECIMAL(5,1) DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tier-based queries
CREATE INDEX IF NOT EXISTS idx_customer_ltv_tier ON customer_ltv(customer_tier);
CREATE INDEX IF NOT EXISTS idx_customer_ltv_churn ON customer_ltv(churn_risk_score);

-- ============================================================================
-- Functions for automatic timestamp updates
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updated_at
DROP TRIGGER IF EXISTS update_pos_connections_updated_at ON pos_connections;
CREATE TRIGGER update_pos_connections_updated_at
    BEFORE UPDATE ON pos_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_revenue_records_updated_at ON revenue_records;
CREATE TRIGGER update_revenue_records_updated_at
    BEFORE UPDATE ON revenue_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_ltv_updated_at ON customer_ltv;
CREATE TRIGGER update_customer_ltv_updated_at
    BEFORE UPDATE ON customer_ltv
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS Policies (Row Level Security)
-- ============================================================================
ALTER TABLE pos_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ltv ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to pos_connections"
    ON pos_connections
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to revenue_records"
    ON revenue_records
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to customer_ltv"
    ON customer_ltv
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Grant permissions to anon role for API access
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_connections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON revenue_records TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_ltv TO anon;
