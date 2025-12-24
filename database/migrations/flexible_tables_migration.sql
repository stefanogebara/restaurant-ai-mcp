-- =====================================================
-- Flexible Tables Migration
-- =====================================================
-- Purpose: Add support for flexible table combinations
-- Allows restaurants to mark some tables as "fixed" (round tables, booths)
-- while other tables can be combined dynamically based on party size
-- =====================================================

-- Add is_fixed column to tables table
-- Default to false (flexible/can be combined)
ALTER TABLE tables ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT false;

-- Add combination_group for logical table groupings
-- Tables in the same group can potentially be combined
ALTER TABLE tables ADD COLUMN IF NOT EXISTS combination_group VARCHAR(100);

-- Add adjacent_tables for explicit table adjacency relationships
-- Stores an array of table IDs that can be combined with this table
ALTER TABLE tables ADD COLUMN IF NOT EXISTS adjacent_tables UUID[] DEFAULT '{}';

-- Add min_capacity for flexible tables
-- Defaults to 1 (can seat at least 1 person)
ALTER TABLE tables ADD COLUMN IF NOT EXISTS min_capacity INTEGER DEFAULT 1;

-- Add max_capacity for when tables are combined
-- Null means use the standard capacity
ALTER TABLE tables ADD COLUMN IF NOT EXISTS max_capacity INTEGER;

-- Comments for documentation
COMMENT ON COLUMN tables.is_fixed IS 'True = table cannot be combined (round table/booth). False = flexible table that can be merged with adjacent tables.';
COMMENT ON COLUMN tables.combination_group IS 'Logical grouping for combinations (e.g., "main_floor_left"). Tables in same group can be combined.';
COMMENT ON COLUMN tables.adjacent_tables IS 'Array of table UUIDs that can be physically combined with this table.';
COMMENT ON COLUMN tables.min_capacity IS 'Minimum party size for this table (defaults to 1).';
COMMENT ON COLUMN tables.max_capacity IS 'Maximum capacity when combined with adjacent tables (null = use standard capacity).';

-- Create index for efficient flexible table queries
CREATE INDEX IF NOT EXISTS idx_tables_is_fixed ON tables(is_fixed);
CREATE INDEX IF NOT EXISTS idx_tables_combination_group ON tables(combination_group) WHERE combination_group IS NOT NULL;

-- =====================================================
-- Migration Notes:
-- =====================================================
-- After running this migration:
-- 1. All existing tables will default to is_fixed = false (flexible)
-- 2. Restaurants can mark specific tables as fixed in the dashboard
-- 3. The findBestTableCombination function respects is_fixed flag
-- 4. Same location tables can be combined (MVP logic)
-- =====================================================
