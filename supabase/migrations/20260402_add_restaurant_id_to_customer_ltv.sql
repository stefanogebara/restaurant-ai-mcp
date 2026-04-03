-- Add restaurant_id to restaurant.customer_ltv
-- Required for multi-tenancy: each restaurant has its own customer records.
-- The original EU migration created customer_ltv without restaurant_id.
-- All code in customers.js, customerMergeService.js, importPipeline.js,
-- and update-churn-scores.js expects this column to exist.

-- 1. Add the restaurant_id column
ALTER TABLE restaurant.customer_ltv
  ADD COLUMN IF NOT EXISTS restaurant_id UUID;

-- 2. Drop the old UNIQUE constraint on customer_id alone (phone number can appear
--    across multiple restaurants — uniqueness must be scoped per restaurant).
--    The constraint name may vary; drop both possible names safely.
ALTER TABLE restaurant.customer_ltv
  DROP CONSTRAINT IF EXISTS customer_ltv_customer_id_key;

-- 3. Add composite UNIQUE constraint on (customer_id, restaurant_id).
--    This is the conflict target used by the churn-scores upsert cron.
ALTER TABLE restaurant.customer_ltv
  ADD CONSTRAINT customer_ltv_customer_id_restaurant_id_key
  UNIQUE (customer_id, restaurant_id);

-- 4. Add index for fast per-restaurant lookups
CREATE INDEX IF NOT EXISTS idx_customer_ltv_restaurant
  ON restaurant.customer_ltv (restaurant_id);

-- 5. Add FK reference (non-blocking — existing rows with NULL restaurant_id are allowed)
--    We intentionally skip NOT NULL here because existing rows may have NULL restaurant_id.
--    New rows will always have restaurant_id set by application code.
ALTER TABLE restaurant.customer_ltv
  ADD CONSTRAINT fk_customer_ltv_restaurant
  FOREIGN KEY (restaurant_id)
  REFERENCES restaurant.restaurant_config(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
