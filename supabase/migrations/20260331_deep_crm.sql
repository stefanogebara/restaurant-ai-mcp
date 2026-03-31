-- Deep Guest CRM: profile columns + merge tracking
ALTER TABLE restaurant.customer_ltv
  ADD COLUMN IF NOT EXISTS allergies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seating_preferences TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS special_occasions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS merged_into TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_ltv_allergies ON restaurant.customer_ltv USING GIN (allergies);
CREATE INDEX IF NOT EXISTS idx_customer_ltv_dietary ON restaurant.customer_ltv USING GIN (dietary_restrictions);
CREATE INDEX IF NOT EXISTS idx_customer_ltv_seating ON restaurant.customer_ltv USING GIN (seating_preferences);
