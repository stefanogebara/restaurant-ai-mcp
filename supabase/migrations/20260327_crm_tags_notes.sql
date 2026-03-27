-- Add tags to customer_ltv
ALTER TABLE restaurant.customer_ltv ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- GIN index for tag filtering
CREATE INDEX IF NOT EXISTS idx_customer_ltv_tags ON restaurant.customer_ltv USING GIN (tags);

-- Customer notes table
CREATE TABLE IF NOT EXISTS restaurant.customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  customer_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_lookup ON restaurant.customer_notes (restaurant_id, customer_id);
