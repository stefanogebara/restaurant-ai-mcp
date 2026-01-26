-- Intervention Tracking Migration
-- Date: 2026-01-26
-- Description: Adds intervention tracking columns to reservations table

-- ============================================================================
-- Add intervention columns to reservations table
-- ============================================================================
ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS intervention_taken BOOLEAN DEFAULT FALSE;

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS intervention_type TEXT;

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS intervention_notes TEXT;

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS intervention_timestamp TIMESTAMPTZ;

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS intervention_by TEXT;

-- Add constraint for intervention_type values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_intervention_type'
    ) THEN
        ALTER TABLE reservations
        ADD CONSTRAINT check_intervention_type
        CHECK (intervention_type IS NULL OR intervention_type IN (
            'phone_call',
            'sms_reminder',
            'email_reminder',
            'whatsapp_reminder',
            'deposit_required',
            'confirmation_call',
            'automatic_reminder',
            'other'
        ));
    END IF;
END $$;

-- Index for finding reservations with interventions
CREATE INDEX IF NOT EXISTS idx_reservations_intervention ON reservations(intervention_taken, intervention_timestamp);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON COLUMN reservations.intervention_taken IS 'Whether any intervention action was taken for this reservation';
COMMENT ON COLUMN reservations.intervention_type IS 'Type of intervention: phone_call, sms_reminder, deposit_required, etc.';
COMMENT ON COLUMN reservations.intervention_notes IS 'Staff notes about the intervention and customer response';
COMMENT ON COLUMN reservations.intervention_timestamp IS 'When the intervention was performed';
COMMENT ON COLUMN reservations.intervention_by IS 'Name or ID of staff member who performed the intervention';
