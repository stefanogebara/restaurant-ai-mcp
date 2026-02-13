-- Add source column to reservations to track booking origin
-- Values: 'manual', 'ai_phone', 'online_portal', 'walk_in', 'whatsapp'

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';

-- Backfill: leave existing as 'manual' (the default)

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_reservations_source ON reservations(source);
