-- Migration: Add flexible table support columns
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- Add new columns for flexible table system
ALTER TABLE tables ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT false;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS min_capacity INTEGER;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS max_capacity INTEGER;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS adjacent_tables TEXT[];
ALTER TABLE tables ADD COLUMN IF NOT EXISTS combination_group VARCHAR(50);

-- Set default values for existing tables (flexible by default)
UPDATE tables
SET min_capacity = COALESCE(min_capacity, capacity),
    max_capacity = COALESCE(max_capacity, capacity),
    is_fixed = COALESCE(is_fixed, false);

-- Add comments to explain columns
COMMENT ON COLUMN tables.is_fixed IS 'true = table cannot be combined (round/booth), false = flexible';
COMMENT ON COLUMN tables.min_capacity IS 'Minimum party size for this table';
COMMENT ON COLUMN tables.max_capacity IS 'Maximum when combined with adjacent tables';
COMMENT ON COLUMN tables.adjacent_tables IS 'Array of table IDs that can be combined with this one';
COMMENT ON COLUMN tables.combination_group IS 'Logical grouping for table combinations (e.g., main_floor_left)';
