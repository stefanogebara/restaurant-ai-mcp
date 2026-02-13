-- Usage Tracking Migration
-- Date: 2026-02-13
-- Description: Creates usage_tracking table for metered billing and the
--              usage_summary view for monthly aggregation.

-- ============================================================================
-- Usage Tracking Table
-- Stores daily counters per restaurant per metric type.
-- Uses UPSERT (ON CONFLICT ... DO UPDATE) to increment counts atomically.
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  period DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Allow UPSERT: one row per restaurant + metric + day
  CONSTRAINT uq_usage_restaurant_metric_period UNIQUE (restaurant_id, metric_type, period)
);

-- Index for date-range queries scoped to a restaurant
CREATE INDEX IF NOT EXISTS idx_usage_tracking_restaurant_period
  ON usage_tracking (restaurant_id, period);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: authenticated users can only see their own restaurant's data
CREATE POLICY "Tenant isolation for usage_tracking"
  ON usage_tracking
  FOR ALL
  TO authenticated
  USING (restaurant_id = (auth.jwt() ->> 'restaurant_id')::uuid)
  WITH CHECK (restaurant_id = (auth.jwt() ->> 'restaurant_id')::uuid);

-- Service role bypass: full access for backend operations
CREATE POLICY "Service role has full access to usage_tracking"
  ON usage_tracking
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grant permissions to anon role for API access
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_tracking TO anon;

-- ============================================================================
-- Usage Summary View
-- Aggregates usage by restaurant, metric type, and calendar month.
-- ============================================================================
CREATE OR REPLACE VIEW usage_summary AS
SELECT
  restaurant_id,
  metric_type,
  date_trunc('month', period)::date AS month,
  SUM(count) AS total_count
FROM usage_tracking
GROUP BY restaurant_id, metric_type, date_trunc('month', period);

-- ============================================================================
-- Upsert Function (called via supabase.rpc)
-- Atomically inserts or increments the daily counter.
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_usage(
  p_restaurant_id UUID,
  p_metric_type VARCHAR(50),
  p_period DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO usage_tracking (restaurant_id, metric_type, period, count)
  VALUES (p_restaurant_id, p_metric_type, p_period, 1)
  ON CONFLICT (restaurant_id, metric_type, period)
  DO UPDATE SET count = usage_tracking.count + 1;
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE usage_tracking IS 'Daily usage counters per restaurant for metered billing';
COMMENT ON COLUMN usage_tracking.metric_type IS 'Usage metric: reservation_created, ai_call_completed, sms_sent, portal_booking, etc.';
COMMENT ON COLUMN usage_tracking.count IS 'Number of occurrences for this metric on the given day';
COMMENT ON COLUMN usage_tracking.period IS 'The calendar day (YYYY-MM-DD) the usage occurred';
COMMENT ON VIEW usage_summary IS 'Monthly aggregation of usage_tracking grouped by restaurant, metric, and month';
