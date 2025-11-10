-- Add total_bill field to service_records table
-- This tracks actual revenue per table for ROI calculations

ALTER TABLE service_records
ADD COLUMN IF NOT EXISTS total_bill DECIMAL(10,2) DEFAULT NULL;

COMMENT ON COLUMN service_records.total_bill IS 'Final bill amount for this dining session (€). Used to calculate average revenue per table for ML ROI predictions.';
