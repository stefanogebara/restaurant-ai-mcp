-- Migration: Add language field to restaurant_info table
-- Date: 2025-11-05
-- Description: Adds language preference field to support multi-language functionality

-- Add language column to restaurant_info table
ALTER TABLE restaurant_info
ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'en' CHECK (language IN ('en', 'es', 'pt', 'fr', 'it'));

-- Add comment to document the column
COMMENT ON COLUMN restaurant_info.language IS 'Restaurant preferred language for dashboard and customer communications. Supported values: en (English), es (Spanish), pt (Portuguese), fr (French), it (Italian)';

-- Update existing rows to have default language if null
UPDATE restaurant_info
SET language = 'en'
WHERE language IS NULL;
