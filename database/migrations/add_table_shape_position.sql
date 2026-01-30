-- Migration: Add table shape and position columns
-- Purpose: Support floor plan editor with visual table placement
-- Run this SQL in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- Add shape column (round or square)
ALTER TABLE tables
ADD COLUMN IF NOT EXISTS shape VARCHAR(10) DEFAULT 'square';

-- Add fixed seating flag (for booths, sofas - can't move chairs)
ALTER TABLE tables
ADD COLUMN IF NOT EXISTS is_fixed_seating BOOLEAN DEFAULT false;

-- Add joinable configuration
ALTER TABLE tables
ADD COLUMN IF NOT EXISTS is_joinable BOOLEAN DEFAULT true;

ALTER TABLE tables
ADD COLUMN IF NOT EXISTS joinable_with TEXT[] DEFAULT '{}';

-- Add floor plan positioning columns (grid units)
ALTER TABLE tables
ADD COLUMN IF NOT EXISTS position_x INTEGER DEFAULT 0;

ALTER TABLE tables
ADD COLUMN IF NOT EXISTS position_y INTEGER DEFAULT 0;

ALTER TABLE tables
ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 1;

ALTER TABLE tables
ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 1;

ALTER TABLE tables
ADD COLUMN IF NOT EXISTS rotation INTEGER DEFAULT 0;

-- Add check constraint for shape values (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_shape'
    ) THEN
        ALTER TABLE tables
        ADD CONSTRAINT check_shape CHECK (shape IN ('round', 'square'));
    END IF;
END $$;

-- Add check constraint for rotation values (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_rotation'
    ) THEN
        ALTER TABLE tables
        ADD CONSTRAINT check_rotation CHECK (rotation IN (0, 90, 180, 270));
    END IF;
END $$;

-- Create index for floor plan queries (position-based lookups)
CREATE INDEX IF NOT EXISTS idx_tables_position ON tables (position_x, position_y);

-- Add comments for documentation
COMMENT ON COLUMN tables.shape IS 'Table shape: round or square';
COMMENT ON COLUMN tables.is_fixed_seating IS 'True for booths/sofas where chairs cannot be moved';
COMMENT ON COLUMN tables.is_joinable IS 'Whether this table can be combined with other tables';
COMMENT ON COLUMN tables.joinable_with IS 'Array of table IDs that can be combined with this table';
COMMENT ON COLUMN tables.position_x IS 'X position on floor plan grid (grid units)';
COMMENT ON COLUMN tables.position_y IS 'Y position on floor plan grid (grid units)';
COMMENT ON COLUMN tables.width IS 'Width on floor plan grid (grid units, default 1)';
COMMENT ON COLUMN tables.height IS 'Height on floor plan grid (grid units, default 1)';
COMMENT ON COLUMN tables.rotation IS 'Rotation angle: 0, 90, 180, or 270 degrees';
