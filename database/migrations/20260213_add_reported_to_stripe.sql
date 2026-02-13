-- Add reported_to_stripe column to usage_tracking
-- Used by the Stripe usage reporter to track which rows have been reported.
-- NULL means unreported; a timestamp means it was reported at that time.

ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS reported_to_stripe TIMESTAMPTZ DEFAULT NULL;

-- Index for finding unreported rows efficiently
CREATE INDEX IF NOT EXISTS idx_usage_tracking_unreported
  ON usage_tracking (restaurant_id, period)
  WHERE reported_to_stripe IS NULL;

COMMENT ON COLUMN usage_tracking.reported_to_stripe IS 'Timestamp when this usage was reported to Stripe metered billing. NULL = unreported.';
