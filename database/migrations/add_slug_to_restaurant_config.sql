-- Add slug column to restaurant_config for public booking URLs
-- URL pattern: /book/:slug

-- Step 1: Add nullable slug column
ALTER TABLE restaurant_config ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- Step 2: Generate slugs from existing restaurant names
UPDATE restaurant_config
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRIM(restaurant_name),
      '[^a-zA-Z0-9\s-]', '', 'g'  -- Remove special chars
    ),
    '\s+', '-', 'g'  -- Replace spaces with hyphens
  )
)
WHERE slug IS NULL;

-- Step 3: Handle duplicate slugs by appending city
UPDATE restaurant_config rc1
SET slug = rc1.slug || '-' || LOWER(REGEXP_REPLACE(rc1.city, '\s+', '-', 'g'))
WHERE EXISTS (
  SELECT 1 FROM restaurant_config rc2
  WHERE rc2.slug = rc1.slug AND rc2.id != rc1.id
);

-- Step 4: Add unique index and not-null constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_config_slug ON restaurant_config(slug);

-- Step 5: Add RLS policy for public read access to slug + basic info
-- This allows unauthenticated users to look up restaurants by slug for booking
CREATE POLICY "Public can view active restaurant by slug"
  ON restaurant_config
  FOR SELECT
  TO anon
  USING (is_active = true AND onboarding_completed = true);
