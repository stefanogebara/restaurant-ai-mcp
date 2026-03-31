-- Phase 2A: Ticketed Events — Tock-style prepaid reservations
-- Adds event booking columns + event_bookings table

-- 1. Add new columns to restaurant.events
ALTER TABLE restaurant.events
  ADD COLUMN IF NOT EXISTS refund_policy TEXT DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS menu_description TEXT;

COMMENT ON COLUMN restaurant.events.refund_policy IS 'Refund policy: full, partial, none';
COMMENT ON COLUMN restaurant.events.cover_image_url IS 'URL for event cover image';
COMMENT ON COLUMN restaurant.events.menu_description IS 'Menu or experience description shown to guests';

-- 2. Create event_bookings table
CREATE TABLE IF NOT EXISTS restaurant.event_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES restaurant.events(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size >= 1 AND party_size <= 50),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  stripe_payment_intent_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  booking_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (booking_status IN ('confirmed', 'cancelled', 'no_show', 'completed')),
  refund_amount NUMERIC(10,2) DEFAULT 0,
  special_requests TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_event_bookings_event_id
  ON restaurant.event_bookings(event_id);

CREATE INDEX IF NOT EXISTS idx_event_bookings_restaurant_id
  ON restaurant.event_bookings(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_event_bookings_stripe_pi
  ON restaurant.event_bookings(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_bookings_payment_status
  ON restaurant.event_bookings(payment_status);

-- 4. RPC for atomic booking confirmation (prevents overbooking)
CREATE OR REPLACE FUNCTION restaurant.confirm_event_booking(
  p_booking_id UUID,
  p_party_size INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id UUID;
  v_max_capacity INTEGER;
  v_current INTEGER;
  v_updated INTEGER;
BEGIN
  -- Get the event_id from the booking
  SELECT event_id INTO v_event_id
  FROM restaurant.event_bookings
  WHERE id = p_booking_id AND payment_status = 'pending';

  IF v_event_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Atomically increment current_bookings only if capacity allows
  UPDATE restaurant.events
  SET current_bookings = current_bookings + p_party_size,
      updated_at = now()
  WHERE id = v_event_id
    AND is_active = true
    AND (current_bookings + p_party_size) <= max_capacity
  RETURNING current_bookings INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN FALSE; -- capacity exceeded or event inactive
  END IF;

  -- Mark booking as paid
  UPDATE restaurant.event_bookings
  SET payment_status = 'paid',
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;

-- 5. RPC for atomic booking cancellation (decrements capacity)
CREATE OR REPLACE FUNCTION restaurant.cancel_event_booking(
  p_booking_id UUID,
  p_refund_amount NUMERIC DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id UUID;
  v_party_size INTEGER;
  v_payment_status TEXT;
BEGIN
  -- Get booking details
  SELECT event_id, party_size, payment_status
  INTO v_event_id, v_party_size, v_payment_status
  FROM restaurant.event_bookings
  WHERE id = p_booking_id AND booking_status = 'confirmed';

  IF v_event_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Only decrement if payment was confirmed
  IF v_payment_status = 'paid' THEN
    UPDATE restaurant.events
    SET current_bookings = GREATEST(0, current_bookings - v_party_size),
        updated_at = now()
    WHERE id = v_event_id;
  END IF;

  -- Mark booking as cancelled
  UPDATE restaurant.event_bookings
  SET booking_status = 'cancelled',
      payment_status = CASE WHEN p_refund_amount > 0 THEN 'refunded' ELSE payment_status END,
      refund_amount = p_refund_amount,
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;
