CREATE TABLE IF NOT EXISTS restaurant.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order NUMERIC(10,2) DEFAULT 0,
  max_uses INTEGER DEFAULT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_coupons_restaurant ON restaurant.coupons(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON restaurant.coupons(restaurant_id, code) WHERE is_active = true;
